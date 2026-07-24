import type {
  RackDensity, HVACUnitType,
  ServerRack, HVACUnit, PerforatedTile,
} from '@/types/simulation';
import { getPolygonBounds, parseRoomPolygon } from '@/lib/utils/room-polygon';
import { resolveFloorScale } from '@/lib/simulation/geometry-2d';
import type { DetectedFloor, DetectedRoom, ViewerRoomBoundary } from './types';
import {
  HVAC_TYPE_DEFAULTS,
  HVAC_TYPES,
} from './constants';

// 2D predicates + placement primitives now live in the shared lib layer so the
// zustand store and the layout normalizer can use them without importing this
// feature module. Re-exported here for existing viewer importers.
export {
  distancePointToSegment,
  isPointInsidePolygon,
  minDistanceToPolygonEdges,
  overlapIntervals,
} from '@/lib/simulation/geometry-2d';
export {
  snapToPlacementGrid,
  snapHVACUnit,
  validateHVACPlacement,
  sanitizeHVACPlacements,
} from '@/lib/simulation/normalize-room-layout';

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

    const scale = resolveFloorScale(polygon.scale, floor.scale);
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

export function mapLayoutHVACToUnit(raw: Record<string, unknown>, index: number): HVACUnit | null {
  const type = toHVACType(raw.type);
  const defaults = HVAC_TYPE_DEFAULTS[type];
  const rawPosition = (raw.position ?? {}) as Record<string, unknown>;

  // Drop malformed placements rather than piling them at the origin (mirrors
  // mapLayoutTile). normalizeRoomLayout also guards, but dropping here keeps
  // the "no NaN → 0 corner pile-up" invariant regardless of the consumer.
  const px = toFiniteNumber(rawPosition.x, Number.NaN);
  const py = toFiniteNumber(rawPosition.y, Number.NaN);
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return null;
  }

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
      x: px,
      y: py,
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

      const scale = resolveFloorScale(polygon.scale, floor.scale);
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
