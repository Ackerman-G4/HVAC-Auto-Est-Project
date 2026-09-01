import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * The BOQ generation pipeline.
 *
 * Extracted from the route's POST (TASK 3.2), where it was reachable only
 * through an authenticated request against a live Firestore. The ordering it
 * enforces matters: rows are replaced, then the project is stamped, then the
 * rows are re-read and hashed, then a snapshot and audit entry are written. A
 * snapshot that attested to the compiled figures rather than the stored ones
 * would be a hash of something no later reader will find.
 *
 * `cost-engine` is mocked. What is under test is the pipeline, not the pricing
 * arithmetic, which has its own golden test.
 */

const compileBOQ = vi.hoisted(() => vi.fn());
const estimateDiffusersFromDucts = vi.hoisted(() => vi.fn(() => []));
const computeBoqHash = vi.hoisted(() => vi.fn(() => 'hash-abc'));

vi.mock('@/lib/functions/cost-engine', () => ({ compileBOQ, estimateDiffusersFromDucts }));
vi.mock('@/lib/functions/boq-integrity', () => ({ computeBoqHash }));

const { generateProjectBoq, totalFloorAreaM2, BOQ_GENERATION_STATUS } = await import(
  '../boq-generation'
);

import type { BoqGenerationDeps } from '../boq-generation';
import { resolvePricingPolicy } from '../pricing-policy';

const policy = resolvePricingPolicy(null);

const compiledItem = {
  section: 'A',
  description: '3 TR ducted split',
  specification: '',
  quantity: 1,
  unit: 'set',
  unitPrice: 100_000,
  totalPrice: 100_000,
  category: 'equipment',
};

const equipment = {
  manufacturer: 'Daikin',
  model: 'FDMF100',
  type: 'ducted_split',
  capacityTR: 3,
  capacityBTU: 36000,
  capacityKW: 10.5,
  refrigerant: 'R32',
  eer: 11,
  unitPricePHP: 100_000,
};

interface Recorded {
  order: string[];
  replacedRows: Record<string, unknown>[];
  projectPatch: Record<string, unknown> | null;
  snapshotInput: Record<string, unknown> | null;
  auditEntry: Record<string, unknown> | null;
}

