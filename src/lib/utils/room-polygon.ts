export interface RoomPolygonRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

export function parseRoomPolygonRect(rawValue: unknown): RoomPolygonRect | null {
  if (typeof rawValue === 'string') {
    if (!rawValue.trim()) return null;
    try {
      return parsePolygonRectValue(JSON.parse(rawValue));
    } catch {
      return null;
    }
  }

  return parsePolygonRectValue(rawValue);
}