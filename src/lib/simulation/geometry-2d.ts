/**
 * Pure 2D geometry predicates + floor-scale resolution, shared by the CFD
 * layout normalizer (lib) and the viewer helpers (feature). Kept dependency-free
 * so both layers can import it without a cycle.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Metres-per-pixel scale for a room polygon. First positive of the polygon's
 * embedded scale, then the floor scale, else the canvas default (50). Never 1 —
 * a scaleless polygon must not be treated as if pixels were metres (that was a
 * ~50× blow-up bug that pushed geometry off the grid).
 */
export const DEFAULT_CANVAS_SCALE = 50;

export function resolveFloorScale(
  polygonScale: number | undefined,
  floorScale: number | undefined,
): number {
  if (typeof polygonScale === 'number' && polygonScale > 0) return polygonScale;
  if (typeof floorScale === 'number' && floorScale > 0) return floorScale;
  return DEFAULT_CANVAS_SCALE;
}

export function distancePointToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < 1e-9) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

export function isPointInsidePolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function minDistanceToPolygonEdges(point: Point2D, polygon: Point2D[]): number {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const distance = distancePointToSegment(point, start, end);
    minDistance = Math.min(minDistance, distance);
  }
  return minDistance;
}

export function overlapIntervals(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && bMin < aMax;
}
