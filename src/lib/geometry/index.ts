export { extrudeRoomFromPolygon } from '@/lib/geometry/room-extruder';
export { applyAdjacencyToRooms, buildRoomSpatialHash, detectAdjacentRooms } from '@/lib/geometry/spatial-index';
export { generateWallSegments } from '@/lib/geometry/wall-generator';
export {
  calculateBoundingBox,
  calculatePolygonArea,
  calculatePolygonCentroid,
  calculatePolygonPerimeter,
  calculateRoomGeometryMetrics,
  calculateRoomSurfaceArea,
  calculateRoomVolume,
  normalizePolygon,
  projectFootprintTo2D,
} from '@/lib/geometry/volume-calculator';