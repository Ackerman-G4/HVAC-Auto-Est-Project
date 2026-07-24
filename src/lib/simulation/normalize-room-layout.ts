/**
 * normalizeRoomLayout — the SINGLE source of truth that converts detected room
 * geometry + equipment into clean world-space scene coordinates.
 *
 * Responsibilities (directive "single source of truth" + "data-repair" rules):
 *  1. translate everything so the floor bounding box starts at the origin,
 *  2. drop equipment with non-finite positions (never render NaN; log a warning),
 *  3. floor-snap floor-mounted equipment (z = 0; ceiling units clamped),
 *  4. clamp x/y into the domain footprint,
 *  5. snap + validate placements (racks AND HVAC — racks were previously
 *     unvalidated) collecting rejects as warnings,
 *  6. compute ONE grid size from the resulting domain.
 *
 * Pure and dependency-light so both the zustand store and the viewer feature
 * can consume it. Room boundaries are passed in (computed by the caller) to
 * avoid a lib→feature import.
 */
import type { ServerRack, HVACUnit, PerforatedTile, Vec3, HVACUnitType } from '@/types/simulation';
import {
  isPointInsidePolygon,
  minDistanceToPolygonEdges,
  overlapIntervals,
  type Point2D,
} from './geometry-2d';

// ── Placement constants (moved from feature constants; re-exported there) ──
export const HVAC_PLACEMENT_GRID_M = 0.25;
export const HVAC_MIN_WALL_CLEARANCE_M = 0.2;
export const HVAC_MIN_UNIT_GAP_M = 0.12;

/** HVAC types that hang from the ceiling rather than standing on the floor. */
const CEILING_MOUNTED: ReadonlySet<HVACUnitType> = new Set<HVACUnitType>(['vent_duct']);

export interface RoomBoundary {
  id: string;
  name: string;
  points: Point2D[];
  centroid: Point2D;
}

interface PlacedBox {
  position: Vec3;
  width: number;
  depth: number;
  name?: string;
}

// ── Snap + overlap + validation (generalized over any floor box) ──────────

export function snapToPlacementGrid(value: number): number {
  return Math.round(value / HVAC_PLACEMENT_GRID_M) * HVAC_PLACEMENT_GRID_M;
}

function snapBoxXY<T extends PlacedBox>(box: T): T {
  return {
    ...box,
    position: {
      ...box.position,
      x: snapToPlacementGrid(box.position.x),
      y: snapToPlacementGrid(box.position.y),
    },
  };
}

export function boxesOverlapInPlan(a: PlacedBox, b: PlacedBox): boolean {
  const aMinX = a.position.x - a.width / 2 - HVAC_MIN_UNIT_GAP_M;
  const aMaxX = a.position.x + a.width / 2 + HVAC_MIN_UNIT_GAP_M;
  const aMinY = a.position.y - a.depth / 2 - HVAC_MIN_UNIT_GAP_M;
  const aMaxY = a.position.y + a.depth / 2 + HVAC_MIN_UNIT_GAP_M;

  const bMinX = b.position.x - b.width / 2;
  const bMaxX = b.position.x + b.width / 2;
  const bMinY = b.position.y - b.depth / 2;
  const bMaxY = b.position.y + b.depth / 2;

  return overlapIntervals(aMinX, aMaxX, bMinX, bMaxX)
    && overlapIntervals(aMinY, aMaxY, bMinY, bMaxY);
}