function makeDeps(overrides: Partial<BoqGenerationDeps> = {}) {
  const recorded: Recorded = {
    order: [],
    replacedRows: [],
    projectPatch: null,
    snapshotInput: null,
    auditEntry: null,
  };

  const deps: BoqGenerationDeps = {
    getFloorsWithRooms: async () => [
      { name: 'Ground Floor', rooms: [{ id: 'room-1', area: 50 }] },
    ],
    listSelectedEquipmentForProject: async () => [{ equipment, quantity: 2, roomId: 'room-1' }],
    replaceBoqItemsForProject: async (_projectId, rows) => {
      recorded.order.push('replace');
      recorded.replacedRows = rows;
    },
    listBoqItemsForProject: async () => {
      recorded.order.push('reread');
      return [];
    },
    updateProjectRecord: async (_projectId, patch) => {
      recorded.order.push('stamp');
      recorded.projectPatch = patch;
    },
    createBoqSnapshot: async (input) => {
      recorded.order.push('snapshot');
      recorded.snapshotInput = { ...input };
      return {
        id: 'snap-1',
        projectId: input.projectId,
        eventType: input.eventType,
        algorithm: 'SHA-256',
        boqHash: input.boqHash,
        itemCount: input.itemCount,
        grandTotalPhp: input.grandTotalPhp,
        deltaPhp: 0,
        triggeredBy: input.triggeredBy,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
    },
    writeAuditLog: async (entry) => {
      recorded.order.push('audit');
      recorded.auditEntry = { ...entry };
    },
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };

  return { deps, recorded };
}

const request = { projectId: 'project-1', policy, actorId: 'user-1' };

beforeEach(() => {
  compileBOQ.mockReset().mockReturnValue({ items: [compiledItem], grandTotal: 250_000 });
  computeBoqHash.mockReset().mockReturnValue('hash-abc');
});

describe('a project with no equipment selected', () => {
  it('is refused rather than producing an empty bill', async () => {
    // An empty bill would overwrite a real one with nothing and record a
    // snapshot attesting to it.
    const { deps } = makeDeps({ listSelectedEquipmentForProject: async () => [] });
    const outcome = await generateProjectBoq(deps, request);

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toBe('NO_EQUIPMENT');
  });

  it('writes nothing at all when refused', async () => {
    const { deps, recorded } = makeDeps({ listSelectedEquipmentForProject: async () => [] });
    await generateProjectBoq(deps, request);
    expect(recorded.order).toEqual([]);
  });

  it('maps the refusal to a bad request, not a server error', () => {
    expect(BOQ_GENERATION_STATUS.NO_EQUIPMENT).toBe(400);
  });
});

describe('generating a bill', () => {
  it('replaces rows, stamps the project, re-reads, then records', async () => {
    const { deps, recorded } = makeDeps();
    const outcome = await generateProjectBoq(deps, request);

    expect(outcome.ok).toBe(true);
    expect(recorded.order).toEqual(['replace', 'stamp', 'reread', 'snapshot', 'audit']);
  });

  it('hashes the rows as stored, not as compiled', async () => {
    // The snapshot has to attest to what a later reader will actually find.
    const stored = [{ id: 'stored-1' }];
    const { deps, recorded } = makeDeps({
      listBoqItemsForProject: async () => {
        recorded.order.push('reread');
        return stored as never;
      },
    });
    await generateProjectBoq(deps, request);

    expect(computeBoqHash).toHaveBeenCalledWith(stored);
  });

  it('compiles once per floor plus once overall', async () => {
    // Two floors: two per-floor compiles and one overall.
    const { deps } = makeDeps({
      getFloorsWithRooms: async () => [
        { name: 'Ground Floor', rooms: [{ id: 'room-1', area: 50 }] },
        { name: 'Second Floor', rooms: [{ id: 'room-2', area: 40 }] },
      ],
      listSelectedEquipmentForProject: async () => [
        { equipment, quantity: 1, roomId: 'room-1' },
        { equipment, quantity: 1, roomId: 'room-2' },
      ],
    });
    await generateProjectBoq(deps, request);

    expect(compileBOQ).toHaveBeenCalledTimes(3);
  });

  it('labels a selection whose room is on no floor rather than dropping it', async () => {
    // Dropping it would silently understate the bill.
    const { deps, recorded } = makeDeps({
      getFloorsWithRooms: async () => [],
      listSelectedEquipmentForProject: async () => [
        { equipment, quantity: 1, roomId: 'orphan-room' },
      ],
    });
    const outcome = await generateProjectBoq(deps, request);

    expect(outcome.ok).toBe(true);
    expect(recorded.replacedRows[0]?.notes).toBe('Unassigned');
  });

  it('marks the bill fresh and records when it was generated', async () => {
    const { deps, recorded } = makeDeps();
    await generateProjectBoq(deps, request);

    expect(recorded.projectPatch).toMatchObject({
      isBoqStale: false,
      lastBoqGeneratedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('records the total conditioned area across every floor', async () => {
    const { deps, recorded } = makeDeps({
      getFloorsWithRooms: async () => [
        { name: 'Ground Floor', rooms: [{ id: 'room-1', area: 50 }, { id: 'room-2', area: 30 }] },
        { name: 'Second Floor', rooms: [{ id: 'room-3', area: 20 }] },
      ],
    });
    await generateProjectBoq(deps, request);

    expect(recorded.projectPatch?.totalFloorArea).toBe(100);
  });

  it('attributes the snapshot to the caller, not to the project owner', async () => {
    const { deps, recorded } = makeDeps();
    await generateProjectBoq(deps, request);

    expect(recorded.snapshotInput).toMatchObject({
      triggeredBy: 'user-1',
      eventType: 'generated',
      boqHash: 'hash-abc',
    });
  });

  it('writes an audit entry carrying the hash and the rates applied', async () => {
    const { deps, recorded } = makeDeps();
    await generateProjectBoq(deps, request);

    expect(recorded.auditEntry).toMatchObject({ action: 'generated', entity: 'boq' });
    const details = JSON.parse(String(recorded.auditEntry?.details));
    expect(details.boqHash).toBe('hash-abc');
    expect(details.pricingPolicy).toMatchObject({ vatRate: 0.12 });
  });

  it('stores every compiled line as a suggested, un-overridden row', async () => {
    // A regenerate discards estimator overrides; the stored state must say so
    // rather than presenting stale overrides as current.
    const { deps, recorded } = makeDeps();
    await generateProjectBoq(deps, request);

    expect(recorded.replacedRows[0]).toMatchObject({
      sourceState: 'suggested',
      isOverridden: false,
      userUnitPriceOverride: null,
      userTotalPriceOverride: null,
    });
  });
});

describe('total conditioned area', () => {
  it('sums rooms across floors', () => {
    expect(
      totalFloorAreaM2([
        { name: 'A', rooms: [{ id: '1', area: 10 }, { id: '2', area: 20 }] },
        { name: 'B', rooms: [{ id: '3', area: 5 }] },
      ]),
    ).toBe(35);
  });

  it('treats a room with no recorded area as zero rather than NaN', () => {
    expect(totalFloorAreaM2([{ name: 'A', rooms: [{ id: '1' }, { id: '2', area: 10 }] }])).toBe(10);
  });

  it('is zero for a project with no floors', () => {
    expect(totalFloorAreaM2([])).toBe(0);
  });
});
