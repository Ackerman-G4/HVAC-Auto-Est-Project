import { describe, expect, it, vi } from 'vitest';
import { generateBoqForProject, type GenerateBoqDeps } from '../generate-boq';

/**
 * Bill of quantities generation, extracted from a 469-line route by TASK 3.2.
 *
 * The branch that matters most here is "no equipment selected": generating an
 * empty bill replaces a real one, so it has to refuse before any write. Inside
 * the route that ordering was only observable through an HTTP request.
 */

const project = {
  id: 'p1',
  suggestedVatRate: 0.12,
  suggestedOverheadPercent: 0.15,
  suggestedContingencyPercent: 0.05,
  suggestedLaborMultiplier: 0.35,
};

const selection = {
  roomId: 'room-1',
  quantity: 2,
  equipment: {
    manufacturer: 'Acme', model: 'AC-5', type: 'cassette',
    capacityTR: 5, capacityBTU: 60000, capacityKW: 17.6,
    refrigerant: 'R32', eer: 12, unitPricePHP: 100000,
  },
};

const floors = [{ name: 'Level 1', rooms: [{ id: 'room-1', area: 120 }] }];

const compiled = {
  items: [
    { section: 'A', description: '5 TR Cassette', quantity: 2, unit: 'set',
      unitPrice: 100000, totalPrice: 200000, category: 'equipment', specification: '' },
  ],
  grandTotal: 260000,
};

/** Fixtures are structural subsets, so overrides are cast at the boundary. */
type DepsOverride = Partial<Record<keyof GenerateBoqDeps, unknown>>;

function makeDeps(over: DepsOverride = {}) {
  const calls: string[] = [];
  const record = <T>(name: string, value: T) => { calls.push(name); return value; };

  const deps = {
    getProjectRecord: vi.fn(async () => project),
    getFloorsWithRooms: vi.fn(async () => floors),
    listSelectedEquipmentForProject: vi.fn(async () => [selection]),
    replaceBoqItemsForProject: vi.fn(async () => record('replace', undefined)),
    listBoqItemsForProject: vi.fn(async () => record('listStored', compiled.items)),
    updateProjectRecord: vi.fn(async () => record('updateProject', undefined)),
    createBoqSnapshot: vi.fn(async () => record('snapshot', {
      id: 's1', algorithm: 'sha256', itemCount: 1, grandTotalPhp: 260000,
      deltaPhp: 0, createdAt: '2026-01-01T00:00:00.000Z',
    })),
    writeAuditLog: vi.fn(async () => record('audit', undefined)),
    compileBOQ: vi.fn(() => compiled),
    computeBoqHash: vi.fn(() => 'hash-abc'),
    ...over,
  } as unknown as GenerateBoqDeps;

  return { deps, calls };
}

const params = { projectId: 'p1', actorId: 'user-1' };

describe('generation refuses before it writes', () => {
  it('refuses a project that does not exist', async () => {
    const { deps } = makeDeps({ getProjectRecord: vi.fn(async () => null) });
    const result = await generateBoqForProject(deps, params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PROJECT_NOT_FOUND');
    expect(deps.replaceBoqItemsForProject).not.toHaveBeenCalled();
  });

  it('refuses when nothing is selected, rather than storing an empty bill', async () => {
    // replaceBoqItemsForProject is a replace: an empty compile would wipe a
    // real bill of quantities and report success.
    const { deps } = makeDeps({ listSelectedEquipmentForProject: vi.fn(async () => []) });
    const result = await generateBoqForProject(deps, params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_EQUIPMENT');
    expect(deps.replaceBoqItemsForProject).not.toHaveBeenCalled();
    expect(deps.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('a successful generation persists, snapshots, then audits', () => {
  it('writes in an order where the snapshot attests to stored rows', async () => {
    const { deps, calls } = makeDeps();
    const result = await generateBoqForProject(deps, params);

    expect(result.ok).toBe(true);
    // The hash must be taken from what was stored, not what was compiled, so
    // listStored has to follow replace and precede snapshot.
    expect(calls).toEqual(['replace', 'updateProject', 'listStored', 'snapshot', 'audit']);
  });

  it('hashes the rows read back from the store', async () => {
    const { deps } = makeDeps();
    await generateBoqForProject(deps, params);

    expect(deps.computeBoqHash).toHaveBeenCalledWith(compiled.items);
    expect(vi.mocked(deps.createBoqSnapshot).mock.calls[0][0].boqHash).toBe('hash-abc');
  });

  it('compiles once per floor plus once overall', async () => {
    // One floor here, so twice. Compiling only per floor and summing would
    // apply overhead, contingency and VAT once per floor.
    const { deps } = makeDeps();
    await generateBoqForProject(deps, params);
    expect(deps.compileBOQ).toHaveBeenCalledTimes(2);
  });

  it('passes the resolved policy into every compile', async () => {
    const { deps } = makeDeps();
    await generateBoqForProject(deps, params);

    const input = vi.mocked(deps.compileBOQ).mock.calls[0][0];
    expect(input.vatRate).toBe(0.12);
    expect(input.overheadPercent).toBe(0.15);
  });

  it('honours a project override over its suggestion', async () => {
    const { deps } = makeDeps({
      getProjectRecord: vi.fn(async () => ({ ...project, vatRateOverride: 0 })),
    });
    await generateBoqForProject(deps, params);

    // A VAT-exempt project must not be charged the 12% default.
    expect(vi.mocked(deps.compileBOQ).mock.calls[0][0].vatRate).toBe(0);
  });

  it('tags each stored item with the floor it belongs to', async () => {
    const { deps } = makeDeps();
    await generateBoqForProject(deps, params);

    const stored = vi.mocked(deps.replaceBoqItemsForProject).mock.calls[0][1];
    expect(stored[0].notes).toBe('Level 1');
  });

  it('labels equipment in a room no floor claims as Unassigned', async () => {
    const { deps } = makeDeps({ getFloorsWithRooms: vi.fn(async () => []) });
    await generateBoqForProject(deps, params);

    const stored = vi.mocked(deps.replaceBoqItemsForProject).mock.calls[0][1];
    expect(stored[0].notes).toBe('Unassigned');
  });

  it('records the total floor area it derived', async () => {
    const { deps } = makeDeps();
    await generateBoqForProject(deps, params);

    const patch = vi.mocked(deps.updateProjectRecord).mock.calls[0][1];
    expect(patch.totalFloorArea).toBe(120);
    expect(patch.isBoqStale).toBe(false);
  });
});