export function validateBoxPlacement(
  candidate: PlacedBox,
  existing: PlacedBox[],
  roomBoundaries: RoomBoundary[],
): { valid: boolean; reason?: string } {
  if (roomBoundaries.length > 0) {
    const container = roomBoundaries.find((room) => isPointInsidePolygon(candidate.position, room.points));
    if (!container) {
      return { valid: false, reason: 'Placement is outside all room boundaries.' };
    }

    const edgeDistance = minDistanceToPolygonEdges(candidate.position, container.points);
    const requiredClearance = Math.max(
      HVAC_MIN_WALL_CLEARANCE_M,
      Math.min(candidate.width, candidate.depth) * 0.35,
    );
    if (edgeDistance < requiredClearance) {
      return { valid: false, reason: `Placement is too close to room wall boundary (need >= ${requiredClearance.toFixed(2)}m).` };
    }
  }

  const overlap = existing.find((box) => boxesOverlapInPlan(candidate, box));
  if (overlap) {
    return { valid: false, reason: `Placement overlaps with ${overlap.name ?? 'another unit'}.` };
  }

  return { valid: true };
}

// ── Backward-compatible HVAC-typed wrappers (re-exported via helpers.ts) ──

export function snapHVACUnit(unit: HVACUnit): HVACUnit {
  return snapBoxXY(unit);
}

export function validateHVACPlacement(
  candidate: HVACUnit,
  existingUnits: HVACUnit[],
  roomBoundaries: RoomBoundary[],
): { valid: boolean; reason?: string } {
  return validateBoxPlacement(candidate, existingUnits, roomBoundaries);
}

export function sanitizeHVACPlacements(
  units: HVACUnit[],
  roomBoundaries: RoomBoundary[],
): { accepted: HVACUnit[]; rejected: Array<{ unit: HVACUnit; reason: string }> } {
  const accepted: HVACUnit[] = [];
  const rejected: Array<{ unit: HVACUnit; reason: string }> = [];

  for (const rawUnit of units) {
    const unit = snapHVACUnit(rawUnit);
    const validation = validateHVACPlacement(unit, accepted, roomBoundaries);
    if (validation.valid) {
      accepted.push(unit);
    } else {
      rejected.push({ unit, reason: validation.reason ?? 'Unknown placement validation issue.' });
    }
  }

  return { accepted, rejected };
}

// ── normalizeRoomLayout ───────────────────────────────────────────────────

export interface NormalizeInput {
  roomBoundaries: RoomBoundary[];
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  tiles: PerforatedTile[];
  gridResolution: number;
  /** Ceiling height (m) used to size the vertical grid; defaults to 3. */
  ceilingHeightM?: number;
}

export interface NormalizedLayout {
  roomBoundaries: RoomBoundary[];
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  tiles: PerforatedTile[];
  originOffset: { x: number; y: number };
  domainM: { width: number; length: number; height: number };
  gridSize: { gridSizeX: number; gridSizeY: number; gridSizeZ: number };
  warnings: string[];
}

const GRID_MIN_XY = 8;
const GRID_MAX_XY = 80;
const GRID_MIN_Z = 6;
const GRID_MAX_Z = 24;

