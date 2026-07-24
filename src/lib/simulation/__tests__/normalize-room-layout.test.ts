import { describe, it, expect } from 'vitest';
import type { ServerRack, HVACUnit, PerforatedTile } from '@/types/simulation';
import {
  DEFAULT_CANVAS_SCALE,
  resolveFloorScale,
} from '@/lib/simulation/geometry-2d';
import {
  normalizeRoomLayout,
  type RoomBoundary,
} from '@/lib/simulation/normalize-room-layout';

function rack(id: string, x: number, y: number, z = 5): ServerRack {
  return {
    id, name: id, position: { x, y, z },
    width: 0.6, depth: 1.2, height: 2.0,
    powerDensity: 'medium', powerKW: 7, airflowCFM: 350,
    orientation: 0, rackUnits: 42, filledUnits: 30,
  };
}

function hvac(id: string, x: number, y: number, z = 0, type: HVACUnit['type'] = 'crac'): HVACUnit {
  return {
    id, type, name: id, position: { x, y, z },
    width: 0.9, depth: 0.9, height: 2.1,
    capacityKW: 30, capacityTR: 8.5, airflowCFM: 5500,
    supplyTempC: 13, returnTempC: 24, orientation: 0,
    powerInputKW: 10, status: 'active',
  };
}

function room(id: string, minX: number, minY: number, w: number, h: number): RoomBoundary {
  return {
    id, name: id,
    points: [
      { x: minX, y: minY },
      { x: minX + w, y: minY },
      { x: minX + w, y: minY + h },
      { x: minX, y: minY + h },
    ],
    centroid: { x: minX + w / 2, y: minY + h / 2 },
  };
}

const BIG_ROOM = room('r1', 0, 0, 20, 20);

describe('resolveFloorScale', () => {
  it('prefers a positive polygon scale', () => {
    expect(resolveFloorScale(37, 50)).toBe(37);
  });
  it('falls back to a positive floor scale', () => {
    expect(resolveFloorScale(0, 42)).toBe(42);
    expect(resolveFloorScale(undefined, 42)).toBe(42);
  });
  it('never returns 1 — defaults to the canvas scale (50)', () => {
    expect(resolveFloorScale(undefined, undefined)).toBe(DEFAULT_CANVAS_SCALE);
    expect(resolveFloorScale(0, 0)).toBe(50);
    expect(resolveFloorScale(-5, -5)).toBe(50);
  });
});

describe('normalizeRoomLayout', () => {
  const base = { roomBoundaries: [BIG_ROOM], tiles: [] as PerforatedTile[], gridResolution: 0.5 };

  it('floor-snaps every floor-mounted item to z = 0', () => {
    const out = normalizeRoomLayout({
      ...base,
      racks: [rack('a', 4, 4, 5), rack('b', 8, 8, 2.3)],
      hvacUnits: [hvac('h1', 2, 2, 1.7)],
    });
    for (const r of out.racks) expect(r.position.z).toBe(0);
    for (const u of out.hvacUnits) expect(u.position.z).toBe(0);
  });

  it('keeps ceiling-mounted vent ducts off the floor, clamped to the ceiling', () => {
    const out = normalizeRoomLayout({
      ...base,
      racks: [],
      hvacUnits: [hvac('v', 5, 5, 99, 'vent_duct')],
      ceilingHeightM: 3,
    });
    const v = out.hvacUnits[0];
    expect(v.position.z).toBeGreaterThan(0);
    expect(v.position.z).toBeLessThanOrEqual(3 - v.height);
  });

  it('drops equipment with non-finite positions and records a warning', () => {
    const bad = rack('bad', Number.NaN, 5);
    const worse = hvac('worse', 5, Number.POSITIVE_INFINITY);
    const out = normalizeRoomLayout({
      ...base,
      racks: [rack('good', 5, 5), bad],
      hvacUnits: [hvac('okay', 6, 6), worse],
    });
    expect(out.racks.map((r) => r.id)).toContain('good');
    expect(out.racks.map((r) => r.id)).not.toContain('bad');
    expect(out.hvacUnits.map((u) => u.id)).not.toContain('worse');
    expect(out.warnings.some((w) => /invalid position/i.test(w))).toBe(true);
    // No item lands at exactly (0,0,0) as a NaN→0 pile-up.
    const atOrigin = [...out.racks, ...out.hvacUnits].filter(
      (b) => b.position.x === 0 && b.position.y === 0,
    );
    expect(atOrigin).toHaveLength(0);
  });

  it('translates so the room bbox starts at the origin (originOffset)', () => {
    const out = normalizeRoomLayout({
      ...base,
      roomBoundaries: [room('shifted', 10, 5, 20, 20)],
      racks: [rack('r', 15, 12)],
      hvacUnits: [],
    });
    expect(out.originOffset).toEqual({ x: 10, y: 5 });
    // rack at world (15,12) → normalized (5,7)
    expect(out.racks[0].position.x).toBeCloseTo(5, 5);
    expect(out.racks[0].position.y).toBeCloseTo(7, 5);
    // every boundary point is >= 0
    for (const p of out.roomBoundaries[0].points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects an overlapping unit and warns', () => {
    const out = normalizeRoomLayout({
      ...base,
      racks: [],
      hvacUnits: [hvac('h1', 10, 10), hvac('h2', 10, 10)], // identical position → overlap
    });
    expect(out.hvacUnits).toHaveLength(1);
    expect(out.warnings.some((w) => /overlap/i.test(w))).toBe(true);
  });

  it('is deterministic — identical input yields identical output', () => {
    const input = {
      ...base,
      racks: [rack('a', 4, 4), rack('b', 8, 9)],
      hvacUnits: [hvac('h', 2, 2)],
    };
    const a = normalizeRoomLayout(input);
    const b = normalizeRoomLayout(input);
    expect(a).toEqual(b);
  });

  it('produces a grid sized to the domain within sane bounds', () => {
    const out = normalizeRoomLayout({ ...base, racks: [rack('a', 5, 5)], hvacUnits: [] });
    expect(out.gridSize.gridSizeX).toBeGreaterThanOrEqual(8);
    expect(out.gridSize.gridSizeX).toBeLessThanOrEqual(80);
    expect(out.gridSize.gridSizeZ).toBeGreaterThanOrEqual(6);
  });
});
