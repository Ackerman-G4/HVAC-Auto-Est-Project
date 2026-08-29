/**
 * Building simulation result → viewport payload.
 *
 * Pure geometry, extracted from the run route by REMEDIATION_PLAN.md TASK 3.1.
 * It lived inside a 564-line handler, which meant the sampling stride, the
 * endpoint projection and the room-lookup fallbacks were reachable only by
 * starting an HTTP request against a Firestore-backed case. None of it does any
 * I/O, so none of it needed to be there.
 *
 * The handler typed these against
 * `NonNullable<Awaited<ReturnType<typeof getSimulationCase>>>['buildingGeometry']['rooms'][number]`.
 * The named types existed the whole time.
 */

import type {
  BuildingCell,
  BuildingRoom,
  BuildingRoomState,
  BuildingVisualizationPayload,
  Vec3,
} from '@/types/simulation';

type RoomPayload = BuildingVisualizationPayload['rooms'][number];
type SamplePayload = RoomPayload['samples'];

/**
 * Upper bound on samples emitted per room. The viewport draws one glyph per
 * sample, so this is a rendering budget, not a physical quantity: a 200×200
 * room grid is 40,000 cells and would stall the canvas.
 */
const MAX_SAMPLES_PER_ROOM = 420;

/**
 * Thin a room's cell grid to a renderable set of world-space samples.
 *
 * The stride is the square root of the cell-to-budget ratio because the grid is
 * two-dimensional: skipping every nth cell on both axes divides the count by
 * n², so n must be the root of the reduction wanted.
 */
export function toRoomVisualizationSamples(
  room: BuildingRoom,
  grid: readonly BuildingCell[][],
): SamplePayload {
  const nx = grid.length;
  const ny = grid[0]?.length ?? 0;
  // An empty grid is a room the solver produced no state for. Not an error —
  // it renders as a room with no glyphs.
  if (!nx || !ny) return [];

  const stride = Math.max(1, Math.floor(Math.sqrt((nx * ny) / MAX_SAMPLES_PER_ROOM)));
  const samples: SamplePayload = [];

  for (let x = 0; x < nx; x += stride) {
    for (let y = 0; y < ny; y += stride) {
      const cell = grid[x]?.[y];
      if (!cell) continue;

      samples.push({
        // +0.5 places the sample at the cell centre rather than its corner, so
        // a glyph sits inside the volume it describes.
        position: {
          x: room.origin.x + ((x + 0.5) / nx) * room.dimensions.width,
          y: room.origin.y + room.dimensions.height * 0.5,
          z: room.origin.z + ((y + 0.5) / ny) * room.dimensions.length,
        },
        temperature: cell.temp,
        velocity: { u: cell.u, v: cell.v },
        velocityMagnitude: Math.hypot(cell.u, cell.v),
      });
    }
  }

  return samples;
}

/** Geometric centre of a room in world space. */
export function roomCenter(room: BuildingRoom): Vec3 {
  return {
    x: room.origin.x + room.dimensions.width / 2,
    y: room.origin.y + room.dimensions.height / 2,
    z: room.origin.z + room.dimensions.length / 2,
  };
}

/**
 * Where an airflow connection leaves `fromRoom` on its way to `toRoom`.
 *
 * Projected onto whichever axis the rooms are further apart on, so the arrow
 * exits through the face that actually points at the destination rather than
 * through a corner. `dx || 1` keeps the sign defined for co-located centres,
 * where `Math.sign(0)` would otherwise place the endpoint at the centre and
 * collapse the arrow to zero length.
 */
export function connectionEndpoint(fromRoom: BuildingRoom, toRoom: BuildingRoom): Vec3 {
  const from = roomCenter(fromRoom);
  const to = roomCenter(toRoom);

  const dx = to.x - from.x;
  const dz = to.z - from.z;

  if (Math.abs(dx) >= Math.abs(dz)) {
    return {
      x: from.x + Math.sign(dx || 1) * fromRoom.dimensions.width * 0.5,
      y: from.y,
      z: from.z,
    };
  }

  return {
    x: from.x,
    y: from.y,
    z: from.z + Math.sign(dz || 1) * fromRoom.dimensions.length * 0.5,
  };
}

export interface BuildingVisualizationInput {
  readonly rooms: readonly BuildingRoom[];
  readonly roomStates: readonly BuildingRoomState[];
  readonly connectionFlows: ReadonlyArray<{
    id?: string;
    fromRoom: string;
    toRoom: string;
    flowRateM3s?: number;
  }>;
  readonly temperatureRange: { min: number; max: number };
  readonly maxVelocity: number;
}

/**
 * Assemble the full viewport payload.
 *
 * A room state naming a room that is not in the geometry is dropped rather than
 * rendered at the origin: an unanchored glyph cloud reads as real data in the
 * wrong place, which is worse than a missing room.
 */
export function buildBuildingVisualization(
  input: BuildingVisualizationInput,
): BuildingVisualizationPayload {
  const roomById = new Map(input.rooms.map((room) => [room.id, room]));

  const rooms = input.roomStates
    .map((state): RoomPayload | null => {
      const room = roomById.get(state.roomId);
      if (!room) return null;

      return {
        roomId: room.id,
        avgTemperature: state.avgTemperature,
        avgVelocity: state.meanVelocity,
        samples: toRoomVisualizationSamples(room, state.grid),
      };
    })
    .filter((room): room is RoomPayload => room !== null);

  const connections = input.connectionFlows.map((connection, index) => {
    const fromRoom = roomById.get(connection.fromRoom);
    const toRoom = roomById.get(connection.toRoom);
    const bothKnown = fromRoom !== undefined && toRoom !== undefined;
    const origin: Vec3 = { x: 0, y: 0, z: 0 };

    return {
      id: connection.id ?? `connection-${index + 1}`,
      flowRateM3s: connection.flowRateM3s ?? 0,
      fromPoint: bothKnown ? connectionEndpoint(fromRoom, toRoom) : origin,
      toPoint: bothKnown ? connectionEndpoint(toRoom, fromRoom) : origin,
    };
  });

  return {
    rooms,
    connections,
    temperatureRange: input.temperatureRange,
    velocityRange: { min: 0, max: input.maxVelocity },
  };
}
