import { describe, it, expect } from 'vitest';
import { autoDetectEquipment, type AutoDetectFloor } from '@/lib/functions/auto-detect-equipment';

const serverFloor: AutoDetectFloor = {
  id: 'f1',
  floorNumber: 1,
  scale: 50,
  rooms: [
    { id: 'r1', name: 'Server Room A', spaceType: 'server_room', area: 60, perimeter: 32, equipmentLoad: 40000, polygon: '[]' },
  ],
};

describe('autoDetectEquipment', () => {
  it('places all floor-mounted equipment at z = 0 (no axis swap → no floating)', () => {
    const out = autoDetectEquipment({ floors: [serverFloor], gridResolution: 0.5 });
    expect(out.racks.length).toBeGreaterThan(0);
    expect(out.hvacUnits.length).toBeGreaterThan(0);
    for (const r of out.racks) expect(r.position.z).toBe(0);
    for (const u of out.hvacUnits) expect(u.position.z).toBe(0);
  });

  it('spreads racks across the floor plane (distinct x), never collapsed to one point', () => {
    const out = autoDetectEquipment({ floors: [serverFloor], gridResolution: 0.5 });
    const xs = new Set(out.racks.map((r) => Math.round(r.position.x * 100)));
    // multiple racks must occupy distinct in-plane positions, not a single stack
    if (out.racks.length > 1) expect(xs.size).toBeGreaterThan(1);
    for (const r of out.racks) {
      expect(Number.isFinite(r.position.x)).toBe(true);
      expect(Number.isFinite(r.position.y)).toBe(true);
    }
  });

  it('keeps equipment within the room rect footprint', () => {
    const out = autoDetectEquipment({ floors: [serverFloor], gridResolution: 0.5 });
    // empty polygon → shelf-pack rect at origin, ~sqrt(60) square
    const side = Math.sqrt(60);
    for (const r of out.racks) {
      expect(r.position.x).toBeGreaterThanOrEqual(0);
      expect(r.position.x).toBeLessThanOrEqual(side + 1);
      expect(r.position.y).toBeGreaterThanOrEqual(0);
      expect(r.position.y).toBeLessThanOrEqual(side + 1);
    }
  });

  it('emits perforated-tile positions as non-negative grid-cell indices', () => {
    const out = autoDetectEquipment({ floors: [serverFloor], gridResolution: 0.5 });
    for (const t of out.tiles) {
      expect(Number.isInteger(t.x)).toBe(true);
      expect(Number.isInteger(t.y)).toBe(true);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic for identical input', () => {
    const a = autoDetectEquipment({ floors: [serverFloor], gridResolution: 0.5 });
    const b = autoDetectEquipment({ floors: [serverFloor], gridResolution: 0.5 });
    expect(a.racks).toEqual(b.racks);
    expect(a.hvacUnits).toEqual(b.hvacUnits);
    expect(a.tiles).toEqual(b.tiles);
  });
});
