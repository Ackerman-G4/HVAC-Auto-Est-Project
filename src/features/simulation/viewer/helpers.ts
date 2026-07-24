import type {
  RackDensity, HVACUnitType,
  ServerRack, HVACUnit, PerforatedTile,
} from '@/types/simulation';
import { getPolygonBounds, parseRoomPolygon } from '@/lib/utils/room-polygon';
import type { DetectedFloor, DetectedRoom, ViewerRoomBoundary } from './types';
import {
  HVAC_TYPE_DEFAULTS,
  HVAC_TYPES,
  HVAC_PLACEMENT_GRID_M,
  HVAC_MIN_WALL_CLEARANCE_M,
  HVAC_MIN_UNIT_GAP_M,
} from './constants';

export function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toHVACType(value: unknown): HVACUnitType {
  return HVAC_TYPES.includes(value as HVACUnitType)
    ? (value as HVACUnitType)
    : 'crac';
}

export function deriveFloorBoundsMeters(floor: DetectedFloor): { width: number; length: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const room of floor.rooms) {
    const polygon = parseRoomPolygon(room.polygon ?? '');
    if (!polygon) {
      continue;
    }

    const scale = polygon.scale && polygon.scale > 0
      ? polygon.scale
      : floor.scale > 0
        ? floor.scale
        : 1;
    const pointsInMeters = polygon.points.map((point) => ({
      x: point.x / scale,
      y: point.y / scale,
    }));
    const bounds = getPolygonBounds(pointsInMeters);

    if (!bounds) {
      continue;
    }

    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  if (
    Number.isFinite(minX)
    && Number.isFinite(minY)
    && Number.isFinite(maxX)
    && Number.isFinite(maxY)
  ) {
    return {
      width: Math.max(1, maxX - minX),
      length: Math.max(1, maxY - minY),
    };
  }

  const totalArea = floor.rooms.reduce((sum, room) => sum + Math.max(0, room.area), 0);
  const fallbackSide = Math.max(6, Math.sqrt(Math.max(totalArea, 36)));
  return { width: fallbackSide, length: fallbackSide };
}

export function mapLayoutHVACToUnit(raw: Record<string, unknown>, index: number): HVACUnit {
  const type = toHVACType(raw.type);
  const defaults = HVAC_TYPE_DEFAULTS[type];
  const rawPosition = (raw.position ?? {}) as Record<string, unknown>;

  const capacityKW = Math.max(0.1, toFiniteNumber(raw.capacityKW, defaults.capacityKW));
  const airflowCFM = Math.max(50, toFiniteNumber(raw.airflowCFM, Math.max(defaults.airflowCFM, capacityKW * 170)));

  return {
    id: typeof raw.id === 'string' && raw.id.length > 0
      ? raw.id
      : `layout-hvac-${index + 1}`,
    type,
    name: typeof raw.label === 'string' && raw.label.length > 0
      ? raw.label
      : `${type.toUpperCase()} ${index + 1}`,
    position: {
      x: toFiniteNumber(rawPosition.x, 0),
      y: toFiniteNumber(rawPosition.y, 0),
      z: toFiniteNumber(rawPosition.z, 0),
    },
    width: defaults.width,
    depth: defaults.depth,
    height: defaults.height,
    capacityKW,
    capacityTR: capacityKW / 3.517,
    airflowCFM,
    supplyTempC: defaults.supplyTempC,
    returnTempC: 24,
    orientation: toFiniteNumber(raw.orientation, 0),
    powerInputKW: Math.max(0.1, capacityKW / 3),
    status: 'active',
  };
}

export function mapLayoutTile(raw: Record<string, unknown>): PerforatedTile | null {
  const x = toFiniteNumber(raw.x, Number.NaN);
  const y = toFiniteNumber(raw.y, Number.NaN);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x,
    y,
    openArea: Math.max(0.05, Math.min(1, toFiniteNumber(raw.openArea, 0.25))),
    tileSize: Math.max(0.2, toFiniteNumber(raw.tileSize, 0.6)),
  };
}

export function mapHVACUnitToLayoutPlacement(unit: HVACUnit): Record<string, unknown> {
  return {
    id: unit.id,
    type: unit.type,
    label: unit.name,
    position: {
      x: unit.position.x,
      y: unit.position.y,
      z: unit.position.z,
    },
    orientation: unit.orientation,
    capacityKW: unit.capacityKW,
    airflowCFM: unit.airflowCFM,
  };
}

