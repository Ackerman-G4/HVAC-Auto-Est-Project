import { describe, expect, it } from 'vitest';
import {
  mapLayoutHVACToUnit,
  mapLayoutTile,
  mapHVACUnitToLayoutPlacement,
  buildLayoutPayload,
  buildLayoutPayloadHash,
  resolveCanvasScale,
} from '../helpers';
import type { DetectedFloor } from '../types';
import type { HVACUnit, PerforatedTile } from '@/types/simulation';

/**
 * These guard the simulation-layout autosave.
 *
 * The viewer hydrates a stored layout, then a debounced effect PUTs whenever the
 * payload hash differs from the hydration baseline. So the load path must be
 * *idempotent*: hydrating and immediately re-serialising has to produce a
 * byte-identical payload, or every page load fires a spurious write. A real
 * drag, conversely, must change the hash or the save never fires.
 *
 * That behaviour is otherwise only observable in a browser with the network tab
 * open — these pin the pure half of it.
 */

const floor: DetectedFloor = {
  id: 'floor-1',
  floorNumber: 1,
  name: 'Ground Floor',
  scale: 50,
  ceilingHeight: 3,
  rooms: [],
};

const storedHVAC = {
  id: 'h1',
  type: 'crac',
  label: 'CRAC-1',
  position: { x: 2.5, y: 3.5, z: 0 },
  orientation: 90,
  capacityKW: 50,
  airflowCFM: 8000,
};

const storedTile = { x: 4, y: 5, openArea: 0.3, tileSize: 0.6 };

describe('simulation layout payload', () => {
  it('hydrate -> re-serialise is idempotent (no spurious PUT on load)', () => {
    const unit = mapLayoutHVACToUnit(storedHVAC, 0);
    expect(unit).not.toBeNull();

    const tile = mapLayoutTile(storedTile);
    expect(tile).not.toBeNull();

    const first = buildLayoutPayload('floor-1', floor, [unit as HVACUnit], [tile as PerforatedTile]);

    // Feed the serialised placement back through the hydration mapper, exactly
    // as a reload would, and rebuild.
    const rehydrated = mapLayoutHVACToUnit(first.hvacPlacements[0], 0);
    const second = buildLayoutPayload('floor-1', floor, [rehydrated as HVACUnit], [tile as PerforatedTile]);

    expect(buildLayoutPayloadHash(second)).toBe(buildLayoutPayloadHash(first));
  });

  it('produces a stable hash for equal payloads', () => {
    const unit = mapLayoutHVACToUnit(storedHVAC, 0) as HVACUnit;
    const a = buildLayoutPayload('floor-1', floor, [unit], []);
    const b = buildLayoutPayload('floor-1', floor, [unit], []);
    expect(buildLayoutPayloadHash(a)).toBe(buildLayoutPayloadHash(b));
  });

  it('changes the hash when a unit moves, so a real drag still saves', () => {
    const unit = mapLayoutHVACToUnit(storedHVAC, 0) as HVACUnit;
    const before = buildLayoutPayloadHash(buildLayoutPayload('floor-1', floor, [unit], []));

    const moved: HVACUnit = { ...unit, position: { ...unit.position, x: unit.position.x + 0.5 } };
    const after = buildLayoutPayloadHash(buildLayoutPayload('floor-1', floor, [moved], []));

    expect(after).not.toBe(before);
  });

  it('changes the hash when a unit is added or removed', () => {
    const unit = mapLayoutHVACToUnit(storedHVAC, 0) as HVACUnit;
    const one = buildLayoutPayloadHash(buildLayoutPayload('floor-1', floor, [unit], []));
    const none = buildLayoutPayloadHash(buildLayoutPayload('floor-1', floor, [], []));
    expect(one).not.toBe(none);
  });

  it('drops malformed HVAC placements instead of piling them at the origin', () => {
    expect(mapLayoutHVACToUnit({ ...storedHVAC, position: { x: 'nope', y: 3 } }, 0)).toBeNull();
    expect(mapLayoutHVACToUnit({ ...storedHVAC, position: {} }, 0)).toBeNull();
    // z is allowed to be missing — it defaults to floor level, not dropped.
    const noZ = mapLayoutHVACToUnit({ ...storedHVAC, position: { x: 1, y: 2 } }, 0);
    expect(noZ?.position).toEqual({ x: 1, y: 2, z: 0 });
  });

  it('drops malformed tiles the same way', () => {
    expect(mapLayoutTile({ x: Number.NaN, y: 2 })).toBeNull();
    expect(mapLayoutTile({ y: 2 })).toBeNull();
    expect(mapLayoutTile({ x: 1, y: 2 })).not.toBeNull();
  });

  it('round-trips an HVAC unit position without drift', () => {
    const unit = mapLayoutHVACToUnit(storedHVAC, 0) as HVACUnit;
    const placement = mapHVACUnitToLayoutPlacement(unit);
    expect(placement.position).toEqual({ x: 2.5, y: 3.5, z: 0 });
    expect(placement.id).toBe('h1');
    expect(placement.orientation).toBe(90);
  });

  it('falls back to canvas scale 50 for a scaleless floor', () => {
    // A 0/absent scale used to be treated as 1, making px read as metres and
    // blowing bounds up ~50x.
    expect(resolveCanvasScale({ ...floor, scale: 0 })).toBe(50);
    expect(resolveCanvasScale(null)).toBe(50);
    expect(resolveCanvasScale({ ...floor, scale: 32 })).toBe(32);
  });
});
