import { extrudeRoomFromPolygon } from '@/lib/geometry/room-extruder';
import { detectAdjacentRooms } from '@/lib/geometry/spatial-index';
import { createRectPolygonPoints, getPolygonBounds, parseRoomPolygon } from '@/lib/utils/room-polygon';
import type { Point2D, RoomGeometry } from '@/types/geometry';
import type {
  AirConnection,
  BuildingGeometryInput,
  BuildingRoom,
  LayoutConnectionOverride,
} from '@/types/simulation';

interface FloorRoomSource {
  id: string;
  floorId: string;
  floorNumber: number;
  floorScale: number;
  floorCeilingHeight: number;
  roomName: string;
  polygon?: string;
  area: number;
  perimeter: number;
  ceilingHeight: number;
  equipmentLoad: number;
}

interface FloorSource {
  id: string;
  floorNumber: number;
  scale: number;
  ceilingHeight: number;
  rooms: Array<{
    id: string;
    name: string;
    polygon?: string;
    area: number;
    perimeter: number;
    ceilingHeight: number;
    equipmentLoad: number;
  }>;
}

interface RoomBounds {
  room: BuildingRoom;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

interface BuildOptions {
  buildingId?: string;
  floorGapM?: number;
  adjacencyToleranceM?: number;
  minSharedEdgeM?: number;
  includeVerticalConnections?: boolean;
}

interface BuildingRoomAssembly {
  rooms: BuildingRoom[];
  roomGeometry: RoomGeometry[];
}

const DEFAULT_FLOOR_GAP_M = 0.35;
const DEFAULT_ADJ_TOLERANCE_M = 0.25;
const DEFAULT_MIN_SHARED_EDGE_M = 0.8;

function deriveRectFromArea(area: number, perimeter: number): { width: number; length: number } {
  const safeArea = Math.max(1, area || 1);
  const safePerimeter = Math.max(0, perimeter || 0);
  if (safePerimeter > 0) {
    const semi = safePerimeter / 2;
    const disc = semi * semi - 4 * safeArea;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      const a = Math.max(0.6, (semi + root) / 2);
      const b = Math.max(0.6, (semi - root) / 2);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return { width: a, length: b };
      }
    }
  }

  const side = Math.max(0.6, Math.sqrt(safeArea));
  return { width: side, length: side };
}

