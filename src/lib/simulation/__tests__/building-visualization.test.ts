import { describe, expect, it } from 'vitest';
import {
  buildBuildingVisualization,
  connectionEndpoint,
  roomCenter,
  toRoomVisualizationSamples,
} from '../building-visualization';
import type { BuildingCell, BuildingRoom } from '@/types/simulation';

/**
 * Pure geometry extracted from the run route by TASK 3.1. It was previously
 * reachable only by starting an HTTP request against a Firestore-backed case,
 * so the sampling stride and the endpoint projection were never exercised.
 */

function makeRoom(over: Partial<BuildingRoom> = {}): BuildingRoom {
  return {
    id: 'r1',
    floorId: 'f1',
    floorNumber: 1,
    name: 'Room',
    origin: { x: 0, y: 0, z: 0 },
    dimensions: { width: 10, length: 8, height: 3 },
    vents: [],
    heatLoadW: 0,
    ...over,
  };
}

function grid(nx: number, ny: number, temp = 22): BuildingCell[][] {
  return Array.from({ length: nx }, () =>
    Array.from({ length: ny }, () => ({ u: 0.3, v: 0.4, temp, pressure: 101325 })),
  );
}

describe('sampling thins a room grid to a renderable budget', () => {
  it('emits one sample per cell for a small grid', () => {
    const samples = toRoomVisualizationSamples(makeRoom(), grid(4, 4));
    expect(samples).toHaveLength(16);
  });

  it('places samples at cell centres, inside the room volume', () => {
    const room = makeRoom({ origin: { x: 100, y: 5, z: 200 } });
    const [first] = toRoomVisualizationSamples(room, grid(2, 2));

    // First cell centre of a 2x2 grid: origin + 0.25 of each span.
    expect(first.position.x).toBeCloseTo(100 + 0.25 * 10);
    expect(first.position.z).toBeCloseTo(200 + 0.25 * 8);
    // Mid-height, so a glyph sits in the room rather than on its floor.
    expect(first.position.y).toBeCloseTo(5 + 3 * 0.5);
  });

  it('thins a large grid by two orders of magnitude', () => {
    // 200x200 is 40,000 cells; drawing one glyph each would stall the canvas.
    const samples = toRoomVisualizationSamples(makeRoom(), grid(200, 200));
    expect(samples.length).toBeLessThan(40000 / 50);
    expect(samples.length).toBeGreaterThan(100);
  });

  it('overshoots its own budget, because the stride is floored', () => {
    // Pinned deliberately rather than corrected. stride = floor(sqrt(40000/420))
    // = floor(9.76) = 9, and ceil(200/9)^2 = 529 against a budget of 420 — a 26%
    // overshoot. MAX_SAMPLES_PER_ROOM is therefore an approximate target biased
    // high, not a ceiling. Changing it would alter what the viewport draws, which
    // is a rendering decision and not part of extracting this function.
    expect(toRoomVisualizationSamples(makeRoom(), grid(200, 200))).toHaveLength(529);
  });

  it('reports velocity magnitude as the planar resultant', () => {
    const [first] = toRoomVisualizationSamples(makeRoom(), grid(1, 1));
    expect(first.velocityMagnitude).toBeCloseTo(Math.hypot(0.3, 0.4));
  });

  it('returns nothing for a room the solver produced no state for', () => {
    expect(toRoomVisualizationSamples(makeRoom(), [])).toEqual([]);
    expect(toRoomVisualizationSamples(makeRoom(), [[]])).toEqual([]);
  });
});

describe('connection endpoints leave through the face that points at the target', () => {
  const from = makeRoom({ id: 'a', origin: { x: 0, y: 0, z: 0 } });

  it('exits on the x face when the rooms are further apart in x', () => {
    const to = makeRoom({ id: 'b', origin: { x: 100, y: 0, z: 0 } });
    const point = connectionEndpoint(from, to);

    expect(point.x).toBeCloseTo(roomCenter(from).x + 5);
    expect(point.z).toBeCloseTo(roomCenter(from).z);
  });

  it('exits on the z face when the rooms are further apart in z', () => {
    const to = makeRoom({ id: 'b', origin: { x: 0, y: 0, z: 100 } });
    const point = connectionEndpoint(from, to);

    expect(point.z).toBeCloseTo(roomCenter(from).z + 4);
    expect(point.x).toBeCloseTo(roomCenter(from).x);
  });

  it('still produces a directed endpoint for co-located rooms', () => {
    // Math.sign(0) is 0, which would collapse the arrow to zero length.
    const point = connectionEndpoint(from, makeRoom({ id: 'b' }));
    expect(point.x).not.toBeCloseTo(roomCenter(from).x);
  });
});

describe('the payload drops states it cannot anchor', () => {
  const rooms = [makeRoom({ id: 'r1' }), makeRoom({ id: 'r2', origin: { x: 50, y: 0, z: 0 } })];

  const state = (roomId: string) => ({
    roomId, grid: grid(2, 2), avgTemperature: 24, meanVelocity: 0.5,
    pressure: 101325, inflowM3s: 1, outflowM3s: 1,
  });

  it('includes every room the geometry knows', () => {
    const payload = buildBuildingVisualization({
      rooms,
      roomStates: [state('r1'), state('r2')],
      connectionFlows: [{ id: 'c1', fromRoom: 'r1', toRoom: 'r2', flowRateM3s: 1.5 }],
      temperatureRange: { min: 18, max: 30 },
      maxVelocity: 2,
    });

    expect(payload.rooms.map((r) => r.roomId)).toEqual(['r1', 'r2']);
    expect(payload.connections[0].flowRateM3s).toBe(1.5);
    expect(payload.velocityRange).toEqual({ min: 0, max: 2 });
  });

  it('drops a state naming a room that is not in the geometry', () => {
    // Rendering it would put a glyph cloud at the origin, which reads as real
    // data in the wrong place — worse than a missing room.
    const payload = buildBuildingVisualization({
      rooms,
      roomStates: [state('r1'), state('ghost')],
      connectionFlows: [],
      temperatureRange: { min: 18, max: 30 },
      maxVelocity: 2,
    });

    expect(payload.rooms).toHaveLength(1);
    expect(payload.rooms[0].roomId).toBe('r1');
  });

  it('names an unlabelled connection by position', () => {
    const payload = buildBuildingVisualization({
      rooms,
      roomStates: [],
      connectionFlows: [{ fromRoom: 'r1', toRoom: 'r2' }],
      temperatureRange: { min: 18, max: 30 },
      maxVelocity: 2,
    });

    expect(payload.connections[0].id).toBe('connection-1');
    expect(payload.connections[0].flowRateM3s).toBe(0);
  });

  it('collapses a connection between unknown rooms to the origin', () => {
    const payload = buildBuildingVisualization({
      rooms,
      roomStates: [],
      connectionFlows: [{ fromRoom: 'ghost-a', toRoom: 'ghost-b' }],
      temperatureRange: { min: 18, max: 30 },
      maxVelocity: 2,
    });

    expect(payload.connections[0].fromPoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(payload.connections[0].toPoint).toEqual({ x: 0, y: 0, z: 0 });
  });
});
