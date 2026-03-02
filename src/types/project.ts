export type ProjectStatus = 'draft' | 'active' | 'archived' | 'deleted';
export type OutputClassification = 'preliminary' | 'ifc';
export type BuildingType = 'office' | 'retail' | 'residential' | 'hotel' | 'hospital' | 'restaurant' | 'warehouse' | 'school' | 'mixed';

export interface Project {
  id: string;
  name: string;
  location: string;
  buildingType: BuildingType;
  status: ProjectStatus;
  outputClassification: OutputClassification;
  designConditions: DesignConditions;
  safetyFactor: number;
  diversityFactor: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignConditions {
  outdoorDB: number; // °C
  outdoorWB: number; // °C
  indoorDB: number;  // °C
  indoorRH: number;  // %
  altitude: number;  // meters
  latitude: number;
  longitude: number;
}

export interface Floor {
  id: string;
  projectId: string;
  floorNumber: number;
  name: string;
  floorPlanImage: string | null;
  scale: number; // px per meter
  ceilingHeight: number; // meters
  rooms: Room[];
}

export interface Room {
  id: string;
  floorId: string;
  name: string;
  polygon: { x: number; y: number }[];
  area: number; // m²
  perimeter: number; // m
  spaceType: SpaceType;
  occupantCount: number;
  lightingDensity: number; // W/m²
  equipmentLoad: number; // W/m²
  wallConstruction: WallType;
  windowArea: number; // m²
  windowOrientation: Orientation;
  windowType: GlassType;
  ceilingHeight: number;
  notes: string;
}

export type SpaceType =
  | 'office'
  | 'conference'
  | 'lobby'
  | 'retail'
  | 'restaurant'
  | 'kitchen'
  | 'hotel_room'
  | 'server_room'
  | 'corridor'
  | 'restroom'
  | 'storage'
  | 'residential'
  | 'classroom'
  | 'hospital_ward'
  | 'operating_room'
  | 'parking';

export type WallType =
  | 'concrete_200mm'
  | 'concrete_150mm'
  | 'concrete_block_200mm'
  | 'concrete_block_150mm'
  | 'brick_200mm'
  | 'drywall_metal_stud'
  | 'curtain_wall'
  | 'insulated_panel';

export type GlassType =
  | 'single_clear_6mm'
  | 'single_tinted_6mm'
  | 'double_clear'
  | 'double_tinted'
  | 'double_low_e'
  | 'triple_low_e';

export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface ProjectFormData {
  name: string;
  location: string;
  buildingType: BuildingType;
  notes?: string;
  safetyFactor?: number;
  diversityFactor?: number;
}
