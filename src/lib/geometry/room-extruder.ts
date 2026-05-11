import type { DoorOpening, Point2D, Point3D, RoomGeometry } from '@/types/geometry';
import { calculateRoomGeometryMetrics } from '@/lib/geometry/volume-calculator';
import { generateWallSegments, type GenerateWallOptions } from '@/lib/geometry/wall-generator';

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
  windowAreaM2?: number;
  windowType?: string;
  windowOrientation?: string;
  spaceType?: string;
}

interface WallDescriptor {
  index: number;
  lengthM: number;
  orientationDeg: number;
}

interface Range1D {
  start: number;
  end: number;
}

const CARDINAL_TO_DEGREES: Record<string, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

const WALL_CONSTRUCTION_ALIASES: Record<string, string> = {
  concrete_200mm: 'concrete_block_200mm',
  concrete_150mm: 'concrete_block_150mm',
  drywall_metal_stud: 'drywall_150mm',
  gypsum_partition: 'drywall_150mm',
  insulated_panel: 'curtain_wall',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wallLengthMeters(start: Point3D, end: Point3D): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function wallOrientationDegrees(start: Point3D, end: Point3D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
}

function angleDistanceDegrees(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function normalizeWallConstruction(wallConstruction?: string): string | undefined {
  if (!wallConstruction) {
    return undefined;
  }

  return WALL_CONSTRUCTION_ALIASES[wallConstruction] ?? wallConstruction;
}

function orientationFromCardinal(orientation?: string): number | null {
  if (!orientation) {
    return null;
  }

  const normalized = orientation.trim().toUpperCase();
  return CARDINAL_TO_DEGREES[normalized] ?? null;
}

function buildWallDescriptors(footprint: Point3D[]): WallDescriptor[] {
  if (footprint.length < 3) {
    return [];
  }

  const descriptors: WallDescriptor[] = [];
  for (let index = 0; index < footprint.length; index++) {
    const start = footprint[index];
    const end = footprint[(index + 1) % footprint.length];
    const lengthM = wallLengthMeters(start, end);
    if (lengthM <= 1e-6) {
      continue;
    }

    descriptors.push({
      index,
      lengthM,
      orientationDeg: wallOrientationDegrees(start, end),
    });
  }

  return descriptors;
}

function glassShadingCoefficient(windowType?: string): number {
  switch ((windowType ?? '').toLowerCase()) {
    case 'single_tinted_6mm':
      return 0.72;
    case 'double_tinted':
      return 0.58;
    case 'double_low_e':
      return 0.45;
    case 'triple_low_e':
      return 0.32;
    case 'double_clear':
      return 0.62;
    default:
      return 0.8;
  }
}

function resolveWindowFrameStyle(windowType?: string): 'minimal' | 'standard' | 'thermally_broken' {
  switch ((windowType ?? '').toLowerCase()) {
    case 'double_low_e':
    case 'triple_low_e':
      return 'thermally_broken';
    case 'double_clear':
    case 'double_tinted':
    case 'single_tinted_6mm':
      return 'standard';
    default:
      return 'minimal';
  }
}

function resolveWindowFrameThicknessM(windowType?: string): number {
  switch ((windowType ?? '').toLowerCase()) {
    case 'double_low_e':
    case 'triple_low_e':
      return 0.05;
    case 'double_clear':
    case 'double_tinted':
      return 0.042;
    default:
      return 0.032;
  }
}

function resolveWindowMullionCount(windowType: string | undefined, paneWidthM: number): number {
  const normalized = (windowType ?? '').toLowerCase();
  if (paneWidthM < 1.1) {
    return 0;
  }

  if (normalized === 'triple_low_e' || paneWidthM > 1.9) {
    return 2;
  }

  if (normalized === 'double_low_e' || paneWidthM > 1.35) {
    return 1;
  }

  return 0;
}

function mergeRanges(ranges: Range1D[]): Range1D[] {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range1D[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

function subtractRanges(base: Range1D, blocked: Range1D[]): Range1D[] {
  if (base.end <= base.start) {
    return [];
  }

  if (blocked.length === 0) {
    return [{ ...base }];
  }

  const mergedBlocked = mergeRanges(blocked)
    .map((range) => ({
      start: clamp(range.start, base.start, base.end),
      end: clamp(range.end, base.start, base.end),
    }))
    .filter((range) => range.end > range.start);

  if (mergedBlocked.length === 0) {
    return [{ ...base }];
  }

  const result: Range1D[] = [];
  let cursor = base.start;
  for (const range of mergedBlocked) {
    if (range.start > cursor) {
      result.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < base.end) {
    result.push({ start: cursor, end: base.end });
  }

  return result.filter((range) => range.end - range.start > 1e-6);
}

function rangeLength(range: Range1D): number {
  return Math.max(0, range.end - range.start);
}

function locateDistanceInRanges(ranges: Range1D[], distance: number): number {
  if (ranges.length === 0) {
    return 0;
  }

  let remaining = Math.max(0, distance);
  for (const range of ranges) {
    const length = rangeLength(range);
    if (remaining <= length) {
      return range.start + remaining;
    }
    remaining -= length;
  }

  return ranges[ranges.length - 1].end;
}

function addWallWarning(
  warningsByWall: Map<number, string[]>,
  wallIndex: number,
  warning: string,
): void {
  const existing = warningsByWall.get(wallIndex) ?? [];
  if (existing.includes(warning)) {
    return;
  }

  warningsByWall.set(wallIndex, [...existing, warning]);
}

function createWindowGenerator(
  wallDescriptors: WallDescriptor[],
  wallHeightM: number,
  options: RoomExtrusionOptions,
  doorOpeningsByWall: Map<number, DoorOpening[]>,
  warningsByWall: Map<number, string[]>,
): GenerateWallOptions['generateWindows'] | undefined {
  if (wallDescriptors.length === 0 || wallHeightM <= 0) {
    return undefined;
  }

  const totalWallArea = wallDescriptors.reduce((sum, wall) => sum + wall.lengthM * wallHeightM, 0);
  const requestedWindowArea = Number.isFinite(options.windowAreaM2)
    ? Math.max(0, options.windowAreaM2 ?? 0)
    : 0;
  const targetWindowArea = Math.min(requestedWindowArea, totalWallArea * 0.55);

  if (targetWindowArea <= 0) {
    return undefined;
  }

  const orientationTarget = orientationFromCardinal(options.windowOrientation);
  let eligibleWalls = wallDescriptors.filter((wall) => wall.lengthM >= 0.9);
  if (orientationTarget !== null) {
    const oriented = eligibleWalls.filter((wall) => angleDistanceDegrees(wall.orientationDeg, orientationTarget) <= 60);
    if (oriented.length > 0) {
      eligibleWalls = oriented;
    }
  }

  if (eligibleWalls.length === 0) {
    return undefined;
  }

  const eligibleWallArea = eligibleWalls.reduce((sum, wall) => sum + wall.lengthM * wallHeightM, 0);
  if (eligibleWallArea <= 0) {
    return undefined;
  }

  const sillHeight = clamp(wallHeightM * 0.28, 0.55, 1.05);
  const maxWindowHeight = Math.max(0.7, wallHeightM - sillHeight - 0.35);
  const windowHeight = clamp(maxWindowHeight, 0.9, 1.6);
  const shadingCoefficient = glassShadingCoefficient(options.windowType);
  const frameStyle = resolveWindowFrameStyle(options.windowType);
  const frameThicknessM = resolveWindowFrameThicknessM(options.windowType);
  const areaByWall = new Map<number, number>(
    eligibleWalls.map((wall) => [wall.index, targetWindowArea * ((wall.lengthM * wallHeightM) / eligibleWallArea)]),
  );

  return ({ index, orientation }) => {
    const wallAreaShare = areaByWall.get(index) ?? 0;
    if (wallAreaShare <= 0) {
      return [];
    }

    const wall = wallDescriptors.find((item) => item.index === index);
    if (!wall) {
      return [];
    }

    const sideMargin = Math.max(0.12, Math.min(0.35, wall.lengthM * 0.08));
    const windowExclusionPadM = 0.08;
    const doorReservedRanges = (doorOpeningsByWall.get(index) ?? [])
      .map((door) => {
        const center = door.centerOffsetM ?? wall.lengthM / 2;
        const halfWidth = Math.max(0.2, door.width / 2) + windowExclusionPadM;
        return {
          start: center - halfWidth,
          end: center + halfWidth,
        };
      });

    const openableRanges = subtractRanges(
      { start: sideMargin, end: Math.max(sideMargin, wall.lengthM - sideMargin) },
      doorReservedRanges,
    );
    const totalOpenableLength = openableRanges.reduce((sum, range) => sum + rangeLength(range), 0);
    if (totalOpenableLength < 0.5) {
      addWallWarning(
        warningsByWall,
        index,
        'Requested windows could not be placed because door clearances leave insufficient wall span.',
      );
      return [];
    }

    const maxWindowBandArea = totalOpenableLength * windowHeight * 0.82;
    const effectiveWindowArea = Math.min(wallAreaShare, maxWindowBandArea);
    if (effectiveWindowArea + 1e-6 < wallAreaShare) {
      const reductionRatio = 1 - effectiveWindowArea / Math.max(wallAreaShare, 1e-6);
      if (reductionRatio > 0.05) {
        addWallWarning(
          warningsByWall,
          index,
          'Window area was reduced to fit available wall segments after door spacing constraints.',
        );
      }
    }

    const totalWindowWidth = effectiveWindowArea / windowHeight;
    if (totalWindowWidth < 0.45) {
      addWallWarning(
        warningsByWall,
        index,
        'Computed window area is too small to place a valid opening on this wall.',
      );
      return [];
    }

    const requestedPaneCount = Math.max(1, Math.min(3, Math.ceil(totalWindowWidth / 1.8)));
    let paneCount = requestedPaneCount;
    let actualPaneWidth = 0;
    const minPaneGap = 0.12;

    while (paneCount >= 1) {
      const paneWidth = clamp(totalWindowWidth / paneCount, 0.45, 2.2);
      const requiredLength = paneCount * paneWidth + (paneCount + 1) * minPaneGap;
      if (requiredLength <= totalOpenableLength + 1e-6) {
        actualPaneWidth = paneWidth;
        break;
      }

      paneCount -= 1;
    }

    if (paneCount < requestedPaneCount) {
      addWallWarning(
        warningsByWall,
        index,
        'Window pane count was reduced to maintain minimum spacing on the remaining wall segments.',
      );
    }

    if (paneCount < 1 || actualPaneWidth < 0.45) {
      addWallWarning(
        warningsByWall,
        index,
        'Window panes could not be laid out after spacing and door-clearance constraints were applied.',
      );
      return [];
    }

    const centerRanges = openableRanges
      .map((range) => ({
        start: range.start + actualPaneWidth / 2,
        end: range.end - actualPaneWidth / 2,
      }))
      .filter((range) => range.end - range.start > 1e-6);
    if (centerRanges.length === 0) {
      addWallWarning(
        warningsByWall,
        index,
        'Window center points could not be resolved within legal wall segments.',
      );
      return [];
    }

    const totalCenterLength = centerRanges.reduce((sum, range) => sum + rangeLength(range), 0);
    if (totalCenterLength <= 1e-6) {
      addWallWarning(
        warningsByWall,
        index,
        'Window placement corridor collapsed after door exclusions and frame sizing constraints.',
      );
      return [];
    }

    const centerStride = totalCenterLength / (paneCount + 1);
    const centers = Array.from({ length: paneCount }, (_, paneIndex) => {
      const dist = centerStride * (paneIndex + 1);
      return locateDistanceInRanges(centerRanges, dist);
    });

    const mullionCount = resolveWindowMullionCount(options.windowType, actualPaneWidth);

    return Array.from({ length: paneCount }, (_, paneIndex) => ({
      id: `window-${index + 1}-${paneIndex + 1}`,
      width: actualPaneWidth,
      height: windowHeight,
      sillHeight,
      centerOffsetM: centers[paneIndex],
      frameThicknessM,
      mullionCount,
      frameStyle,
      glassType: options.windowType ?? 'single_clear_6mm',
      shadingCoefficient,
      orientation,
    }));
  };
}

function resolveDoorCount(spaceType?: string, roomAreaM2?: number): number {
  if (roomAreaM2 !== undefined && roomAreaM2 < 3) {
    return 0;
  }

  const normalized = (spaceType ?? '').toLowerCase();
  if (normalized === 'corridor' || normalized === 'lobby' || normalized === 'warehouse') {
    return 2;
  }

  if (roomAreaM2 !== undefined && roomAreaM2 > 90) {
    return 2;
  }

  return 1;
}

function resolveDoorWidth(spaceType?: string, roomAreaM2?: number): number {
  const normalized = (spaceType ?? '').toLowerCase();
  if (normalized === 'restroom') {
    return 0.8;
  }

  if (normalized === 'corridor' || normalized === 'lobby' || normalized === 'warehouse') {
    return 1.2;
  }

  if (roomAreaM2 !== undefined && roomAreaM2 > 90) {
    return 1.2;
  }

  return 0.9;
}

function resolveDoorSwing(spaceType?: string): 'left' | 'right' | 'double' | 'sliding' {
  const normalized = (spaceType ?? '').toLowerCase();
  if (normalized === 'warehouse') {
    return 'sliding';
  }

  if (normalized === 'lobby') {
    return 'double';
  }

  return 'left';
}

function resolveDoorLeafStyle(
  spaceType: string | undefined,
  swingDirection: 'left' | 'right' | 'double' | 'sliding',
): 'flush' | 'glazed' | 'double_leaf' | 'sliding_panel' {
  const normalized = (spaceType ?? '').toLowerCase();

  if (swingDirection === 'sliding') {
    return 'sliding_panel';
  }

  if (swingDirection === 'double') {
    return 'double_leaf';
  }

  if (normalized === 'lobby' || normalized === 'conference_room' || normalized === 'office') {
    return 'glazed';
  }

  return 'flush';
}

function resolveDoorFrameThicknessM(spaceType?: string): number {
  const normalized = (spaceType ?? '').toLowerCase();
  if (normalized === 'warehouse') {
    return 0.06;
  }

  if (normalized === 'lobby') {
    return 0.05;
  }

  return 0.04;
}

function buildDoorOpeningsByWall(
  wallDescriptors: WallDescriptor[],
  options: RoomExtrusionOptions,
  roomAreaM2: number,
): Map<number, DoorOpening[]> {
  const openingsByWall = new Map<number, DoorOpening[]>();
  if (wallDescriptors.length === 0) {
    return openingsByWall;
  }

  const primaryWall = wallDescriptors.reduce((best, wall) => (wall.lengthM > best.lengthM ? wall : best));
  let doorCount = resolveDoorCount(options.spaceType, roomAreaM2);
  if (doorCount <= 0) {
    return openingsByWall;
  }

  const maxDoorsByLength = Math.max(0, Math.floor((primaryWall.lengthM * 0.9) / 0.75));
  doorCount = Math.min(doorCount, maxDoorsByLength);
  if (doorCount <= 0) {
    return openingsByWall;
  }

  const doorWidth = clamp(resolveDoorWidth(options.spaceType, roomAreaM2), 0.75, 1.5);
  const swingDirection = resolveDoorSwing(options.spaceType);
  const leafStyle = resolveDoorLeafStyle(options.spaceType, swingDirection);
  const frameThicknessM = resolveDoorFrameThicknessM(options.spaceType);
  const maxDoorTotalWidth = Math.max(0.75 * doorCount, primaryWall.lengthM * 0.82);
  const totalDoorWidth = Math.min(doorWidth * doorCount, maxDoorTotalWidth);
  const actualDoorWidth = clamp(totalDoorWidth / doorCount, 0.75, 1.5);
  const doorGap = Math.max(0.1, (primaryWall.lengthM - totalDoorWidth) / (doorCount + 1));

  const doors = Array.from({ length: doorCount }, (_, doorIndex) => ({
    id: `door-${primaryWall.index + 1}-${doorIndex + 1}`,
    width: actualDoorWidth,
    height: 2.1,
    sillHeight: 0,
    centerOffsetM: doorGap * (doorIndex + 1) + actualDoorWidth * doorIndex + actualDoorWidth / 2,
    frameThicknessM,
    leafStyle,
    swingDirection,
  }));

  openingsByWall.set(primaryWall.index, doors);
  return openingsByWall;
}

function createDoorGenerator(
  doorOpeningsByWall: Map<number, DoorOpening[]>,
): GenerateWallOptions['generateDoors'] | undefined {
  if (doorOpeningsByWall.size === 0) {
    return undefined;
  }

  return ({ index }) => doorOpeningsByWall.get(index) ?? [];
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
  const wallDescriptors = buildWallDescriptors(footprint);
  const doorOpeningsByWall = buildDoorOpeningsByWall(wallDescriptors, options, metrics.floorArea);
  const openingWarningsByWall = new Map<number, string[]>();
  const generateWindows = createWindowGenerator(
    wallDescriptors,
    ceilingHeight,
    options,
    doorOpeningsByWall,
    openingWarningsByWall,
  );
  const generateDoors = createDoorGenerator(doorOpeningsByWall);
  const walls = generateWallSegments(footprint, {
    wallHeightM: ceilingHeight,
    construction: normalizeWallConstruction(options.wallConstruction),
    thicknessM: options.wallThicknessM,
    uValue: options.wallUValue,
    generateWindows,
    generateDoors,
  }).map((wall, wallIndex) => {
    const placementWarnings = openingWarningsByWall.get(wallIndex);
    if (!placementWarnings || placementWarnings.length === 0) {
      return wall;
    }

    return {
      ...wall,
      placementWarnings: [...placementWarnings],
    };
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