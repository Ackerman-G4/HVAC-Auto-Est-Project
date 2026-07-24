import {
  calculatePolygonArea,
  createRectPolygonPoints,
  type RoomPolygonPoint,
} from '@/lib/utils/room-polygon';
import type { CanvasRoom } from './types';

export function drawPolygonPath(ctx: CanvasRenderingContext2D, points: RoomPolygonPoint[]): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

export function pointInPolygon(point: RoomPolygonPoint, polygon: RoomPolygonPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distancePointToSegment(
  point: RoomPolygonPoint,
  segmentStart: RoomPolygonPoint,
  segmentEnd: RoomPolygonPoint,
): number {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
  }

  const t = ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));
  const closestX = segmentStart.x + clampedT * dx;
  const closestY = segmentStart.y + clampedT * dy;

  return Math.hypot(point.x - closestX, point.y - closestY);
}

export function findNearestEdgeIndex(
  polygon: RoomPolygonPoint[],
  point: RoomPolygonPoint,
  maxDistance: number,
): number | null {
  if (polygon.length < 3) {
    return null;
  }

  let nearestIndex: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const distance = distancePointToSegment(point, start, end);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  if (nearestDistance > maxDistance) {
    return null;
  }

  return nearestIndex;
}

export function getRoomPolygonPoints(room: CanvasRoom): RoomPolygonPoint[] {
  if (room.polygonPoints && room.polygonPoints.length >= 3) {
    return room.polygonPoints;
  }

  return createRectPolygonPoints({
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
  });
}

export function getRoomAreaM2(room: CanvasRoom, scalePxPerM: number): number {
  const points = getRoomPolygonPoints(room).map((point) => ({
    x: point.x / scalePxPerM,
    y: point.y / scalePxPerM,
  }));
  return calculatePolygonArea(points);
}

export function getRoomLabelCenter(room: CanvasRoom): { x: number; y: number } {
  const polygon = room.polygonPoints;
  if (!polygon || polygon.length < 3) {
    return {
      x: room.x + room.width / 2,
      y: room.y + room.height / 2,
    };
  }

  let areaFactor = 0;
  let centerX = 0;
  let centerY = 0;

  for (let i = 0; i < polygon.length; i++) {
    const next = polygon[(i + 1) % polygon.length];
    const cross = polygon[i].x * next.y - next.x * polygon[i].y;
    areaFactor += cross;
    centerX += (polygon[i].x + next.x) * cross;
    centerY += (polygon[i].y + next.y) * cross;
  }

  if (Math.abs(areaFactor) <= 1e-9) {
    return {
      x: room.x + room.width / 2,
      y: room.y + room.height / 2,
    };
  }

  return {
    x: centerX / (3 * areaFactor),
    y: centerY / (3 * areaFactor),
  };
}