function overlap1D(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function buildRoomSources(floors: FloorSource[]): FloorRoomSource[] {
  const sortedFloors = [...floors].sort((a, b) => a.floorNumber - b.floorNumber);
  const roomSources: FloorRoomSource[] = [];

  for (const floor of sortedFloors) {
    for (const room of floor.rooms ?? []) {
      roomSources.push({
        id: room.id,
        floorId: floor.id,
        floorNumber: floor.floorNumber,
        floorScale: floor.scale,
        floorCeilingHeight: floor.ceilingHeight,
        roomName: room.name,
        polygon: room.polygon,
        area: room.area,
        perimeter: room.perimeter,
        ceilingHeight: room.ceilingHeight,
        equipmentLoad: room.equipmentLoad,
      });
    }
  }

  return roomSources;
}

function resolveFloorBaseHeights(roomSources: FloorRoomSource[], floorGapM: number): Map<string, number> {
  const floorBaseHeights = new Map<string, number>();
  const sortedFloorIds = [...new Set(roomSources.map((room) => room.floorId))]
    .sort((a, b) => {
      const floorA = roomSources.find((room) => room.floorId === a)?.floorNumber ?? 0;
      const floorB = roomSources.find((room) => room.floorId === b)?.floorNumber ?? 0;
      return floorA - floorB;
    });

  let currentBase = 0;
  for (const floorId of sortedFloorIds) {
    floorBaseHeights.set(floorId, currentBase);
    const floorHeight = Math.max(
      2.4,
      roomSources.find((room) => room.floorId === floorId)?.floorCeilingHeight ?? 3.0,
    );
    currentBase += floorHeight + floorGapM;
  }

  return floorBaseHeights;
}

function toPolygonMeters(source: FloorRoomSource): Point2D[] | null {
  const polygon = parseRoomPolygon(source.polygon ?? '');
  if (!polygon) {
    return null;
  }

  const scale = polygon.scale && polygon.scale > 0
    ? polygon.scale
    : 1;
  const points = polygon.points.map((point) => ({
    x: point.x / scale,
    y: point.y / scale,
  }));

  const bounds = getPolygonBounds(points);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  return points;
}

function toFallbackPolygonMeters(
  source: FloorRoomSource,
  perFloorFallbackCursor: Map<string, { x: number; y: number; rowDepth: number }>,
): Point2D[] {
  const fallbackDims = deriveRectFromArea(source.area, source.perimeter);
  const width = fallbackDims.width;
  const length = fallbackDims.length;

  const cursor = perFloorFallbackCursor.get(source.floorId) ?? { x: 0, y: 0, rowDepth: 0 };
  const originX = cursor.x;
  const originY = cursor.y;

  const nextX = cursor.x + width + 1;
  if (nextX > 30) {
    perFloorFallbackCursor.set(source.floorId, {
      x: 0,
      y: cursor.y + cursor.rowDepth + 1,
      rowDepth: length,
    });
  } else {
    perFloorFallbackCursor.set(source.floorId, {
      x: nextX,
      y: cursor.y,
      rowDepth: Math.max(cursor.rowDepth, length),
    });
  }

  return createRectPolygonPoints({
    x: originX,
    y: originY,
    width,
    height: length,
  });
}

function toBuildingRoom(source: FloorRoomSource, geometry: RoomGeometry): BuildingRoom {
  const width = Math.max(0.6, geometry.boundingBox.max.x - geometry.boundingBox.min.x);
  const length = Math.max(0.6, geometry.boundingBox.max.y - geometry.boundingBox.min.y);
  const height = Math.max(2.2, geometry.boundingBox.max.z - geometry.boundingBox.min.z);

  return {
    id: source.id,
    floorId: source.floorId,
    floorNumber: source.floorNumber,
    name: source.roomName,
    origin: {
      x: geometry.boundingBox.min.x,
      y: geometry.boundingBox.min.z,
      z: geometry.boundingBox.min.y,
    },
    dimensions: { width, length, height },
    vents: [],
    heatLoadW: Math.max(0, source.equipmentLoad || 0),
  };
}

function toBuildingRooms(
  roomSources: FloorRoomSource[],
  floorGapM: number,
): BuildingRoomAssembly {
  const floorBaseHeights = resolveFloorBaseHeights(roomSources, floorGapM);
  const perFloorFallbackCursor = new Map<string, { x: number; y: number; rowDepth: number }>();

  const buildingRooms: BuildingRoom[] = [];
  const roomGeometry: RoomGeometry[] = [];

  for (const source of roomSources) {
    const baseY = floorBaseHeights.get(source.floorId) ?? 0;
    const height = Math.max(2.2, source.ceilingHeight || source.floorCeilingHeight || 3.0);
    const polygonMeters = toPolygonMeters(source)
      ?? toFallbackPolygonMeters(source, perFloorFallbackCursor);

    const geometry = extrudeRoomFromPolygon(
      {
        id: source.id,
        floorId: source.floorId,
        name: source.roomName,
        polygon: polygonMeters,
        ceilingHeightM: height,
      },
      {
        floorElevationM: baseY,
      },
    );

    roomGeometry.push(geometry);
    buildingRooms.push(toBuildingRoom(source, geometry));
  }

  return {
    rooms: buildingRooms,
    roomGeometry,
  };
}

function toBounds(room: BuildingRoom): RoomBounds {
  return {
    room,
    minX: room.origin.x,
    maxX: room.origin.x + room.dimensions.width,
    minZ: room.origin.z,
    maxZ: room.origin.z + room.dimensions.length,
    minY: room.origin.y,
    maxY: room.origin.y + room.dimensions.height,
  };
}

function inferHorizontalConnections(
  roomGeometry: RoomGeometry[],
  options: {
    adjacencyToleranceM: number;
    minSharedEdgeM: number;
  },
): AirConnection[] {
  const connections: AirConnection[] = [];
  const seen = new Set<string>();

  const byFloor = new Map<string, RoomGeometry[]>();
  for (const geometry of roomGeometry) {
    if (!byFloor.has(geometry.floorId)) {
      byFloor.set(geometry.floorId, []);
    }
    byFloor.get(geometry.floorId)?.push(geometry);
  }

  for (const floorRooms of byFloor.values()) {
    const adjacency = detectAdjacentRooms(floorRooms, {
      endpointToleranceM: options.adjacencyToleranceM,
      minSharedLengthM: options.minSharedEdgeM,
    });

    for (const [roomId, adjacent] of adjacency.entries()) {
      for (const adjacentRoomId of adjacent) {
        const key = pairKey(roomId, adjacentRoomId);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        connections.push({
          id: `conn-${roomId}-${adjacentRoomId}`,
          fromRoom: roomId,
          toRoom: adjacentRoomId,
          type: 'door',
          openingAreaM2: 2.0,
          resistance: 1.0,
        });
      }
    }
  }

  return connections;
}

function inferVerticalConnections(
  rooms: BuildingRoom[],
  options: {
    includeVerticalConnections: boolean;
  },
): AirConnection[] {
  if (!options.includeVerticalConnections) {
    return [];
  }

  const bounds = rooms.map(toBounds);
  const connections: AirConnection[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i];
      const b = bounds[j];
      if (a.room.floorId === b.room.floorId) {
        continue;
      }

      const key = pairKey(a.room.id, b.room.id);
      if (seen.has(key)) {
        continue;
      }

      const overlapX = overlap1D(a.minX, a.maxX, b.minX, b.maxX);
      const overlapZ = overlap1D(a.minZ, a.maxZ, b.minZ, b.maxZ);
      const floorDiff = Math.abs(a.room.floorNumber - b.room.floorNumber);
      const verticalGap = Math.min(Math.abs(a.maxY - b.minY), Math.abs(b.maxY - a.minY));

      if (floorDiff === 1 && overlapX * overlapZ >= 1.0 && verticalGap <= 1.0) {
        connections.push({
          id: `conn-${a.room.id}-${b.room.id}`,
          fromRoom: a.room.id,
          toRoom: b.room.id,
          type: 'shaft',
          openingAreaM2: 1.2,
          resistance: 1.3,
        });
        seen.add(key);
      }
    }
  }

  return connections;
}