function isFiniteVec(p: Vec3 | undefined): p is Vec3 {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function normalizeRoomLayout(input: NormalizeInput): NormalizedLayout {
  const res = input.gridResolution > 0 ? input.gridResolution : 0.5;
  const ceiling = input.ceilingHeightM && input.ceilingHeightM > 0 ? input.ceilingHeightM : 3;
  const warnings: string[] = [];

  // 1. origin offset = min corner of all room-boundary points (else 0).
  let originX = 0;
  let originY = 0;
  const allPts = input.roomBoundaries.flatMap((b) => b.points);
  if (allPts.length > 0) {
    originX = Math.min(...allPts.map((p) => p.x));
    originY = Math.min(...allPts.map((p) => p.y));
    if (!Number.isFinite(originX)) originX = 0;
    if (!Number.isFinite(originY)) originY = 0;
  }

  const shift = (p: Point2D): Point2D => ({ x: p.x - originX, y: p.y - originY });

  const roomBoundaries: RoomBoundary[] = input.roomBoundaries.map((b) => ({
    ...b,
    points: b.points.map(shift),
    centroid: shift(b.centroid),
  }));

  // 2. drop non-finite equipment (never render NaN), translate the rest.
  const droppedRacks = input.racks.filter((r) => !isFiniteVec(r.position)).length;
  const droppedHvac = input.hvacUnits.filter((u) => !isFiniteVec(u.position)).length;
  if (droppedRacks > 0) warnings.push(`Dropped ${droppedRacks} rack(s) with invalid positions.`);
  if (droppedHvac > 0) warnings.push(`Dropped ${droppedHvac} HVAC unit(s) with invalid positions.`);

  const translatedRacks: ServerRack[] = input.racks
    .filter((r) => isFiniteVec(r.position))
    .map((r) => ({ ...r, position: { x: r.position.x - originX, y: r.position.y - originY, z: 0 } }));

  const translatedHvac: HVACUnit[] = input.hvacUnits
    .filter((u) => isFiniteVec(u.position))
    .map((u) => {
      const z = CEILING_MOUNTED.has(u.type)
        ? clamp(u.position.z, 0, Math.max(0, ceiling - u.height))
        : 0; // 3. floor-snap floor-mounted units
      return { ...u, position: { x: u.position.x - originX, y: u.position.y - originY, z } };
    });

  // domain footprint from boundaries ∪ equipment (pre-clamp extents).
  const footprintPts: Point2D[] = [
    ...roomBoundaries.flatMap((b) => b.points),
    ...translatedRacks.map((r) => ({ x: r.position.x, y: r.position.y })),
    ...translatedHvac.map((u) => ({ x: u.position.x, y: u.position.y })),
  ];
  const width = footprintPts.length ? Math.max(...footprintPts.map((p) => p.x)) : 0;
  const length = footprintPts.length ? Math.max(...footprintPts.map((p) => p.y)) : 0;
  const domainM = {
    width: Math.max(4, width + 1),
    length: Math.max(4, length + 1),
    height: ceiling,
  };

  const gridSize = {
    gridSizeX: clamp(Math.ceil(domainM.width / res), GRID_MIN_XY, GRID_MAX_XY),
    gridSizeY: clamp(Math.ceil(domainM.length / res), GRID_MIN_XY, GRID_MAX_XY),
    gridSizeZ: clamp(Math.ceil(domainM.height / res), GRID_MIN_Z, GRID_MAX_Z),
  };

  // 4. clamp x/y into the domain (half-extent margin).
  const clampBox = <T extends PlacedBox>(box: T): T => ({
    ...box,
    position: {
      ...box.position,
      x: clamp(box.position.x, box.width / 2, domainM.width - box.width / 2),
      y: clamp(box.position.y, box.depth / 2, domainM.length - box.depth / 2),
    },
  });

  // 5. snap + validate racks then HVAC (racks reserve space first).
  const acceptedBoxes: PlacedBox[] = [];
  const racks: ServerRack[] = [];
  for (const rack of translatedRacks) {
    const snapped = snapBoxXY(clampBox(rack));
    const v = validateBoxPlacement(snapped, acceptedBoxes, roomBoundaries);
    if (v.valid) {
      racks.push(snapped);
      acceptedBoxes.push(snapped);
    } else {
      warnings.push(`Rack ${rack.name ?? rack.id}: ${v.reason}`);
    }
  }

  const hvacUnits: HVACUnit[] = [];
  for (const unit of translatedHvac) {
    const snapped = snapBoxXY(clampBox(unit));
    const v = validateBoxPlacement(snapped, acceptedBoxes, roomBoundaries);
    if (v.valid) {
      hvacUnits.push(snapped);
      acceptedBoxes.push(snapped);
    } else {
      warnings.push(`HVAC ${unit.name}: ${v.reason}`);
    }
  }

  // Tiles: drop non-finite only; their coordinate frame is resolved in the
  // auto-detect placement step, not here.
  const tiles = input.tiles.filter((t) => Number.isFinite(t.x) && Number.isFinite(t.y));

  return {
    roomBoundaries,
    racks,
    hvacUnits,
    tiles,
    originOffset: { x: originX, y: originY },
    domainM,
    gridSize,
    warnings,
  };
}