export function mapTileToLayoutPlacement(tile: PerforatedTile, index: number): Record<string, unknown> {
  return {
    id: `tile-${index + 1}-${tile.x.toFixed(2)}-${tile.y.toFixed(2)}`,
    x: tile.x,
    y: tile.y,
    openArea: tile.openArea,
    tileSize: tile.tileSize,
  };
}

export function resolveCanvasScale(floor: DetectedFloor | null): number {
  return floor && floor.scale > 0 ? floor.scale : 50;
}

export function buildLayoutPayload(
  floorId: string,
  floor: DetectedFloor | null,
  hvacUnits: HVACUnit[],
  tiles: PerforatedTile[],
): {
  floorId: string;
  hvacPlacements: Record<string, unknown>[];
  tilePlacements: Record<string, unknown>[];
  canvasScale: number;
} {
  return {
    floorId,
    hvacPlacements: hvacUnits.map(mapHVACUnitToLayoutPlacement),
    tilePlacements: tiles.map(mapTileToLayoutPlacement),
    canvasScale: resolveCanvasScale(floor),
  };
}

export function buildLayoutPayloadHash(payload: {
  floorId: string;
  hvacPlacements: Record<string, unknown>[];
  tilePlacements: Record<string, unknown>[];
  canvasScale: number;
}): string {
  return JSON.stringify(payload);
}

export function buildRoomBoundariesForFloor(floor: DetectedFloor | null): ViewerRoomBoundary[] {
  if (!floor) {
    return [];
  }

  return floor.rooms
    .map((room) => {
      const polygon = parseRoomPolygon(room.polygon ?? '');
      if (!polygon || polygon.points.length < 3) {
        return null;
      }

      const scale = polygon.scale && polygon.scale > 0
        ? polygon.scale
        : floor.scale > 0
          ? floor.scale
          : 1;
      const points = polygon.points.map((point) => ({
        x: point.x / scale,
        y: point.y / scale,
      }));

      const bounds = getPolygonBounds(points);
      if (!bounds) {
        return null;
      }

      const centroid = points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 },
      );
      const divisor = points.length || 1;

      return {
        id: room.id,
        name: room.name,
        points,
        centroid: {
          x: centroid.x / divisor,
          y: centroid.y / divisor,
        },
      };
    })
    .filter((room): room is ViewerRoomBoundary => Boolean(room));
}

export function snapToPlacementGrid(value: number): number {
  return Math.round(value / HVAC_PLACEMENT_GRID_M) * HVAC_PLACEMENT_GRID_M;
}

export function distancePointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
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

export function isPointInsidePolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
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

