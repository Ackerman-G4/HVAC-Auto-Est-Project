import { buildBuildingGeometryAssemblyFromFloors } from '@/lib/simulation/building-geometry';
import type { DoorOpening, WindowOpening } from '@/types/geometry';

export interface BuildingViewerCoolingLoad {
  trValue: number;
  btuPerHour: number;
  totalLoad: number;
}

export interface BuildingViewerRoomInput {
  id: string;
  name: string;
  spaceType: string;
  area: number;
  perimeter?: number;
  ceilingHeight: number;
  polygon?: string;
  equipmentLoad?: number;
  wallConstruction?: string;
  windowArea?: number;
  windowOrientation?: string;
  windowType?: string;
  coolingLoad?: BuildingViewerCoolingLoad | null;
}

export interface BuildingViewerFloorInput {
  id: string;
  floorNumber: number;
  name: string;
  scale?: number;
  ceilingHeight?: number;
  rooms: BuildingViewerRoomInput[];
}

export interface BuildingViewerAdapterRoom {
  room: BuildingViewerRoomInput;
  floorId: string;
  floorNumber: number;
  floorName: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  walls: BuildingViewerAdapterWall[];
}

export interface BuildingViewerAdapterWall {
  id: string;
  start: {
    x: number;
    y: number;
    z: number;
  };
  end: {
    x: number;
    y: number;
    z: number;
  };
  heightM: number;
  thicknessM: number;
  orientationDeg: number;
  windows: WindowOpening[];
  doors: DoorOpening[];
  placementWarnings: string[];
}

export interface BuildingViewerAdapterFloor {
  floorId: string;
  floorNumber: number;
  floorName: string;
  rooms: BuildingViewerAdapterRoom[];
}

export interface BuildingViewerAdapterResult {
  floors: BuildingViewerAdapterFloor[];
}

const DEFAULT_FLOOR_SCALE = 50;
const DEFAULT_CEILING_HEIGHT_M = 3.0;

function roomKey(floorId: string, roomId: string): string {
  return `${floorId}::${roomId}`;
}

export function adaptFloorsForBuildingViewer(
  floors: BuildingViewerFloorInput[],
): BuildingViewerAdapterResult {
  if (!floors.length) {
    return { floors: [] };
  }

  const orderedFloors = [...floors].sort((a, b) => a.floorNumber - b.floorNumber);
  const floorById = new Map(orderedFloors.map((floor) => [floor.id, floor]));
  const roomByKey = new Map<string, BuildingViewerRoomInput>();

  for (const floor of orderedFloors) {
    for (const room of floor.rooms ?? []) {
      roomByKey.set(roomKey(floor.id, room.id), room);
    }
  }

  const geometryFloors = orderedFloors.map((floor) => ({
    id: floor.id,
    floorNumber: floor.floorNumber,
    scale: floor.scale && floor.scale > 0 ? floor.scale : DEFAULT_FLOOR_SCALE,
    ceilingHeight: floor.ceilingHeight && floor.ceilingHeight > 0
      ? floor.ceilingHeight
      : DEFAULT_CEILING_HEIGHT_M,
    rooms: (floor.rooms ?? []).map((room) => ({
      id: room.id,
      name: room.name,
      spaceType: room.spaceType,
      polygon: room.polygon,
      area: room.area,
      perimeter: room.perimeter ?? 0,
      ceilingHeight: room.ceilingHeight,
      equipmentLoad: room.equipmentLoad ?? 0,
      wallConstruction: room.wallConstruction,
      windowArea: room.windowArea,
      windowOrientation: room.windowOrientation,
      windowType: room.windowType,
    })),
  }));

  const assembly = buildBuildingGeometryAssemblyFromFloors(geometryFloors, [], {
    buildingId: 'viewer-adapter',
    includeVerticalConnections: false,
  });
  const buildingGeometry = assembly.geometry;
  const roomGeometryByKey = new Map(
    assembly.roomGeometry.map((roomGeometry) => [roomKey(roomGeometry.floorId, roomGeometry.id), roomGeometry]),
  );

  const roomsByFloor = new Map<string, BuildingViewerAdapterRoom[]>();
  for (const floor of orderedFloors) {
    roomsByFloor.set(floor.id, []);
  }

  for (const geometryRoom of buildingGeometry.rooms) {
    const floor = floorById.get(geometryRoom.floorId);
    const room = roomByKey.get(roomKey(geometryRoom.floorId, geometryRoom.id));
    const roomGeometry = roomGeometryByKey.get(roomKey(geometryRoom.floorId, geometryRoom.id));
    if (!floor || !room) {
      continue;
    }

    const floorRooms = roomsByFloor.get(floor.id);
    if (!floorRooms) {
      continue;
    }

    const walls: BuildingViewerAdapterWall[] = (roomGeometry?.walls ?? []).map((wall) => ({
      id: wall.id,
      start: {
        x: wall.start.x,
        y: wall.start.z,
        z: wall.start.y,
      },
      end: {
        x: wall.end.x,
        y: wall.end.z,
        z: wall.end.y,
      },
      heightM: wall.height,
      thicknessM: wall.thickness,
      orientationDeg: wall.orientation,
      windows: wall.windows,
      doors: wall.doors,
      placementWarnings: wall.placementWarnings ?? [],
    }));

    floorRooms.push({
      room,
      floorId: floor.id,
      floorNumber: floor.floorNumber,
      floorName: floor.name,
      x: geometryRoom.origin.x,
      y: geometryRoom.origin.y,
      z: geometryRoom.origin.z,
      w: geometryRoom.dimensions.width,
      h: geometryRoom.dimensions.height,
      d: geometryRoom.dimensions.length,
      lengthM: geometryRoom.dimensions.width,
      widthM: geometryRoom.dimensions.length,
      heightM: geometryRoom.dimensions.height,
      walls,
    });
  }

  return {
    floors: orderedFloors.map((floor) => ({
      floorId: floor.id,
      floorNumber: floor.floorNumber,
      floorName: floor.name,
      rooms: (roomsByFloor.get(floor.id) ?? []).sort((a, b) => {
        if (a.x === b.x) {
          return a.z - b.z;
        }
        return a.x - b.x;
      }),
    })),
  };
}
