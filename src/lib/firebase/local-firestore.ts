/**
 * JSON-file-backed Firestore mock for local development.
 * Supports the subset of Firestore API used by:
 *   - projects-store.ts
 *   - project-estimation-store.ts
 *   - catalog-store.ts
 *
 * Data persisted to .local-firestore.json at workspace root.
 */
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs';
import { writeFile, rename, unlink } from 'fs/promises';
import { join } from 'path';

const DB_FILE = join(process.cwd(), '.local-firestore.json');
// Written first, then renamed over DB_FILE. rename(2) is atomic within a
// filesystem, so an interrupted flush cannot leave a half-written database.
const DB_TMP_FILE = `${DB_FILE}.tmp`;

type DocData = Record<string, unknown>;

interface Store {
  [collection: string]: {
    [docId: string]: DocData;
  };
}

// ── Persistence ────────────────────────────────────────────
//
// The whole DB lives in a single JSON file. Re-reading and re-parsing it on
// every get/set/query does not scale — a large file makes each request pay
// the full parse+serialize cost. So we keep the parsed store in memory
// (single-process dev server) and:
//   - serve reads from the in-memory cache (parse the file at most once), and
//   - coalesce writes behind a short debounce so a burst of mutations (e.g.
//     seeding many rooms) flushes to disk a few times instead of once per op.
// A synchronous flush on process exit guarantees the last writes land.
//
// Two details matter once the database gets large (a few simulation cases carry
// mesh arrays and push it into the tens of MB):
//
//   - Serialize compactly. Indenting made whitespace 59% of the file, so it
//     inflated every read, every write and every byte on disk ~2.5x to produce
//     something far too big to read by hand anyway.
//   - Flush off the request path. writeFileSync blocks the event loop, so a
//     flush of that size stalled *every* in-flight request behind it. The
//     debounced flush is async; only the exit hook stays synchronous, because
//     'exit' handlers cannot await.

let _cache: Store | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _dirty = false;
let _exitHookInstalled = false;
let _flushInFlight: Promise<void> | null = null;

function loadFromDisk(): Store {
  if (!existsSync(DB_FILE)) return {};
  try {
    let raw = readFileSync(DB_FILE, 'utf-8');
    // Strip UTF-8 BOM if present (e.g. from PowerShell Set-Content)
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

/** Synchronous flush. Only for process exit, where awaiting is not possible. */
function flushToDiskSync(): void {
  if (!_dirty || _cache === null) return;
  try {
    writeFileSync(DB_TMP_FILE, JSON.stringify(_cache), 'utf-8');
    renameSync(DB_TMP_FILE, DB_FILE);
    _dirty = false;
  } catch {
    // Leave _dirty set so a later flush retries.
    try { unlinkSync(DB_TMP_FILE); } catch { /* nothing to clean up */ }
  }
}

/**
 * Flush without blocking the event loop, so requests are not stalled behind a
 * large write. Serializing is synchronous on purpose: it snapshots the store in
 * one turn, so a mutation arriving mid-write cannot tear the payload. Anything
 * that lands during the write re-marks `_dirty` and is picked up by the
 * follow-up flush below.
 */
async function flushToDisk(): Promise<void> {
  if (!_dirty || _cache === null) return;
  if (_flushInFlight) return _flushInFlight;

  const payload = JSON.stringify(_cache);
  _dirty = false;

  _flushInFlight = (async () => {
    try {
      await writeFile(DB_TMP_FILE, payload, 'utf-8');
      await rename(DB_TMP_FILE, DB_FILE);
    } catch {
      _dirty = true; // Retry on the next flush.
      try { await unlink(DB_TMP_FILE); } catch { /* nothing to clean up */ }
    } finally {
      _flushInFlight = null;
    }
  })();

  await _flushInFlight;

  // A mutation that arrived while the write was in flight is still unwritten.
  if (_dirty) scheduleFlush();
}

function installExitHook(): void {
  if (_exitHookInstalled) return;
  _exitHookInstalled = true;
  const finalize = () => {
    if (_flushTimer) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
    flushToDiskSync();
  };
  process.once('exit', finalize);
  process.once('SIGINT', () => { finalize(); process.exit(0); });
  process.once('SIGTERM', () => { finalize(); process.exit(0); });
}

function readStore(): Store {
  if (_cache === null) {
    _cache = loadFromDisk();
    installExitHook();
  }
  return _cache;
}

function scheduleFlush(): void {
  if (_flushTimer !== null) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    void flushToDisk();
  }, 100);
  // Do not keep the event loop alive solely for a pending flush.
  if (typeof _flushTimer === 'object' && typeof _flushTimer.unref === 'function') {
    _flushTimer.unref();
  }
}

