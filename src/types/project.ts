export type ProjectStatus = 'draft' | 'active' | 'archived' | 'deleted';
export type OutputClassification = 'preliminary' | 'ifc';
export type BuildingType = 'office' | 'retail' | 'residential' | 'hotel' | 'hospital' | 'restaurant' | 'warehouse' | 'school' | 'mixed';

export interface ProjectMetadata {
  id: string;
  name: string;
  clientName: string;
  location: string;
  city: string;
  buildingType: BuildingType;
  status: ProjectStatus;
  totalFloorArea: number;
  floorsAboveGrade: number;
  floorsBelowGrade: number;
  notes: string;
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  safetyFactor: number;
  diversityFactor: number;
  createdAt: string;
  updatedAt: string;
}

// Full hydrated project object used in store and pages
export interface DetailedProject extends ProjectMetadata {
  floors: DetailedFloor[];
  boqItems?: Record<string, any>;
  selectedEquipment?: Record<string, any>;
  coolingLoads?: Record<string, any>;
}

export interface DetailedFloor {
  id: string;
  projectId: string;
  floorNumber: number;
  name: string;
  floorPlanImage: string | null;
  scale: number; 
  ceilingHeight: number;
  rooms: DetailedRoom[];
}

export interface DetailedRoom {
  id: string;
  floorId: string;
  name: string;
  area: number;
  perimeter: number;
  polygon?: { x: number; y: number }[];
  spaceType: SpaceType;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  wallConstruction: WallType;
  windowArea: number;
  windowOrientation: Orientation;
  windowType: GlassType;
  ceilingHeight: number;
  notes: string;
  coolingLoad?: any; // The calculated results
}

export interface DesignConditions {
  outdoorDB: number;
  outdoorWB: number;
  indoorDB: number;
  indoorRH: number;
  altitude?: number;
  latitude?: number;
  longitude?: number;
}

export interface Project extends ProjectMetadata {
  outputClassification?: OutputClassification;
  designConditions?: DesignConditions;
}

export interface Floor extends DetailedFloor {}
export interface Room extends DetailedRoom {}

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
  | 'gym'
  | 'theater'
  | 'warehouse'
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
  clientName?: string;
  location?: string;
  buildingType?: BuildingType;
  notes?: string;
  safetyFactor?: number;
  diversityFactor?: number;
  outdoorDB?: number;
  outdoorRH?: number;
  indoorDB?: number;
  indoorRH?: number;
  totalFloorArea?: number;
}
