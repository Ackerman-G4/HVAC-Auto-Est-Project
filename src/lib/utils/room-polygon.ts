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

const EPSILON = 1e-9;

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