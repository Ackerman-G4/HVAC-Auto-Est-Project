import type { Point3D, RoomGeometry, WallSegment } from '@/types/geometry';

const EPSILON = 1e-6;

function makeCellKey(ix: number, iy: number): string {
  return `${ix}:${iy}`;
}

function pointToCellKey(x: number, y: number, cellSizeM: number): string {
  const ix = Math.floor(x / cellSizeM);
  const iy = Math.floor(y / cellSizeM);
  return makeCellKey(ix, iy);
}

function nearbyCellKeys(room: RoomGeometry, cellSizeM: number): string[] {
  const minIx = Math.floor(room.boundingBox.min.x / cellSizeM);
  const maxIx = Math.floor(room.boundingBox.max.x / cellSizeM);
  const minIy = Math.floor(room.boundingBox.min.y / cellSizeM);
  const maxIy = Math.floor(room.boundingBox.max.y / cellSizeM);

  const keys: string[] = [];
  for (let ix = minIx; ix <= maxIx; ix++) {
    for (let iy = minIy; iy <= maxIy; iy++) {
      keys.push(makeCellKey(ix, iy));
    }
  }
  return keys;
}

function distance2D(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function isCollinear(
  aStart: Point3D,
  aEnd: Point3D,
  bStart: Point3D,
  bEnd: Point3D,
  tolerance: number,
): boolean {
  const adx = aEnd.x - aStart.x;
  const ady = aEnd.y - aStart.y;

  const c1 = Math.abs(cross2D(adx, ady, bStart.x - aStart.x, bStart.y - aStart.y));
  const c2 = Math.abs(cross2D(adx, ady, bEnd.x - aStart.x, bEnd.y - aStart.y));

  const length = Math.hypot(adx, ady);
  const scaledTolerance = Math.max(tolerance, tolerance * length);
  return c1 <= scaledTolerance && c2 <= scaledTolerance;
}

function overlapLengthOnDominantAxis(
  aStart: Point3D,
  aEnd: Point3D,
  bStart: Point3D,
  bEnd: Point3D,
): number {
  const dx = Math.abs(aEnd.x - aStart.x);
  const dy = Math.abs(aEnd.y - aStart.y);
  const useX = dx >= dy;

  const a0 = useX ? aStart.x : aStart.y;
  const a1 = useX ? aEnd.x : aEnd.y;
  const b0 = useX ? bStart.x : bStart.y;
  const b1 = useX ? bEnd.x : bEnd.y;

  const aMin = Math.min(a0, a1);
  const aMax = Math.max(a0, a1);
  const bMin = Math.min(b0, b1);
  const bMax = Math.max(b0, b1);

  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

function shareWall(
  a: WallSegment,
  b: WallSegment,
  endpointToleranceM: number,
  minSharedLengthM: number,
): boolean {
  const closeAB = distance2D(a.start, b.start) <= endpointToleranceM && distance2D(a.end, b.end) <= endpointToleranceM;
  const closeBA = distance2D(a.start, b.end) <= endpointToleranceM && distance2D(a.end, b.start) <= endpointToleranceM;

  if (closeAB || closeBA) {
    return true;
  }

  if (!isCollinear(a.start, a.end, b.start, b.end, endpointToleranceM)) {
    return false;
  }

  const overlap = overlapLengthOnDominantAxis(a.start, a.end, b.start, b.end);
  return overlap + EPSILON >= minSharedLengthM;
}

export function buildRoomSpatialHash(
  rooms: RoomGeometry[],
  cellSizeM = 1,
): Map<string, Set<string>> {
  const safeCellSize = Math.max(0.1, cellSizeM);
  const hash = new Map<string, Set<string>>();

  for (const room of rooms) {
    for (const key of nearbyCellKeys(room, safeCellSize)) {
      if (!hash.has(key)) {
        hash.set(key, new Set<string>());
      }
      hash.get(key)?.add(room.id);
    }

    // Ensure centroid lookup can always retrieve this room quickly.
    const centroidKey = pointToCellKey(room.centroid.x, room.centroid.y, safeCellSize);
    if (!hash.has(centroidKey)) {
      hash.set(centroidKey, new Set<string>());
    }
    hash.get(centroidKey)?.add(room.id);
  }

  return hash;
}

export function detectAdjacentRooms(
  rooms: RoomGeometry[],
  options?: {
    cellSizeM?: number;
    endpointToleranceM?: number;
    minSharedLengthM?: number;
  },
): Map<string, string[]> {
  const cellSizeM = Math.max(0.1, options?.cellSizeM ?? 1);
  const endpointToleranceM = Math.max(0.01, options?.endpointToleranceM ?? 0.05);
  const minSharedLengthM = Math.max(0.05, options?.minSharedLengthM ?? 0.5);

  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const adjacency = new Map<string, Set<string>>();
  const seenPairs = new Set<string>();
  const spatialHash = buildRoomSpatialHash(rooms, cellSizeM);

  for (const room of rooms) {
    if (!adjacency.has(room.id)) {
      adjacency.set(room.id, new Set<string>());
    }

    const candidateIds = new Set<string>();
    for (const key of nearbyCellKeys(room, cellSizeM)) {
      for (const candidateId of spatialHash.get(key) ?? []) {
        if (candidateId !== room.id) {
          candidateIds.add(candidateId);
        }
      }
    }

    for (const candidateId of candidateIds) {
      const pairKey = room.id < candidateId
        ? `${room.id}::${candidateId}`
        : `${candidateId}::${room.id}`;
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);

      const candidate = roomsById.get(candidateId);
      if (!candidate) {
        continue;
      }

      const hasSharedWall = room.walls.some((wallA) =>
        candidate.walls.some((wallB) =>
          shareWall(wallA, wallB, endpointToleranceM, minSharedLengthM),
        ),
      );

      if (hasSharedWall) {
        adjacency.get(room.id)?.add(candidate.id);
        if (!adjacency.has(candidate.id)) {
          adjacency.set(candidate.id, new Set<string>());
        }
        adjacency.get(candidate.id)?.add(room.id);
      }
    }
  }

  const output = new Map<string, string[]>();
  for (const room of rooms) {
    output.set(room.id, [...(adjacency.get(room.id) ?? new Set<string>())]);
  }

  return output;
}

export function applyAdjacencyToRooms(
  rooms: RoomGeometry[],
  options?: {
    cellSizeM?: number;
    endpointToleranceM?: number;
    minSharedLengthM?: number;
  },
): RoomGeometry[] {
  const adjacencyMap = detectAdjacentRooms(rooms, options);
  return rooms.map((room) => ({
    ...room,
    adjacentRooms: adjacencyMap.get(room.id) ?? [],
  }));
}