function writeStore(store: Store): void {
  _cache = store;
  _dirty = true;
  installExitHook();
  scheduleFlush();
}

// ── Mock Document Snapshot ─────────────────────────────────

class LocalDocSnapshot {
  private _colName: string;
  readonly id: string;
  private _data: DocData | undefined;

  constructor(colName: string, id: string, data: DocData | undefined) {
    this._colName = colName;
    this.id = id;
    this._data = data;
  }

  get exists(): boolean {
    return this._data !== undefined;
  }

  data(): DocData | undefined {
    return this._data;
  }

  get ref() {
    return new LocalDocRef(this._colName, this.id);
  }
}

// ── Mock Query Snapshot ────────────────────────────────────

class LocalQuerySnapshot {
  readonly docs: LocalDocSnapshot[];

  constructor(docs: LocalDocSnapshot[]) {
    this.docs = docs;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(cb: (doc: LocalDocSnapshot) => void): void {
    this.docs.forEach(cb);
  }
}

// ── Comparison helpers ─────────────────────────────────────

function matchesOp(docVal: unknown, op: string, queryVal: unknown): boolean {
  switch (op) {
    case '==':
      return docVal === queryVal;
    case '!=':
      return docVal !== queryVal;
    case '<':
      return (docVal as number) < (queryVal as number);
    case '<=':
      return (docVal as number) <= (queryVal as number);
    case '>':
      return (docVal as number) > (queryVal as number);
    case '>=':
      return (docVal as number) >= (queryVal as number);
    case 'in':
      return Array.isArray(queryVal) && queryVal.includes(docVal);
    default:
      return false;
  }
}

// ── Mock Query ─────────────────────────────────────────────

interface WhereClause {
  field: string;
  op: string;
  value: unknown;
}

interface OrderClause {
  field: string;
  direction: string;
}

class LocalQuery {
  private colName: string;
  private wheres: WhereClause[];
  private orders: OrderClause[];
  private limitN: number;

  constructor(
    colName: string,
    wheres: WhereClause[] = [],
    orders: OrderClause[] = [],
    limitN = Infinity,
  ) {
    this.colName = colName;
    this.wheres = wheres;
    this.orders = orders;
    this.limitN = limitN;
  }

  where(field: string, op: string, value: unknown): LocalQuery {
    return new LocalQuery(
      this.colName,
      [...this.wheres, { field, op, value }],
      this.orders,
      this.limitN,
    );
  }

  orderBy(field: string, direction: string = 'asc'): LocalQuery {
    return new LocalQuery(
      this.colName,
      this.wheres,
      [...this.orders, { field, direction }],
      this.limitN,
    );
  }

  limit(n: number): LocalQuery {
    return new LocalQuery(this.colName, this.wheres, this.orders, n);
  }

  async get(): Promise<LocalQuerySnapshot> {
    const store = readStore();
    const col = store[this.colName] || {};

    let docs = Object.entries(col)
      .map(([id, data]) => ({ id, data }))
      .filter(({ data }) => this.wheres.every((w) => matchesOp(data[w.field], w.op, w.value)));

    // Sort
    for (const order of this.orders) {
      docs.sort((a, b) => {
        const va = a.data[order.field];
        const vb = b.data[order.field];
        if (va === vb) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = va < vb ? -1 : 1;
        return order.direction === 'desc' ? -cmp : cmp;
      });
    }

    if (this.limitN < docs.length) {
      docs = docs.slice(0, this.limitN);
    }

    return new LocalQuerySnapshot(
      docs.map((d) => new LocalDocSnapshot(this.colName, d.id, d.data)),
    );
  }
}

// ── Mock Document Reference ────────────────────────────────

class LocalDocRef {
  readonly id: string;
  private colName: string;

  constructor(colName: string, id: string) {
    this.colName = colName;
    this.id = id;
  }

  async get(): Promise<LocalDocSnapshot> {
    const store = readStore();
    const data = store[this.colName]?.[this.id];
    return new LocalDocSnapshot(this.colName, this.id, data);
  }

  collection(name: string): LocalCollectionRef {
    return new LocalCollectionRef(`${this.colName}/${this.id}/${name}`);
  }

