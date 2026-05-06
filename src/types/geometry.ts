export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface WindowOpening {
  id: string;
  width: number;
  height: number;
  sillHeight: number;
  glassType: string;
  shadingCoefficient: number;
  orientation: number;
}

export interface DoorOpening {
  id: string;
  width: number;
  height: number;
  sillHeight: number;
  swingDirection: 'left' | 'right' | 'double' | 'sliding';
}

export interface WallSegment {
  id: string;
  start: Point3D;
  end: Point3D;
  height: number;
  thickness: number;
  construction: string;
  uValue: number;
  orientation: number;
  windows: WindowOpening[];
  doors: DoorOpening[];
}

export interface RoomGeometry {
  id: string;
  floorId: string;
  name: string;
  footprint: Point3D[];
  ceilingHeight: number;
  floorThickness: number;
  ceilingThickness: number;
  walls: WallSegment[];
  volume: number;
  surfaceArea: number;
  floorArea: number;
  perimeter: number;
  boundingBox: {
    min: Point3D;
    max: Point3D;
  };
  centroid: Point3D;
  adjacentRooms: string[];
}

export interface FloorGeometry {
  id: string;
  floorNumber: number;
  elevation: number;
  rooms: RoomGeometry[];
  slabThickness: number;
  columns: Point3D[];
  beams: Array<{
    start: Point3D;
    end: Point3D;
    height: number;
  }>;
}

export interface BuildingGeometry {
  id: string;
  name: string;
  floors: FloorGeometry[];
  latitude: number;
  longitude: number;
  altitude: number;
  orientation: number;
  roofType: string;
  roofUValue: number;
  groundContactUValue: number;
}