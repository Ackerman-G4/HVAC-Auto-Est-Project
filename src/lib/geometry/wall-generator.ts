import type { DoorOpening, Point3D, WallSegment, WindowOpening } from '@/types/geometry';

const DEFAULT_CONSTRUCTION = 'drywall_150mm';

const DEFAULT_WALL_THICKNESS_M: Record<string, number> = {
  drywall_150mm: 0.15,
  concrete_block_200mm: 0.2,
  concrete_block_150mm: 0.15,
  brick_200mm: 0.2,
  curtain_wall: 0.12,
};

const DEFAULT_WALL_UVALUE: Record<string, number> = {
  drywall_150mm: 2.6,
  concrete_block_200mm: 2.1,
  concrete_block_150mm: 2.4,
  brick_200mm: 2.2,
  curtain_wall: 3.3,
};

export interface GenerateWallOptions {
  wallHeightM: number;
  construction?: string;
  thicknessM?: number;
  uValue?: number;
  generateWindows?: (wall: { start: Point3D; end: Point3D; orientation: number; index: number }) => WindowOpening[];
  generateDoors?: (wall: { start: Point3D; end: Point3D; orientation: number; index: number }) => DoorOpening[];
}

function normalizeFootprint(footprint: Point3D[]): Point3D[] {
  if (footprint.length < 2) {
    return footprint;
  }

  const normalized: Point3D[] = [];
  for (const point of footprint) {
    const last = normalized[normalized.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y, last.z - point.z) > 1e-9) {
      normalized.push(point);
    }
  }

  if (normalized.length > 1) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) <= 1e-9) {
      normalized.pop();
    }
  }

  return normalized;
}

function resolveWallThickness(construction: string, thicknessM?: number): number {
  if (thicknessM && thicknessM > 0) {
    return thicknessM;
  }

  return DEFAULT_WALL_THICKNESS_M[construction] ?? DEFAULT_WALL_THICKNESS_M[DEFAULT_CONSTRUCTION];
}

function resolveWallUValue(construction: string, uValue?: number): number {
  if (uValue && uValue > 0) {
    return uValue;
  }

  return DEFAULT_WALL_UVALUE[construction] ?? DEFAULT_WALL_UVALUE[DEFAULT_CONSTRUCTION];
}

function calculateWallOrientationDegrees(start: Point3D, end: Point3D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const radians = Math.atan2(dx, dy);
  const degrees = radians * (180 / Math.PI);
  return (degrees + 360) % 360;
}

export function generateWallSegments(
  footprint: Point3D[],
  options: GenerateWallOptions,
): WallSegment[] {
  const normalizedFootprint = normalizeFootprint(footprint);
  if (normalizedFootprint.length < 3) {
    return [];
  }

  const wallHeightM = Math.max(0, options.wallHeightM);
  const construction = options.construction || DEFAULT_CONSTRUCTION;
  const thickness = resolveWallThickness(construction, options.thicknessM);
  const uValue = resolveWallUValue(construction, options.uValue);

  const walls: WallSegment[] = [];
  for (let i = 0; i < normalizedFootprint.length; i++) {
    const start = normalizedFootprint[i];
    const end = normalizedFootprint[(i + 1) % normalizedFootprint.length];
    const orientation = calculateWallOrientationDegrees(start, end);
    const wallContext = { start, end, orientation, index: i };

    walls.push({
      id: `wall-${i + 1}`,
      start,
      end,
      height: wallHeightM,
      thickness,
      construction,
      uValue,
      orientation,
      windows: options.generateWindows ? options.generateWindows(wallContext) : [],
      doors: options.generateDoors ? options.generateDoors(wallContext) : [],
    });
  }

  return walls;
}