function applyConnectionOverrides(
  inferredConnections: AirConnection[],
  overrides: LayoutConnectionOverride[],
): AirConnection[] {
  if (!overrides.length) {
    return inferredConnections;
  }

  const byPair = new Map<string, AirConnection>();
  for (const connection of inferredConnections) {
    byPair.set(pairKey(connection.fromRoom, connection.toRoom), connection);
  }

  for (const override of overrides) {
    const key = pairKey(override.fromRoomId, override.toRoomId);
    if (!override.enabled) {
      byPair.delete(key);
      continue;
    }

    byPair.set(key, {
      id: override.id || `conn-${override.fromRoomId}-${override.toRoomId}`,
      fromRoom: override.fromRoomId,
      toRoom: override.toRoomId,
      type: override.type,
      openingAreaM2: Math.max(0.1, override.openingAreaM2 || 0.1),
      resistance: Math.max(0.01, override.resistance || 0.01),
    });
  }

  return [...byPair.values()];
}

export function buildBuildingGeometryFromFloors(
  floors: FloorSource[],
  connectionOverrides: LayoutConnectionOverride[] = [],
  options: BuildOptions = {},
): BuildingGeometryInput {
  const roomSources = buildRoomSources(floors);
  const assembly = toBuildingRooms(roomSources, options.floorGapM ?? DEFAULT_FLOOR_GAP_M);

  const inferredConnections = [
    ...inferHorizontalConnections(assembly.roomGeometry, {
      adjacencyToleranceM: options.adjacencyToleranceM ?? DEFAULT_ADJ_TOLERANCE_M,
      minSharedEdgeM: options.minSharedEdgeM ?? DEFAULT_MIN_SHARED_EDGE_M,
    }),
    ...inferVerticalConnections(assembly.rooms, {
      includeVerticalConnections: options.includeVerticalConnections !== false,
    }),
  ];

  const connections = applyConnectionOverrides(inferredConnections, connectionOverrides);

  return {
    buildingId: options.buildingId ?? 'building',
    rooms: assembly.rooms,
    connections,
  };
}