  async set(data: DocData, options?: { merge?: boolean }): Promise<void> {
    const store = readStore();
    const collection = (store[this.colName] ??= {});
    const existing = collection[this.id];

    collection[this.id] =
      options?.merge && existing ? { ...existing, ...data } : { ...data };
    writeStore(store);
  }

  async update(data: DocData): Promise<void> {
    const store = readStore();
    const collection = (store[this.colName] ??= {});
    collection[this.id] = { ...collection[this.id], ...data };
    writeStore(store);
  }

  async delete(): Promise<void> {
    const store = readStore();
    const collection = store[this.colName];
    if (collection) {
      delete collection[this.id];
      writeStore(store);
    }
  }
}

// ── Mock Batch ─────────────────────────────────────────────

interface BatchOp {
  type: 'set' | 'delete';
  colName: string;
  docId: string;
  data?: DocData | undefined;
  options?: { merge?: boolean } | undefined;
}

class LocalBatch {
  private ops: BatchOp[] = [];

  set(ref: LocalDocRef, data: DocData, options?: { merge?: boolean }): void {
    this.ops.push({
      type: 'set',
      colName: (ref as unknown as { colName: string }).colName,
      docId: ref.id,
      data,
      options,
    });
  }

  delete(ref: LocalDocRef): void {
    this.ops.push({
      type: 'delete',
      colName: (ref as unknown as { colName: string }).colName,
      docId: ref.id,
    });
  }

  async commit(): Promise<void> {
    const store = readStore();
    for (const op of this.ops) {
      const collection = (store[op.colName] ??= {});
      if (op.type === 'set' && op.data) {
        const existing = collection[op.docId];
        collection[op.docId] =
          op.options?.merge && existing ? { ...existing, ...op.data } : { ...op.data };
      } else if (op.type === 'delete') {
        delete collection[op.docId];
      }
    }
    writeStore(store);
  }
}

// ── Mock Collection Reference ──────────────────────────────

class LocalCollectionRef extends LocalQuery {
  private _colName: string;

  constructor(colName: string) {
    super(colName);
    this._colName = colName;
  }

  doc(id: string): LocalDocRef {
    return new LocalDocRef(this._colName, id);
  }

  async listDocuments(): Promise<LocalDocRef[]> {
    const store = readStore();
    const col = store[this._colName] || {};
    return Object.keys(col).map((id) => new LocalDocRef(this._colName, id));
  }
}

// ── Mock Firestore ─────────────────────────────────────────

class LocalFirestore {
  collection(name: string): LocalCollectionRef {
    return new LocalCollectionRef(name);
  }

  /**
   * Resolve a slash-separated document path, matching the real Firestore
   * `db.doc('projects/{id}/simulationLayouts/{floorId}')` signature. Subcollection
   * paths are flattened onto the backing store by using every segment except the
   * trailing document id as the collection key, so nested docs stay namespaced
   * per parent. Firestore requires an even segment count for a document path.
   */
  doc(path: string): LocalDocRef {
    const segments = path.split('/').filter(Boolean);

    if (segments.length < 2 || segments.length % 2 !== 0) {
      throw new Error(
        `Invalid Firestore document path "${path}": expected an even number of segments (collection/doc[/collection/doc…]).`,
      );
    }

    const id = segments[segments.length - 1];
    const collectionPath = segments.slice(0, -1).join('/');
    return new LocalDocRef(collectionPath, id);
  }

  batch(): LocalBatch {
    return new LocalBatch();
  }
}

// Singleton
let _instance: LocalFirestore | null = null;

export function getLocalFirestore(): LocalFirestore {
  if (!_instance) {
    _instance = new LocalFirestore();
  }
  return _instance;
}

export function isLocalFirestoreMode(): boolean {
  const authMode = process.env.AUTH_MODE?.trim().toLowerCase();

  // No Firebase credentials configured → use local store
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64;
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;

  // Local auth mode should prefer local JSON storage unless an explicit emulator host is provided.
  if (authMode === 'local' && !emulator?.trim()) {
    return true;
  }

  // If emulator host is set but no credentials, still use local if the emulator isn't actually running
  if (saJson?.trim()) return false;
  if (projectId?.trim() && clientEmail?.trim() && privateKey?.trim()) return false;
  if (gac?.trim()) return false;
  // If emulator is configured, let Firebase SDK try it
  if (emulator?.trim()) return false;

  return true;
}
