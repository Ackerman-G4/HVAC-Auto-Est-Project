import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Persistence behaviour of the local dev Firestore mock.
 *
 * The store had grown to 35MB on disk, of which 59% was indentation, and it was
 * flushed with writeFileSync — so every mutation blocked the event loop behind a
 * 35MB synchronous write and stalled all in-flight requests.
 *
 * The flush is now compact, async, and staged through a temp file + rename so an
 * interrupted write cannot truncate the database. These cover the properties
 * that are easy to regress and expensive to notice: compactness, atomicity,
 * debouncing, and — the one that would silently lose data — a mutation arriving
 * while a write is already in flight.
 *
 * fs is mocked throughout; no test here touches a real database file.
 */

// Signatures are spelled out so the recorded call tuples stay typed — otherwise
// mock.calls infers as [] and every argument assertion below is a type error.
const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn((_path: string) => false),
  readFileSync: vi.fn((_path: string, _encoding?: string) => '{}'),
  writeFileSync: vi.fn((_path: string, _data: string, _encoding?: string) => undefined),
  renameSync: vi.fn((_from: string, _to: string) => undefined),
  unlinkSync: vi.fn((_path: string) => undefined),
}));

const fspMock = vi.hoisted(() => ({
  writeFile: vi.fn((_path: string, _data: string, _encoding?: string) => Promise.resolve()),
  rename: vi.fn((_from: string, _to: string) => Promise.resolve()),
  unlink: vi.fn((_path: string) => Promise.resolve()),
}));

vi.mock('fs', () => ({ ...fsMock, default: fsMock }));
vi.mock('fs/promises', () => ({ ...fspMock, default: fspMock }));

/** Fresh module instance, so the module-level cache never leaks between tests. */
async function freshDb() {
  vi.resetModules();
  const mod = await import('../local-firestore');
  return mod.getLocalFirestore();
}

/** Run pending debounce timers, then drain the flush promise chain. */
async function settle() {
  await vi.advanceTimersByTimeAsync(150);
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  fsMock.existsSync.mockReturnValue(false);
  fsMock.readFileSync.mockReturnValue('{}');
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('flush payload', () => {
  it('serializes compactly', async () => {
    const db = await freshDb();
    db.collection('projects').doc('p1').set({ name: 'Tower A', floors: 3 });
    await settle();

    const [, payload] = fspMock.writeFile.mock.calls[0];
    expect(payload).toBe('{"projects":{"p1":{"name":"Tower A","floors":3}}}');
    // The regression being pinned: indentation made up most of the old file.
    expect(String(payload)).not.toMatch(/\n {2}/);
  });

  it('round-trips through the parser it will be read back with', async () => {
    const db = await freshDb();
    db.collection('rooms').doc('r1').set({ area: 42.5, tags: ['a', 'b'], nested: { z: null } });
    await settle();

    const [, payload] = fspMock.writeFile.mock.calls[0];
    expect(JSON.parse(String(payload))).toEqual({
      rooms: { r1: { area: 42.5, tags: ['a', 'b'], nested: { z: null } } },
    });
  });
});

describe('flush atomicity', () => {
  it('writes to a temp file and renames it over the database', async () => {
    const db = await freshDb();
    db.collection('projects').doc('p1').set({ name: 'A' });
    await settle();

    const [tmpPath] = fspMock.writeFile.mock.calls[0];
    const [fromPath, toPath] = fspMock.rename.mock.calls[0];

    expect(String(tmpPath)).toMatch(/\.tmp$/);
    expect(fromPath).toBe(tmpPath);
    expect(String(toPath)).toMatch(/\.local-firestore\.json$/);
    // The real database is never partially written.
    expect(String(toPath)).not.toMatch(/\.tmp$/);
  });

  it('does not leave a stale temp file behind when the write fails', async () => {
    fspMock.writeFile.mockRejectedValueOnce(new Error('disk full'));
    const db = await freshDb();
    db.collection('projects').doc('p1').set({ name: 'A' });
    await settle();

    expect(fspMock.rename).not.toHaveBeenCalled();
    expect(fspMock.unlink).toHaveBeenCalled();
  });

  it('retries a failed write rather than dropping it', async () => {
    fspMock.writeFile.mockRejectedValueOnce(new Error('locked'));
    const db = await freshDb();
    db.collection('projects').doc('p1').set({ name: 'A' });
    await settle();
    expect(fspMock.rename).not.toHaveBeenCalled();

    // A later flush must carry the data that the failed one was holding.
    await settle();
    expect(fspMock.rename).toHaveBeenCalled();
    const last = fspMock.writeFile.mock.calls.at(-1)!;
    expect(JSON.parse(String(last[1]))).toEqual({ projects: { p1: { name: 'A' } } });
  });
});

describe('flush scheduling', () => {
  it('coalesces a burst of mutations into a single write', async () => {
    const db = await freshDb();
    for (let i = 0; i < 25; i++) {
      db.collection('rooms').doc(`r${i}`).set({ n: i });
    }
    await settle();

    expect(fspMock.writeFile).toHaveBeenCalledTimes(1);
    expect(Object.keys(JSON.parse(String(fspMock.writeFile.mock.calls[0][1])).rooms)).toHaveLength(25);
  });

  it('does not write when nothing changed', async () => {
    const db = await freshDb();
    db.collection('projects').doc('p1').get();
    await settle();

    expect(fspMock.writeFile).not.toHaveBeenCalled();
  });

  it('persists a mutation that lands while a write is already in flight', async () => {
    // The failure mode this guards: the in-flight write holds a snapshot taken
    // before the late mutation, so without a follow-up flush that mutation is
    // acknowledged in memory but never reaches disk — and is lost on restart.
    let releaseWrite: () => void = () => {};
    fspMock.writeFile.mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseWrite = () => resolve(); }),
    );

    const db = await freshDb();
    db.collection('projects').doc('first').set({ v: 1 });
    await vi.advanceTimersByTimeAsync(150);

    // Mutate while the first write is still open, then let it complete.
    db.collection('projects').doc('second').set({ v: 2 });
    releaseWrite();
    await settle();

    const finalPayload = JSON.parse(String(fspMock.writeFile.mock.calls.at(-1)![1]));
    expect(finalPayload.projects).toHaveProperty('first');
    expect(finalPayload.projects).toHaveProperty('second');
  });
});

describe('reading an existing database', () => {
  it('still parses an indented file written by the previous format', async () => {
    // Pre-existing dev databases are pretty-printed; they must load unchanged.
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ projects: { p1: { name: 'Legacy' } } }, null, 2));

    const db = await freshDb();
    const snap = db.collection('projects').doc('p1').get();

    expect((await snap).data()).toEqual({ name: 'Legacy' });
  });

  it('tolerates a UTF-8 BOM', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('﻿' + JSON.stringify({ projects: { p1: { name: 'BOM' } } }));

    const db = await freshDb();
    const snap = await db.collection('projects').doc('p1').get();

    expect(snap.data()).toEqual({ name: 'BOM' });
  });
});
