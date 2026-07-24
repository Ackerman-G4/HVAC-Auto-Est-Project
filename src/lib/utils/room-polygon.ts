export interface RoomPolygonRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
}

export interface RoomPolygonPoint {
  x: number;
  y: number;
}

export interface RoomPolygonData {
  points: RoomPolygonPoint[];
  scale?: number;
}

export interface RoomPolygonBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface RoomPolygonValidationOptions {
  minArea?: number;
  epsilon?: number;
}

export interface RoomPolygonValidationResult {
  isValid: boolean;
  issues: string[];
  area: number;
  perimeter: number;
}

const EPSILON = 1e-9;

function pointsEqual(a: RoomPolygonPoint, b: RoomPolygonPoint, epsilon: number): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function crossProduct(a: RoomPolygonPoint, b: RoomPolygonPoint, c: RoomPolygonPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isPointOnSegment(
  segmentStart: RoomPolygonPoint,
  segmentEnd: RoomPolygonPoint,
  point: RoomPolygonPoint,
  epsilon: number,
): boolean {
  if (Math.abs(crossProduct(segmentStart, segmentEnd, point)) > epsilon) {
    return false;
  }

  return (
    point.x >= Math.min(segmentStart.x, segmentEnd.x) - epsilon
    && point.x <= Math.max(segmentStart.x, segmentEnd.x) + epsilon
    && point.y >= Math.min(segmentStart.y, segmentEnd.y) - epsilon
    && point.y <= Math.max(segmentStart.y, segmentEnd.y) + epsilon
  );
}

function segmentsIntersect(
  a1: RoomPolygonPoint,
  a2: RoomPolygonPoint,
  b1: RoomPolygonPoint,
  b2: RoomPolygonPoint,
  epsilon: number,
): boolean {
  const d1 = crossProduct(a1, a2, b1);
  const d2 = crossProduct(a1, a2, b2);
  const d3 = crossProduct(b1, b2, a1);
  const d4 = crossProduct(b1, b2, a2);

  const aStraddles = (d1 > epsilon && d2 < -epsilon) || (d1 < -epsilon && d2 > epsilon);
  const bStraddles = (d3 > epsilon && d4 < -epsilon) || (d3 < -epsilon && d4 > epsilon);
  if (aStraddles && bStraddles) {
    return true;
  }

  if (Math.abs(d1) <= epsilon && isPointOnSegment(a1, a2, b1, epsilon)) return true;
  if (Math.abs(d2) <= epsilon && isPointOnSegment(a1, a2, b2, epsilon)) return true;
  if (Math.abs(d3) <= epsilon && isPointOnSegment(b1, b2, a1, epsilon)) return true;
  if (Math.abs(d4) <= epsilon && isPointOnSegment(b1, b2, a2, epsilon)) return true;

  return false;
}

function hasSelfIntersections(points: RoomPolygonPoint[], epsilon: number): boolean {
  const edgeCount = points.length;
  if (edgeCount < 4) {
    return false;
  }

  for (let i = 0; i < edgeCount; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % edgeCount];

    for (let j = i + 1; j < edgeCount; j++) {
      const areAdjacent = Math.abs(i - j) <= 1 || (i === 0 && j === edgeCount - 1);
      if (areAdjacent) {
        continue;
      }

      const b1 = points[j];
      const b2 = points[(j + 1) % edgeCount];

      if (segmentsIntersect(a1, a2, b1, b2, epsilon)) {
        return true;
      }
    }
  }

  return false;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseRawValue(rawValue: unknown): unknown {
  if (typeof rawValue === 'string') {
    if (!rawValue.trim()) return null;
    try {
      return JSON.parse(rawValue);
    } catch {
      return null;
    }
  }

  return rawValue;
}

function parsePolygonRectValue(value: unknown): RoomPolygonRect | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const x = toFiniteNumber(candidate.x);
  const y = toFiniteNumber(candidate.y);
  const width = toFiniteNumber(candidate.width);
  const height = toFiniteNumber(candidate.height);

  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  const scale = toFiniteNumber(candidate.scale);
  return scale && scale > 0
    ? { x, y, width, height, scale }
    : { x, y, width, height };
}

function parsePolygonPointValue(value: unknown): RoomPolygonPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const x = toFiniteNumber(candidate.x);
  const y = toFiniteNumber(candidate.y);

  if (x === null || y === null) {
    return null;
  }

  return { x, y };
}

