import { getFloorsWithRooms } from '@/lib/firebase/projects-store';
import { getSimulationLayout } from '@/lib/firebase/simulation-layout-store';
import { buildBuildingGeometryFromFloors } from '@/lib/simulation/building-geometry';
import type { BuildingGeometryInput, GeometryInput } from '@/types/simulation';

export const MIN_BUILDING_CELL_SIZE_M = 0.25;

export function toFallbackGeometry(buildingGeometry: BuildingGeometryInput): GeometryInput {
  if (buildingGeometry.rooms.length === 0) {
    return {
      roomId: buildingGeometry.buildingId,
      lengthM: 10,
      widthM: 10,
      heightM: 3,
      raisedFloorHeightM: 0,
      ceilingPlenumHeightM: 0,
      walls: [],
      hvacUnits: [],
      racks: [],
      tiles: [],
      obstructions: [],
    };
  }

  const minX = Math.min(...buildingGeometry.rooms.map((room) => room.origin.x));
  const maxX = Math.max(...buildingGeometry.rooms.map((room) => room.origin.x + room.dimensions.width));
  const minZ = Math.min(...buildingGeometry.rooms.map((room) => room.origin.z));
  const maxZ = Math.max(...buildingGeometry.rooms.map((room) => room.origin.z + room.dimensions.length));
  const maxH = Math.max(...buildingGeometry.rooms.map((room) => room.dimensions.height));

  return {
    roomId: buildingGeometry.buildingId,
    lengthM: Math.max(1, maxX - minX),
    widthM: Math.max(1, maxZ - minZ),
    heightM: Math.max(2.2, maxH),
    raisedFloorHeightM: 0,
    ceilingPlenumHeightM: 0,
    walls: [],
    hvacUnits: [],
    racks: [],
    tiles: [],
    obstructions: [],
  };
}

export async function buildProjectBuildingGeometry(projectId: string): Promise<BuildingGeometryInput> {
  const floors = await getFloorsWithRooms(projectId, {
    includeRoomEquipment: false,
    includeRoomEquipmentCount: false,
  });

  if (floors.length === 0) {
    return {
      buildingId: projectId,
      rooms: [],
      connections: [],
    };
  }

  const layouts = await Promise.all(
    floors.map((floor) => getSimulationLayout(projectId, floor.id)),
  );
  const connectionOverrides = layouts.flatMap((layout) => layout?.connectionOverrides ?? []);

  return buildBuildingGeometryFromFloors(floors, connectionOverrides, {
    buildingId: projectId,
    includeVerticalConnections: true,
  });
}