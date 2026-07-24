import type { Point2D, Point3D } from '@/types/geometry';

const EPSILON = 1e-9;

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

export function normalizePolygon(points: Point2D[]): Point2D[] {
  const deduped: Point2D[] = [];
  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (!last || !almostEqual(last.x, point.x) || !almostEqual(last.y, point.y)) {
      deduped.push(point);
    }
  }

  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (almostEqual(first.x, last.x) && almostEqual(first.y, last.y)) {
      deduped.pop();
    }
  }

  return deduped;
}

export function projectFootprintTo2D(footprint: Point3D[]): Point2D[] {
  return footprint.map((point) => ({ x: point.x, y: point.y }));
}

export function calculatePolygonSignedArea(points: Point2D[]): number {
  const normalized = normalizePolygon(points);
  if (normalized.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < normalized.length; i++) {
    const next = normalized[(i + 1) % normalized.length];
    area += normalized[i].x * next.y - next.x * normalized[i].y;
  }

  return area / 2;
}

export function calculatePolygonArea(points: Point2D[]): number {
  return Math.abs(calculatePolygonSignedArea(points));
}

export function calculatePolygonPerimeter(points: Point2D[]): number {
  const normalized = normalizePolygon(points);
  if (normalized.length < 2) {
    return 0;
  }

  let perimeter = 0;
  for (let i = 0; i < normalized.length; i++) {
    const next = normalized[(i + 1) % normalized.length];
    perimeter += Math.hypot(next.x - normalized[i].x, next.y - normalized[i].y);
  }

  return perimeter;
}

export function calculatePolygonCentroid(points: Point2D[]): Point2D {
  const normalized = normalizePolygon(points);
  if (normalized.length < 3) {
    return { x: 0, y: 0 };
  }

  const signedArea = calculatePolygonSignedArea(normalized);
  if (Math.abs(signedArea) <= EPSILON) {
    const avgX = normalized.reduce((sum, point) => sum + point.x, 0) / normalized.length;
    const avgY = normalized.reduce((sum, point) => sum + point.y, 0) / normalized.length;
    return { x: avgX, y: avgY };
  }

  let centroidX = 0;
  let centroidY = 0;

  for (let i = 0; i < normalized.length; i++) {
    const next = normalized[(i + 1) % normalized.length];
    const cross = normalized[i].x * next.y - next.x * normalized[i].y;
    centroidX += (normalized[i].x + next.x) * cross;
    centroidY += (normalized[i].y + next.y) * cross;
  }

  const factor = 1 / (6 * signedArea);
  return {
    x: centroidX * factor,
    y: centroidY * factor,
  };
}

export function calculateRoomVolume(
  footprint: Point3D[] | Point2D[],
  ceilingHeight: number,
  obstructionVolumeM3 = 0,
): number {
  if (ceilingHeight <= 0) {
    return 0;
  }

  const points2D = footprint.length > 0 && 'z' in footprint[0]
    ? projectFootprintTo2D(footprint as Point3D[])
    : (footprint as Point2D[]);
  const area = calculatePolygonArea(points2D);
  const grossVolume = area * ceilingHeight;
  return Math.max(0, grossVolume - Math.max(0, obstructionVolumeM3));
}

export function calculateRoomSurfaceArea(
  floorArea: number,
  perimeter: number,
  ceilingHeight: number,
): number {
  const wallArea = Math.max(0, perimeter) * Math.max(0, ceilingHeight);
  return Math.max(0, wallArea + floorArea * 2);
}

export function calculateBoundingBox(
  footprint: Point3D[],
  ceilingHeight: number,
): { min: Point3D; max: Point3D } {
  if (footprint.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const point of footprint) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ + Math.max(0, ceilingHeight) },
  };
}

export function calculateRoomGeometryMetrics(
  footprint: Point3D[],
  ceilingHeight: number,
  obstructionVolumeM3 = 0,
): {
  floorArea: number;
  perimeter: number;
  volume: number;
  surfaceArea: number;
  centroid2D: Point2D;
  boundingBox: { min: Point3D; max: Point3D };
} {
  const footprint2D = projectFootprintTo2D(footprint);
  const floorArea = calculatePolygonArea(footprint2D);
  const perimeter = calculatePolygonPerimeter(footprint2D);
  const volume = calculateRoomVolume(footprint2D, ceilingHeight, obstructionVolumeM3);
  const surfaceArea = calculateRoomSurfaceArea(floorArea, perimeter, ceilingHeight);
  const centroid2D = calculatePolygonCentroid(footprint2D);
  const boundingBox = calculateBoundingBox(footprint, ceilingHeight);

  return {
    floorArea,
    perimeter,
    volume,
    surfaceArea,
    centroid2D,
    boundingBox,
  };
}