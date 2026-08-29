import { describe, expect, it, vi } from 'vitest';
import {
  autoSizeProjectEquipment,
  selectEquipmentManually,
  type SelectEquipmentDeps,
} from '../select-equipment';

/**
 * Equipment selection, extracted from a 259-line route by TASK 3.2.
 *
 * The invariant both paths carry is that selecting equipment invalidates any
 * bill of quantities generated before it. It lived in two hand-copied blocks;
 * if either drifted, a quotation would keep being served against equipment that
 * had since changed, with nothing reporting it.
 */

const room = {
  id: 'r1', name: 'Server Room', spaceType: 'server_room',
  area: 40, ceilingHeight: 3,
  coolingLoad: { totalLoad: 12000, trValue: 3.4, btuPerHour: 40950 },
};

const sizing = {
  recommended: [{
    quantity: 2,
    equipment: {
      brand: 'Acme', model: 'AC-5', type: 'cassette',
      capacityTR: 5, capacityBTU: 60000, capacityKW: 17.6,
      priceMin: 90000, priceMax: 110000, eer: 12,
      refrigerant: 'R32', powerSupply: '220V',
    },
  }],
  alternatives: [{ model: 'ALT-1' }, { model: 'ALT-2' }, { model: 'ALT-3' }, { model: 'ALT-4' }],
};

function makeDeps(over: Partial<Record<keyof SelectEquipmentDeps, unknown>> = {}) {
  const deps = {
    getFloorsWithRooms: vi.fn(async () => [{ name: 'L1', rooms: [room] }]),
    updateProjectRecord: vi.fn(async () => undefined),
    clearSelectedEquipmentForProject: vi.fn(async () => undefined),
    createSelectedEquipmentRecord: vi.fn(async () => ({ id: 'sel-1' })),
    getPriceOverridesByModel: vi.fn(async () => new Map()),
    sizeEquipment: vi.fn(() => sizing),
    resolveUnitPrice: vi.fn(() => ({ unitPrice: 100000, overridden: false })),
    resolveManualSelection: vi.fn(() => ({
      manufacturer: 'Acme', model: 'AC-5', type: 'cassette',
      capacityTR: 5, capacityBTU: 60000, capacityKW: 17.6,
      unitPricePHP: 100000, eer: 12, refrigerant: 'R32', overridden: false,
    })),
    ...over,
  } as unknown as SelectEquipmentDeps;
  return { deps };
}

const autoParams: Parameters<typeof autoSizeProjectEquipment>[1] = {
  projectId: 'p1',
  budgetLevel: 'mid-range',
  preferredBrand: undefined,
  preferredType: undefined,
};

describe('auto-sizing refuses before it clears anything', () => {
  it('refuses a project with no rooms', async () => {
    const { deps } = makeDeps({ getFloorsWithRooms: vi.fn(async () => []) });
    const r = await autoSizeProjectEquipment(deps, autoParams);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NO_ROOMS');
    expect(deps.clearSelectedEquipmentForProject).not.toHaveBeenCalled();
  });

  it('refuses when no room has a calculated load, keeping the existing selection', async () => {
    // clearSelectedEquipmentForProject is destructive. Running it before this
    // check would wipe a good selection because loads had not been computed.
    const { deps } = makeDeps({
      getFloorsWithRooms: vi.fn(async () => [{ name: 'L1', rooms: [{ ...room, coolingLoad: null }] }]),
    });
    const r = await autoSizeProjectEquipment(deps, autoParams);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NO_LOADS');
    expect(deps.clearSelectedEquipmentForProject).not.toHaveBeenCalled();
    expect(deps.updateProjectRecord).not.toHaveBeenCalled();
  });
});

describe('a successful auto-size', () => {
  it('clears, then creates one selection per loaded room', async () => {
    const { deps } = makeDeps();
    const r = await autoSizeProjectEquipment(deps, autoParams);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(deps.clearSelectedEquipmentForProject).toHaveBeenCalledOnce();
    expect(deps.createSelectedEquipmentRecord).toHaveBeenCalledOnce();
    expect(r.results[0].room).toBe('Server Room');
    expect(r.results[0].equipment.quantity).toBe(2);
  });

  it('returns at most three alternatives per room', async () => {
    const { deps } = makeDeps();
    const r = await autoSizeProjectEquipment(deps, autoParams);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results[0].alternatives).toHaveLength(3);
  });

  it('skips a room the catalogue cannot serve without failing the project', async () => {
    const { deps } = makeDeps({
      getFloorsWithRooms: vi.fn(async () => [{
        name: 'L1', rooms: [room, { ...room, id: 'r2', name: 'Huge Hall' }],
      }]),
      sizeEquipment: vi.fn()
        .mockReturnValueOnce(sizing)
        .mockReturnValueOnce({ recommended: [], alternatives: [] }),
    });
    const r = await autoSizeProjectEquipment(deps, autoParams);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results).toHaveLength(1);
  });

  it('degrades to catalogue pricing when the override lookup fails', async () => {
    // Overrides are an admin refinement. Losing them must not fail a selection.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      getPriceOverridesByModel: vi.fn(async () => { throw new Error('firestore unavailable'); }),
    });
    const r = await autoSizeProjectEquipment(deps, autoParams);

    expect(r.ok).toBe(true);
    expect(deps.createSelectedEquipmentRecord).toHaveBeenCalled();
  });
});

describe('a manual selection', () => {
  const body = { roomId: 'r1', quantity: 1, model: 'AC-5' };

  it('refuses a room the project does not contain', async () => {
    const { deps } = makeDeps();
    const r = await selectEquipmentManually(deps, {
      projectId: 'p1', body: { ...body, roomId: 'ghost' },
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('ROOM_NOT_FOUND');
    expect(deps.createSelectedEquipmentRecord).not.toHaveBeenCalled();
  });

  it('resolves price and capacity server-side rather than trusting the client', async () => {
    // A caller could otherwise name a real catalogue model at a price of its
    // own choosing.
    const { deps } = makeDeps();
    const r = await selectEquipmentManually(deps, {
      projectId: 'p1', body: { ...body, unitPrice: 1 },
    });

    expect(r.ok).toBe(true);
    expect(deps.resolveManualSelection).toHaveBeenCalled();
    const stored = vi.mocked(deps.createSelectedEquipmentRecord).mock.calls[0][0];
    expect(stored.equipment.unitPricePHP).toBe(100000);
  });
});

describe('both paths invalidate the stored bill of quantities', () => {
  it('marks the bill stale after auto-sizing', async () => {
    const { deps } = makeDeps();
    await autoSizeProjectEquipment(deps, autoParams);

    expect(deps.updateProjectRecord).toHaveBeenCalledWith('p1', expect.objectContaining({
      isEquipmentStale: false, isBoqStale: true, lastBoqGeneratedAt: null,
    }));
  });

  it('marks the bill stale after a manual selection', async () => {
    const { deps } = makeDeps();
    await selectEquipmentManually(deps, { projectId: 'p1', body: { roomId: 'r1', quantity: 1 } });

    expect(deps.updateProjectRecord).toHaveBeenCalledWith('p1', expect.objectContaining({
      isBoqStale: true, lastBoqGeneratedAt: null,
    }));
  });
});
