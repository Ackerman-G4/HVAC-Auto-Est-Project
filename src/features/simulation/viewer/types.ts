export interface DetectedFloor {
  id: string;
  floorNumber: number;
  name: string;
  scale: number;
  ceilingHeight: number;
  rooms: DetectedRoom[];
}

export interface DetectedRoom {
  id: string;
  name: string;
  area: number;
  ceilingHeight: number;
  spaceType: string;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  coolingLoad: { trValue?: number; btuValue?: number } | null;
  polygon?: string;
}

export interface ViewerRoomBoundary {
  id: string;
  name: string;
  points: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number };
}
