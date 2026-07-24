import type { RoomPolygonPoint } from '@/lib/utils/room-polygon';

export interface CanvasRoom {
  id: string;
  name: string;
  spaceType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  polygonPoints?: RoomPolygonPoint[];
}

export interface FloorData {
  id: string;
  floorNumber: number;
  name: string;
  floorPlanImage: string | null;
  scale: number;
}

export type Tool = 'select' | 'draw' | 'polygon' | 'measure' | 'wall' | 'hvac' | 'tile';

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}
