import { describe, expect, it } from 'vitest';
import { saveSimulationLayoutSchema } from '../simulation-layout';

/**
 * The viewer's layout autosave contract.
 *
 * This schema was written and wired into the handler without a test — coverage
 * measurement (TASK 5.1) reported it at 0% and that is how it was noticed. The
 * endpoint fires on every drag, so a payload it wrongly accepts corrupts the
 * persisted layout for a floor.
 */

const hvac = {
  id: 'h1',
  type: 'crac' as const,
  label: 'CRAC-1',
  position: { x: 2, y: 3, z: 0 },
  orientation: 90,
  capacityKW: 50,
  airflowCFM: 8000,
};

const tile = { id: 't1', x: 4, y: 5, openArea: 0.25, tileSize: 0.6 };

const layout = {
  floorId: 'floor-1',
  hvacPlacements: [hvac],
  tilePlacements: [tile],
};

describe('canvasScale is the divisor for every placement', () => {
  it('rejects zero, which sends every coordinate to Infinity', () => {
    // The handler previously used `typeof x === 'number' ? x : 50`, which
    // accepts 0.
    expect(saveSimulationLayoutSchema.safeParse({ ...layout, canvasScale: 0 }).success).toBe(false);
  });

  it('rejects a negative scale, which mirrors the plan', () => {
    expect(saveSimulationLayoutSchema.safeParse({ ...layout, canvasScale: -50 }).success).toBe(false);
  });

  it('rejects a non-finite scale', () => {
    expect(saveSimulationLayoutSchema.safeParse({ ...layout, canvasScale: NaN }).success).toBe(false);
    expect(saveSimulationLayoutSchema.safeParse({ ...layout, canvasScale: Infinity }).success).toBe(false);
  });

  it('defaults to 50 px/m when absent', () => {
    expect(saveSimulationLayoutSchema.parse(layout).canvasScale).toBe(50);
  });
});

describe('placements are validated, not merely counted', () => {
  it('accepts a well-formed layout', () => {
    expect(saveSimulationLayoutSchema.safeParse(layout).success).toBe(true);
  });

  it('rejects an HVAC placement with no position', () => {
    // serializeHVAC reads h.position.x directly, so this previously threw
    // inside the persistence layer rather than being rejected at the boundary.
    const { position: _dropped, ...noPosition } = hvac;
    expect(
      saveSimulationLayoutSchema.safeParse({ ...layout, hvacPlacements: [noPosition] }).success,
    ).toBe(false);
  });

  it('rejects a non-finite coordinate', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({
        ...layout,
        hvacPlacements: [{ ...hvac, position: { x: NaN, y: 0, z: 0 } }],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown HVAC type', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({ ...layout, hvacPlacements: [{ ...hvac, type: 'chiller' }] }).success,
    ).toBe(false);
  });

  it('rejects a tile open area outside 0-1, since it is a fraction', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({ ...layout, tilePlacements: [{ ...tile, openArea: 25 }] }).success,
    ).toBe(false);
  });

  it('accepts a fully closed tile', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({ ...layout, tilePlacements: [{ ...tile, openArea: 0 }] }).success,
    ).toBe(true);
  });

  it('rejects a zero tile size, which occupies no area', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({ ...layout, tilePlacements: [{ ...tile, tileSize: 0 }] }).success,
    ).toBe(false);
  });
});

describe('required structure', () => {
  it('requires a floor to attach the layout to', () => {
    const { floorId: _dropped, ...noFloor } = layout;
    expect(saveSimulationLayoutSchema.safeParse(noFloor).success).toBe(false);
    expect(saveSimulationLayoutSchema.safeParse({ ...layout, floorId: '   ' }).success).toBe(false);
  });

  it('accepts empty placement arrays, which is a cleared floor', () => {
    const parsed = saveSimulationLayoutSchema.parse({
      floorId: 'floor-1',
      hvacPlacements: [],
      tilePlacements: [],
    });
    expect(parsed.hvacPlacements).toEqual([]);
  });

  it('requires the arrays to be present', () => {
    expect(saveSimulationLayoutSchema.safeParse({ floorId: 'floor-1' }).success).toBe(false);
  });

  it('bounds array length so one payload cannot become unbounded work', () => {
    const tiles = Array.from({ length: 50_001 }, (_, i) => ({ ...tile, id: `t${i}` }));
    expect(saveSimulationLayoutSchema.safeParse({ ...layout, tilePlacements: tiles }).success).toBe(false);
  });
});

describe('connection overrides', () => {
  it('accepts a well-formed override', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({
        ...layout,
        connectionOverrides: [
          { fromRoomId: 'r1', toRoomId: 'r2', type: 'door', openingAreaM2: 2, resistance: 0.5 },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts a sealed connection of zero area', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({
        ...layout,
        connectionOverrides: [
          { fromRoomId: 'r1', toRoomId: 'r2', type: 'sealed', openingAreaM2: 0, resistance: 0 },
        ],
      }).success,
    ).toBe(true);
  });

  it('requires both rooms on an override', () => {
    expect(
      saveSimulationLayoutSchema.safeParse({
        ...layout,
        connectionOverrides: [{ fromRoomId: 'r1', type: 'door', openingAreaM2: 2, resistance: 0.5 }],
      }).success,
    ).toBe(false);
  });
});