export function minDistanceToPolygonEdges(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): number {
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

export function unitsOverlapInPlan(a: HVACUnit, b: HVACUnit): boolean {
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

export function snapHVACUnit(unit: HVACUnit): HVACUnit {
  return {
    ...unit,
    position: {
      ...unit.position,
      x: snapToPlacementGrid(unit.position.x),
      y: snapToPlacementGrid(unit.position.y),
    },
  };
}

export function validateHVACPlacement(
  candidate: HVACUnit,
  existingUnits: HVACUnit[],
  roomBoundaries: ViewerRoomBoundary[],
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

  const overlap = existingUnits.find((unit) => unitsOverlapInPlan(candidate, unit));
  if (overlap) {
    return { valid: false, reason: `Placement overlaps with ${overlap.name}.` };
  }

  return { valid: true };
}

export function sanitizeHVACPlacements(
  units: HVACUnit[],
  roomBoundaries: ViewerRoomBoundary[],
): {
  accepted: HVACUnit[];
  rejected: Array<{ unit: HVACUnit; reason: string }>;
} {
  const accepted: HVACUnit[] = [];
  const rejected: Array<{ unit: HVACUnit; reason: string }> = [];

  for (const rawUnit of units) {
    const unit = snapHVACUnit(rawUnit);
    const validation = validateHVACPlacement(unit, accepted, roomBoundaries);
    if (validation.valid) {
      accepted.push(unit);
    } else {
      rejected.push({
        unit,
        reason: validation.reason ?? 'Unknown placement validation issue.',
      });
    }
  }

  return { accepted, rejected };
}

/** Infer server racks from a server_room room's equipment load */
export function inferRacksFromRoom(room: DetectedRoom, offsetX: number): Omit<ServerRack, 'id'>[] {
  // Only server rooms get auto-detected racks
  if (room.spaceType !== 'server_room') return [];
  const equipW = room.equipmentLoad || 5000; // default 5kW for a server room
  const perRackKW = 7; // typical medium density
  const rackCount = Math.max(1, Math.round(equipW / 1000 / perRackKW));
  const racks: Omit<ServerRack, 'id'>[] = [];

  for (let i = 0; i < rackCount; i++) {
    const density: RackDensity = equipW / 1000 / rackCount >= 15 ? 'high' : equipW / 1000 / rackCount >= 5 ? 'medium' : 'low';
    racks.push({
      name: `${room.name} - Rack ${i + 1}`,
      position: { x: offsetX + i * 1.2, y: 1, z: 0 },
      width: 0.6, depth: 1.2, height: 2.0,
      powerDensity: density,
      powerKW: Math.round((equipW / 1000) / rackCount * 10) / 10,
      airflowCFM: Math.round(((equipW / 1000) / rackCount) * 50),
      orientation: 0,
      rackUnits: 42,
      filledUnits: Math.round(42 * 0.7),
    });
  }
  return racks;
}

/** Infer HVAC units needed for a room based on cooling load or area */
export function inferHVACFromRoom(room: DetectedRoom, offsetX: number, floorScale: number): Omit<HVACUnit, 'id'>[] {
  // Determine cooling needed in kW
  let coolingKW: number;
  if (room.coolingLoad?.trValue) {
    coolingKW = room.coolingLoad.trValue * 3.517;
  } else if (room.coolingLoad?.btuValue) {
    coolingKW = room.coolingLoad.btuValue / 3412;
  } else {
    // Estimate: ~150 W/m² for server rooms, ~100 W/m² for offices, ~80 W/m² for general
    const wPerSqm = room.spaceType === 'server_room' ? 150 : room.spaceType === 'office' ? 100 : 80;
    coolingKW = (room.area * wPerSqm) / 1000;
  }

  if (coolingKW < 0.5) return [];

  // Choose unit type based on space
  let unitType: HVACUnitType = 'crac';
  let perUnitKW = 30;

  if (room.spaceType === 'server_room') {
    if (coolingKW > 60) {
      unitType = 'crah';
      perUnitKW = 60;
    } else {
      unitType = 'crac';
      perUnitKW = 30;
    }
  } else if (coolingKW <= 15) {
    unitType = 'ahu';
    perUnitKW = 15;
  } else {
    unitType = 'ahu';
    perUnitKW = 30;
  }

  const unitCount = Math.max(1, Math.ceil(coolingKW / perUnitKW));
  const actualPerUnit = coolingKW / unitCount;
  const units: Omit<HVACUnit, 'id'>[] = [];

  let anchorX = offsetX;
  let anchorY = Math.max(1, Math.sqrt(Math.max(room.area, 1)) - 1);
  const polygon = parseRoomPolygon(room.polygon ?? '');
  if (polygon && polygon.points.length >= 3) {
    const scale = polygon.scale && polygon.scale > 0
      ? polygon.scale
      : floorScale > 0
        ? floorScale
        : 1;
    const points = polygon.points.map((point) => ({ x: point.x / scale, y: point.y / scale }));
    const bounds = getPolygonBounds(points);
    if (bounds) {
      anchorX = (bounds.minX + bounds.maxX) / 2;
      anchorY = (bounds.minY + bounds.maxY) / 2;
    }
  }

  const columns = Math.min(2, unitCount);

  for (let i = 0; i < unitCount; i++) {
    const defaults = HVAC_TYPE_DEFAULTS[unitType];
    const spacing = Math.max(0.9, Math.max(defaults.width, defaults.depth) + 0.35);
    const row = Math.floor(i / columns);
    const column = i % columns;
    const offsetColumn = column - (columns - 1) / 2;

    units.push({
      type: unitType,
      name: `${room.name} - ${unitType.toUpperCase()} ${i + 1}`,
      position: {
        x: anchorX + offsetColumn * spacing,
        y: anchorY + row * spacing * 0.85,
        z: 0,
      },
      width: defaults.width,
      depth: defaults.depth,
      height: defaults.height,
      capacityKW: Math.round(actualPerUnit * 10) / 10,
      capacityTR: Math.round((actualPerUnit / 3.517) * 10) / 10,
      airflowCFM: Math.round(Math.max(defaults.airflowCFM * 0.5, actualPerUnit * 170)),
      supplyTempC: room.spaceType === 'server_room' ? Math.min(defaults.supplyTempC, 13) : defaults.supplyTempC,
      returnTempC: 24,
      orientation: 0,
      powerInputKW: Math.round(actualPerUnit / 3 * 10) / 10,
      status: 'active',
    });
  }
  return units;
}