function normalizePolygonPoints(points: RoomPolygonPoint[]): RoomPolygonPoint[] {
  const deduped: RoomPolygonPoint[] = [];
  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(last.x - point.x) > EPSILON || Math.abs(last.y - point.y) > EPSILON) {
      deduped.push(point);
    }
  }

  if (deduped.length >= 2) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.abs(first.x - last.x) <= EPSILON && Math.abs(first.y - last.y) <= EPSILON) {
      deduped.pop();
    }
  }

  return deduped;
}

function parsePointArray(value: unknown): RoomPolygonPoint[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed = value
    .map(parsePolygonPointValue)
    .filter((point): point is RoomPolygonPoint => Boolean(point));

  const normalized = normalizePolygonPoints(parsed);
  return normalized.length >= 3 ? normalized : null;
}

export function createRectPolygonPoints(rect: RoomPolygonRect): RoomPolygonPoint[] {
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  return [
    { x: rect.x, y: rect.y },
    { x: x2, y: rect.y },
    { x: x2, y: y2 },
    { x: rect.x, y: y2 },
  ];
}

export function getPolygonBounds(points: RoomPolygonPoint[]): RoomPolygonBounds | null {
  if (points.length < 3) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { minX, minY, maxX, maxY, width, height };
}

function parsePolygonDataValue(value: unknown): RoomPolygonData | null {
  if (value === null || value === undefined) {
    return null;
  }

  const pointsFromArray = parsePointArray(value);
  if (pointsFromArray) {
    return { points: pointsFromArray };
  }

  const rect = parsePolygonRectValue(value);
  if (rect) {
    return {
      points: createRectPolygonPoints(rect),
      scale: rect.scale,
    };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const points = parsePointArray(candidate.points);
  if (!points) {
    return null;
  }

  const scale = toFiniteNumber(candidate.scale);
  return scale && scale > 0
    ? { points, scale }
    : { points };
}

export function parseRoomPolygon(rawValue: unknown): RoomPolygonData | null {
  return parsePolygonDataValue(parseRawValue(rawValue));
}

export function parseRoomPolygonRect(rawValue: unknown): RoomPolygonRect | null {
  const parsedRaw = parseRawValue(rawValue);

  const rect = parsePolygonRectValue(parsedRaw);
  if (rect) {
    return rect;
  }

  const polygon = parsePolygonDataValue(parsedRaw);
  if (!polygon) {
    return null;
  }

  const bounds = getPolygonBounds(polygon.points);
  if (!bounds) {
    return null;
  }

  return polygon.scale && polygon.scale > 0
    ? { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height, scale: polygon.scale }
    : { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height };
}

export function calculatePolygonArea(points: RoomPolygonPoint[]): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }

  return Math.abs(area) / 2;
}

export function calculatePolygonPerimeter(points: RoomPolygonPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    perimeter += Math.hypot(next.x - points[i].x, next.y - points[i].y);
  }

  return perimeter;
}

export function validateRoomPolygon(
  points: RoomPolygonPoint[],
  options: RoomPolygonValidationOptions = {},
): RoomPolygonValidationResult {
  const epsilon = options.epsilon ?? EPSILON;
  const minArea = options.minArea ?? 0;
  const issues: string[] = [];

  if (points.length < 3) {
    issues.push('Polygon must contain at least 3 vertices.');
  }

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      issues.push('Polygon vertices must be finite numbers.');
      break;
    }
  }

  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    if (pointsEqual(points[i], next, epsilon)) {
      issues.push('Polygon contains overlapping adjacent vertices.');
      break;
    }
  }

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const areAdjacent = Math.abs(i - j) === 1 || (i === 0 && j === points.length - 1);
      if (areAdjacent) {
        continue;
      }

      if (pointsEqual(points[i], points[j], epsilon)) {
        issues.push('Polygon contains duplicate non-adjacent vertices.');
        i = points.length;
        break;
      }
    }
  }

  const area = calculatePolygonArea(points);
  const perimeter = calculatePolygonPerimeter(points);

  if (area <= epsilon) {
    issues.push('Polygon area must be greater than zero.');
  }

  if (minArea > 0 && area < minArea) {
    issues.push(`Polygon area must be at least ${minArea} m².`);
  }

  if (points.length >= 4 && hasSelfIntersections(points, epsilon)) {
    issues.push('Polygon edges must not intersect.');
  }

  return {
    isValid: issues.length === 0,
    issues,
    area,
    perimeter,
  };
}