import type { Point2D, Point3D, RoomGeometry } from '@/types/geometry';
import { calculateRoomGeometryMetrics } from '@/lib/geometry/volume-calculator';
import { generateWallSegments } from '@/lib/geometry/wall-generator';

export interface RoomExtrusionInput {
  id: string;
  floorId: string;
  name: string;
  polygon: Point2D[];
  ceilingHeightM: number;
}

export interface RoomExtrusionOptions {
  floorElevationM?: number;
  floorThicknessM?: number;
  ceilingThicknessM?: number;
  wallConstruction?: string;
  wallThicknessM?: number;
  wallUValue?: number;
  obstructionVolumeM3?: number;
}

function toFootprint3D(points: Point2D[], z: number): Point3D[] {
  return points.map((point) => ({ x: point.x, y: point.y, z }));
}

export function extrudeRoomFromPolygon(
  input: RoomExtrusionInput,
  options: RoomExtrusionOptions = {},
): RoomGeometry {
  const floorElevationM = options.floorElevationM ?? 0;
  const footprint = toFootprint3D(input.polygon, floorElevationM);

  const ceilingHeight = Math.max(0, input.ceilingHeightM);
  const floorThickness = Math.max(0, options.floorThicknessM ?? 0.15);
  const ceilingThickness = Math.max(0, options.ceilingThicknessM ?? 0.12);
  const obstructionVolume = Math.max(0, options.obstructionVolumeM3 ?? 0);

  const metrics = calculateRoomGeometryMetrics(footprint, ceilingHeight, obstructionVolume);
  const walls = generateWallSegments(footprint, {
    wallHeightM: ceilingHeight,
    construction: options.wallConstruction,
    thicknessM: options.wallThicknessM,
    uValue: options.wallUValue,
  });

  return {
    id: input.id,
    floorId: input.floorId,
    name: input.name,
    footprint,
    ceilingHeight,
    floorThickness,
    ceilingThickness,
    walls,
    volume: metrics.volume,
    surfaceArea: metrics.surfaceArea,
    floorArea: metrics.floorArea,
    perimeter: metrics.perimeter,
    boundingBox: metrics.boundingBox,
    centroid: {
      x: metrics.centroid2D.x,
      y: metrics.centroid2D.y,
      z: floorElevationM + ceilingHeight / 2,
    },
    adjacentRooms: [],
  };
}