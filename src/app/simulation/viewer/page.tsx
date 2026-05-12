'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Wind, Thermometer, Plus, Trash2, Play, ShieldCheck,
  AlertTriangle, Zap, TrendingUp, Server, AirVent, Grid3x3,
  RotateCcw, Settings2, BarChart3, Box, Wand2, Building2,
  Gauge, Sliders, Activity, Layers, Crosshair,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useSimulationStore } from '@/stores/simulation-store';
import type {
  RackDensity, HVACUnitType, FailureScenario,
  ServerRack, HVACUnit, PerforatedTile, Vec3,
} from '@/types/simulation';
import type { Project } from '@/types/project';
import { authFetch } from '@/lib/api-client';
import { showToast } from '@/components/ui/toast';
import { getPolygonBounds, parseRoomPolygon } from '@/lib/utils/room-polygon';

const AirflowViewer3D = dynamic(
  () => import('@/components/building/AirflowViewer3D').then(mod => mod.default),
  { ssr: false, loading: () => <div className="panel-glass flex h-125 items-center justify-center rounded-xl border border-border/70 bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading 3D viewer...</div> }
);

const TileFlowDashboard = dynamic(
  () => import('@/components/building/TileFlowDashboard').then(mod => mod.default),
  { ssr: false, loading: () => <div className="panel-glass flex h-64 items-center justify-center rounded-xl border border-border/70 bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading dashboard...</div> }
);

const CalibrationPanel = dynamic(
  () => import('@/components/building/CalibrationPanel').then(mod => mod.default),
  { ssr: false, loading: () => <div className="panel-glass flex h-64 items-center justify-center rounded-xl border border-border/70 bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading calibration...</div> }
);

// ─── Auto-Detect Types & Logic ──────────────────────────────────────

interface DetectedFloor {
  id: string;
  floorNumber: number;
  name: string;
  scale: number;
  ceilingHeight: number;
  rooms: DetectedRoom[];
}

interface DetectedRoom {
  id: string;
  name: string;
  area: number;
  ceilingHeight: number;
  spaceType: string;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  coolingLoad: { trValue?: number; btuValue?: number } | null;
  polygon?: string;
}

interface ViewerRoomBoundary {
  id: string;
  name: string;
  points: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number };
}

const HVAC_TYPE_DEFAULTS: Record<HVACUnitType, {
  width: number;
  depth: number;
  height: number;
  capacityKW: number;
  airflowCFM: number;
  supplyTempC: number;
}> = {
  crac: { width: 1.2, depth: 1.0, height: 2.2, capacityKW: 30, airflowCFM: 5500, supplyTempC: 13 },
  crah: { width: 1.4, depth: 1.1, height: 2.3, capacityKW: 50, airflowCFM: 7000, supplyTempC: 13 },
  ahu: { width: 1.5, depth: 1.2, height: 2.4, capacityKW: 25, airflowCFM: 4500, supplyTempC: 15 },
  in_row: { width: 0.4, depth: 1.2, height: 2.0, capacityKW: 20, airflowCFM: 3000, supplyTempC: 15 },
  rear_door: { width: 0.6, depth: 0.3, height: 2.1, capacityKW: 8, airflowCFM: 900, supplyTempC: 17 },
  vent_duct: { width: 0.8, depth: 0.8, height: 0.8, capacityKW: 12, airflowCFM: 2000, supplyTempC: 16 },
};

const HVAC_TYPES: HVACUnitType[] = ['crac', 'crah', 'ahu', 'in_row', 'rear_door', 'vent_duct'];
const HVAC_PLACEMENT_GRID_M = 0.25;
const HVAC_MIN_WALL_CLEARANCE_M = 0.2;
const HVAC_MIN_UNIT_GAP_M = 0.12;

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toHVACType(value: unknown): HVACUnitType {
  return HVAC_TYPES.includes(value as HVACUnitType)
    ? (value as HVACUnitType)
    : 'crac';
}

function deriveFloorBoundsMeters(floor: DetectedFloor): { width: number; length: number } {
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

function mapLayoutHVACToUnit(raw: Record<string, unknown>, index: number): HVACUnit {
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

function mapLayoutTile(raw: Record<string, unknown>): PerforatedTile | null {
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

function mapHVACUnitToLayoutPlacement(unit: HVACUnit): Record<string, unknown> {
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

function mapTileToLayoutPlacement(tile: PerforatedTile, index: number): Record<string, unknown> {
  return {
    id: `tile-${index + 1}-${tile.x.toFixed(2)}-${tile.y.toFixed(2)}`,
    x: tile.x,
    y: tile.y,
    openArea: tile.openArea,
    tileSize: tile.tileSize,
  };
}

function resolveCanvasScale(floor: DetectedFloor | null): number {
  return floor && floor.scale > 0 ? floor.scale : 50;
}

function buildLayoutPayload(
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

function buildLayoutPayloadHash(payload: {
  floorId: string;
  hvacPlacements: Record<string, unknown>[];
  tilePlacements: Record<string, unknown>[];
  canvasScale: number;
}): string {
  return JSON.stringify(payload);
}

function buildRoomBoundariesForFloor(floor: DetectedFloor | null): ViewerRoomBoundary[] {
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

function snapToPlacementGrid(value: number): number {
  return Math.round(value / HVAC_PLACEMENT_GRID_M) * HVAC_PLACEMENT_GRID_M;
}

function distancePointToSegment(
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

function isPointInsidePolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
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

function minDistanceToPolygonEdges(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): number {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const distance = distancePointToSegment(point, start, end);
    minDistance = Math.min(minDistance, distance);
  }
  return minDistance;
}

function overlapIntervals(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && bMin < aMax;
}

function unitsOverlapInPlan(a: HVACUnit, b: HVACUnit): boolean {
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

function snapHVACUnit(unit: HVACUnit): HVACUnit {
  return {
    ...unit,
    position: {
      ...unit.position,
      x: snapToPlacementGrid(unit.position.x),
      y: snapToPlacementGrid(unit.position.y),
    },
  };
}

function validateHVACPlacement(
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

function sanitizeHVACPlacements(
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
function inferRacksFromRoom(room: DetectedRoom, offsetX: number): Omit<ServerRack, 'id'>[] {
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
function inferHVACFromRoom(room: DetectedRoom, offsetX: number, floorScale: number): Omit<HVACUnit, 'id'>[] {
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

// ─── Temperature Heatmap Component ──────────────────────────────────

function TemperatureHeatmap() {
  const { result, selectedSliceZ, setSelectedSliceZ, config } = useSimulationStore();

  if (!result) {
    return (
      <div className="panel-glass flex h-64 items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Run a simulation to see temperature distribution</p>
      </div>
    );
  }

  const slice = result.temperatureField.map(row =>
    row.map(col => col[selectedSliceZ] ?? 24)
  );

  const minT = Math.min(...slice.flat());
  const maxT = Math.max(...slice.flat());
  const range = maxT - minT || 1;

  function tempToColor(t: number): string {
    const ratio = (t - minT) / range;
    if (ratio < 0.25) return `rgb(${Math.round(ratio * 4 * 255)}, ${Math.round(ratio * 4 * 200)}, 255)`;
    if (ratio < 0.5) return `rgb(255, 255, ${Math.round((1 - (ratio - 0.25) * 4) * 255)})`;
    if (ratio < 0.75) return `rgb(255, ${Math.round((1 - (ratio - 0.5) * 4) * 200)}, 0)`;
    return `rgb(${Math.round((1 - (ratio - 0.75) * 4) * 255)}, 0, 0)`;
  }

  const cellSize = Math.min(24, Math.floor(600 / Math.max(config.gridSizeX, config.gridSizeY)));
  const gridPixelWidth = config.gridSizeX * cellSize;
  const gridPixelHeight = config.gridSizeY * cellSize;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">Temperature Distribution (Z = {selectedSliceZ})</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Height Layer:</label>
          <input
            type="range"
            min={0}
            max={config.gridSizeZ - 1}
            value={selectedSliceZ}
            onChange={e => setSelectedSliceZ(Number(e.target.value))}
            className="w-32"
            aria-label="Height Layer"
          />
          <span className="w-20 text-sm font-semibold tabular-nums text-foreground">
            {(selectedSliceZ * config.gridResolution).toFixed(1)}m
          </span>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-slate-900 p-4 shadow-sm">
        <svg
          width={gridPixelWidth}
          height={gridPixelHeight}
          viewBox={`0 0 ${gridPixelWidth} ${gridPixelHeight}`}
          role="img"
          aria-label="Temperature heatmap"
        >
          {slice.map((row, x) =>
            row.map((temp, y) => (
              <g key={`${x}-${y}`}>
                <title>{`(${x},${y}) ${temp.toFixed(1)}°C`}</title>
                <rect
                  x={x * cellSize}
                  y={y * cellSize}
                  width={Math.max(1, cellSize - 1)}
                  height={Math.max(1, cellSize - 1)}
                  rx={2}
                  ry={2}
                  fill={tempToColor(temp)}
                  fillOpacity={0.85}
                />
              </g>
            ))
          )}
        </svg>
      </div>

      {/* Color legend */}
      <div className="panel-glass mt-4 flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">{minT.toFixed(1)}°C</span>
        <div className="flex-1 h-3 rounded-full cfd-heatmap-legend" />
        <span className="text-sm font-medium text-muted-foreground">{maxT.toFixed(1)}°C</span>
      </div>
    </div>
  );
}

// ─── Equipment Setup Panel ──────────────────────────────────────────

function EquipmentPanel({ floors, selectedFloorId, roomBoundaries, onFloorChange, onAutoDetect, isDetecting }: {
  floors: DetectedFloor[];
  selectedFloorId: string;
  roomBoundaries: ViewerRoomBoundary[];
  onFloorChange: (id: string) => void;
  onAutoDetect: () => void;
  isDetecting: boolean;
}) {
  const { racks, hvacUnits, tiles, addRack, removeRack, addHVACUnit, removeHVACUnit, addTile, removeTile } = useSimulationStore();

  const selectedFloor = floors.find(f => f.id === selectedFloorId);
  const roomSummary = selectedFloor?.rooms ?? [];

  const [rackForm, setRackForm] = useState({
    name: '', posX: 0, posY: 0, powerKW: 5, density: 'medium' as RackDensity,
  });
  const [hvacForm, setHvacForm] = useState({
    name: '', type: 'crac' as HVACUnitType, posX: 0, posY: 0, capacityKW: 30, airflowCFM: 5000, supplyTempC: 13,
  });

  const handleAddRack = () => {
    addRack({
      name: rackForm.name || `Rack ${racks.length + 1}`,
      position: { x: rackForm.posX, y: rackForm.posY, z: 0 },
      width: 0.6, depth: 1.2, height: 2.0,
      powerDensity: rackForm.density,
      powerKW: rackForm.powerKW,
      airflowCFM: 300,
      orientation: 0,
      rackUnits: 42,
      filledUnits: 30,
    });
    setRackForm({ name: '', posX: rackForm.posX + 1, posY: rackForm.posY, powerKW: 5, density: 'medium' });
  };

  const handleAddHVAC = () => {
    const defaults = HVAC_TYPE_DEFAULTS[hvacForm.type];
    const candidate: HVACUnit = snapHVACUnit({
      id: `preview-${Date.now()}`,
      type: hvacForm.type,
      name: hvacForm.name || `${hvacForm.type.toUpperCase()} ${hvacUnits.length + 1}`,
      position: { x: hvacForm.posX, y: hvacForm.posY, z: 0 },
      width: defaults.width,
      depth: defaults.depth,
      height: defaults.height,
      capacityKW: hvacForm.capacityKW,
      capacityTR: hvacForm.capacityKW / 3.517,
      airflowCFM: hvacForm.airflowCFM,
      supplyTempC: hvacForm.supplyTempC,
      returnTempC: 24,
      orientation: 0,
      powerInputKW: hvacForm.capacityKW / 3,
      status: 'active',
    });

    const validation = validateHVACPlacement(candidate, hvacUnits, roomBoundaries);
    if (!validation.valid) {
      showToast('warning', 'Invalid HVAC placement', validation.reason ?? 'Placement validation failed');
      return;
    }

    addHVACUnit({
      type: candidate.type,
      name: candidate.name,
      position: candidate.position,
      width: candidate.width,
      depth: candidate.depth,
      height: candidate.height,
      capacityKW: candidate.capacityKW,
      capacityTR: candidate.capacityTR,
      airflowCFM: candidate.airflowCFM,
      supplyTempC: candidate.supplyTempC,
      returnTempC: candidate.returnTempC,
      orientation: candidate.orientation,
      powerInputKW: candidate.powerInputKW,
      status: candidate.status,
    });

    setHvacForm((form) => ({
      ...form,
      posX: candidate.position.x,
      posY: candidate.position.y,
    }));
  };

  return (
    <div className="space-y-8">
      {/* Auto-Detect from Project Rooms */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Wand2 size={20} className="text-accent" /> Auto-Detect from Room Specs
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Automatically populate server racks, HVAC units, and grid size from the selected floor&apos;s room specifications.
        </p>

        {floors.length > 0 ? (
          <div className="space-y-4">
            {/* Floor Selector */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-50">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Select Floor</label>
                <select
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
                  value={selectedFloorId}
                  onChange={e => onFloorChange(e.target.value)}
                  aria-label="Select Floor"
                >
                  {floors.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Floor {f.floorNumber}) — {f.rooms.length} room{f.rooms.length !== 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={onAutoDetect}
                disabled={isDetecting || !selectedFloorId}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {isDetecting ? (
                  <><RotateCcw size={16} className="animate-spin" /> Detecting...</>
                ) : (
                  <><Wand2 size={16} /> Auto-Detect Equipment</>
                )}
              </button>
            </div>

            {/* Room Summary Cards */}
            {roomSummary.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {roomSummary.map(room => {
                  const isServer = room.spaceType === 'server_room';
                  return (
                    <div key={room.id} className={`rounded-xl border p-3.5 text-sm ${isServer
                      ? 'border-warning/30 bg-warning/5'
                      : 'border-border bg-card'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {isServer ? <Server size={14} className="text-warning" /> : <Building2 size={14} className="text-muted-foreground" />}
                        <span className="font-semibold text-foreground truncate">{room.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>Type:</span>
                        <span className="font-medium text-foreground">{room.spaceType.replace(/_/g, ' ')}</span>
                        <span>Area:</span>
                        <span className="font-medium text-foreground">{room.area.toFixed(1)} m²</span>
                        <span>Occupants:</span>
                        <span className="font-medium text-foreground">{room.occupantCount}</span>
                        <span>Equip. Load:</span>
                        <span className="font-medium text-foreground">{room.equipmentLoad > 0 ? `${(room.equipmentLoad / 1000).toFixed(1)} kW` : '—'}</span>
                        <span>Lighting:</span>
                        <span className="font-medium text-foreground">{room.lightingDensity > 0 ? `${room.lightingDensity} W/m²` : '—'}</span>
                        {room.coolingLoad?.trValue ? <>
                          <span>Cooling:</span>
                          <span className="font-medium text-accent">{room.coolingLoad.trValue.toFixed(2)} TR</span>
                        </> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">
            Select a project above to see available floors and rooms.
          </div>
        )}
      </div>

      {/* Server Racks */}
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Server size={20} className="text-accent" /> Server Racks
        </h3>
        <div className="panel-glass mb-5 grid grid-cols-2 gap-4 rounded-xl border border-border/70 bg-card p-4 md:grid-cols-5">
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" placeholder="Name" value={rackForm.name} onChange={e => setRackForm(f => ({ ...f, name: e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="X (m)" value={rackForm.posX} onChange={e => setRackForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Y (m)" value={rackForm.posY} onChange={e => setRackForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Power (kW)" value={rackForm.powerKW} onChange={e => setRackForm(f => ({ ...f, powerKW: +e.target.value }))} />
          <button onClick={handleAddRack} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
            <Plus size={16} /> Add Rack
          </button>
        </div>
        {racks.length > 0 && (
          <div className="panel-glass overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Position</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Power</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">BTU/hr</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {racks.map(rack => (
                  <tr key={rack.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3 font-medium">{rack.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">({rack.position.x}, {rack.position.y})</td>
                    <td className="px-4 py-3 font-bold text-warning">{rack.powerKW} kW</td>
                    <td className="px-4 py-3 text-muted-foreground">{(rack.powerKW * 3412).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeRack(rack.id)} aria-label="Remove rack" className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-[rgba(216,77,87,0.12)] hover:text-destructive">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HVAC Units */}
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <AirVent size={20} className="text-accent" /> HVAC Cooling Units
        </h3>
        <div className="panel-glass mb-5 grid grid-cols-2 gap-4 rounded-xl border border-border/70 bg-card p-4 md:grid-cols-6">
          <select className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" value={hvacForm.type} onChange={e => setHvacForm(f => ({ ...f, type: e.target.value as HVACUnitType }))} aria-label="HVAC unit type">
            <option value="crac">CRAC</option>
            <option value="crah">CRAH</option>
            <option value="ahu">AHU</option>
            <option value="in_row">In-Row</option>
            <option value="rear_door">Rear Door HX</option>
          </select>
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="X (m)" value={hvacForm.posX} onChange={e => setHvacForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Y (m)" value={hvacForm.posY} onChange={e => setHvacForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Capacity (kW)" value={hvacForm.capacityKW} onChange={e => setHvacForm(f => ({ ...f, capacityKW: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Airflow (CFM)" value={hvacForm.airflowCFM} onChange={e => setHvacForm(f => ({ ...f, airflowCFM: +e.target.value }))} />
          <button onClick={handleAddHVAC} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
            <Plus size={16} /> Add Unit
          </button>
        </div>
        <p className="-mt-2 mb-4 text-xs text-muted-foreground">
          Placement snaps to 0.25m grid and enforces room-boundary clearance plus no-overlap with existing units.
        </p>
        {hvacUnits.length > 0 && (
          <div className="panel-glass overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Position</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Capacity</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Airflow</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {hvacUnits.map(unit => (
                  <tr key={unit.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3 font-medium">{unit.name}</td>
                    <td className="px-4 py-3"><span className="rounded-md border border-accent/30 bg-[rgba(15,139,141,0.12)] px-2.5 py-1 text-sm font-semibold text-accent">{unit.type.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">({unit.position.x}, {unit.position.y})</td>
                    <td className="px-4 py-3 font-bold text-success">{unit.capacityKW} kW</td>
                    <td className="px-4 py-3 text-muted-foreground">{unit.airflowCFM.toLocaleString()} CFM</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeHVACUnit(unit.id)} aria-label="Remove HVAC unit" className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-[rgba(216,77,87,0.12)] hover:text-destructive">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Perforated Tiles */}
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Grid3x3 size={20} className="text-accent" /> Perforated Floor Tiles
        </h3>
        <div className="panel-glass mb-5 flex gap-3 rounded-xl border border-border/70 bg-card p-4">
          <input id="tileX" className="w-24 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Grid X" defaultValue={5} />
          <input id="tileY" className="w-24 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Grid Y" defaultValue={5} />
          <input id="tileOpen" className="w-32 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.05" placeholder="Open Area (0-1)" defaultValue={0.25} />
          <button
            onClick={() => {
              const x = parseInt((document.getElementById('tileX') as HTMLInputElement).value);
              const y = parseInt((document.getElementById('tileY') as HTMLInputElement).value);
              const openArea = parseFloat((document.getElementById('tileOpen') as HTMLInputElement).value);
              if (!isNaN(x) && !isNaN(y) && openArea >= 0 && openArea <= 1) {
                addTile({ x, y, openArea, tileSize: 0.6 });
              }
            }}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Plus size={16} /> Add Tile
          </button>
        </div>
        {tiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5 text-sm">
                <Grid3x3 size={14} className="text-muted-foreground" />
                <span>({tile.x}, {tile.y})</span>
                <span className="text-muted-foreground">{(tile.openArea * 100).toFixed(0)}%</span>
                <button onClick={() => removeTile(tile.x, tile.y)} aria-label="Remove tile" className="text-destructive/70 hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Simulation Config Panel ────────────────────────────────────────

function ConfigPanel() {
  const { config, setConfig } = useSimulationStore();

  return (
    <div className="panel-glass grid grid-cols-2 gap-5 rounded-xl border border-border/70 bg-card p-6 shadow-sm md:grid-cols-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Resolution (m)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.1" value={config.gridResolution} onChange={e => setConfig({ gridResolution: +e.target.value })} aria-label="Grid Resolution" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size X</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeX} onChange={e => setConfig({ gridSizeX: +e.target.value })} aria-label="Grid Size X" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size Y</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeY} onChange={e => setConfig({ gridSizeY: +e.target.value })} aria-label="Grid Size Y" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size Z</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeZ} onChange={e => setConfig({ gridSizeZ: +e.target.value })} aria-label="Grid Size Z" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Iterations</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.iterations} onChange={e => setConfig({ iterations: +e.target.value })} aria-label="Iterations" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Convergence</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.001" value={config.convergence} onChange={e => setConfig({ convergence: +e.target.value })} aria-label="Convergence" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Time Step (s)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.01" value={config.timeStep} onChange={e => setConfig({ timeStep: +e.target.value })} aria-label="Time Step" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ambient Temp (°C)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.ambientTempC} onChange={e => setConfig({ ambientTempC: +e.target.value })} aria-label="Ambient Temperature" />
      </div>
    </div>
  );
}

// ─── Results Panel ──────────────────────────────────────────────────

function ResultsPanel() {
  const { result, complianceReport, failureResult, pueAnalysis, optimizationResult } = useSimulationStore();

  if (!result) {
    return (
      <div className="panel-glass flex h-64 flex-col items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm">
        <Wind size={48} className="mb-4 text-muted-foreground/45" />
        <p className="text-lg font-bold text-foreground">No simulation results yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Place equipment and run a CFD simulation</p>
      </div>
    );
  }

  const m = result.metrics;

  return (
    <div className="space-y-8">
      {/* Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Max Temperature" value={`${m.maxTemperature.toFixed(1)}°C`} icon={Thermometer} />
        <StatCard title="Avg Temperature" value={`${m.avgTemperature.toFixed(1)}°C`} icon={Thermometer} />
        <StatCard title="Hotspots" value={m.hotspots.length} subtitle={m.hotspots.filter(h => h.severity === 'critical').length + ' critical'} icon={AlertTriangle} />
        <StatCard title="PUE" value={m.pue.toFixed(2)} subtitle={m.pue <= 1.5 ? 'Good' : m.pue <= 2.0 ? 'Average' : 'Poor'} icon={Zap} />
      </div>

      {/* Temperature Heatmap */}
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-6 shadow-sm">
        <TemperatureHeatmap />
      </div>

      {/* Rack Inlet Temperatures */}
      {m.rackInletTemps.length > 0 && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Rack Inlet Temperatures</h3>
          <div className="space-y-2">
            {m.rackInletTemps.map(rack => {
              const pct = ((rack.avgTemp - 15) / 30) * 100;
              const barColor = rack.avgTemp > 35 ? 'bg-red-500' : rack.avgTemp > 27 ? 'bg-amber-500' : 'bg-emerald-500';
              const filledSegments = Math.max(1, Math.min(20, Math.round(pct / 5)));
              return (
                <div key={rack.rackId} className="flex items-center gap-4">
                  <span className="w-32 truncate text-sm font-medium text-muted-foreground">{rack.rackId.slice(0, 8)}</span>
                  <div className="grid h-3 flex-1 grid-cols-20 gap-0.5 overflow-hidden rounded-full bg-secondary/70 p-0.5">
                    {Array.from({ length: 20 }).map((_, index) => (
                      <span
                        key={`${rack.rackId}-seg-${index}`}
                        className={`rounded-sm ${index < filledSegments ? barColor : 'bg-secondary/40'}`}
                      />
                    ))}
                  </div>
                  <span className="w-16 text-right text-sm font-bold text-foreground">{rack.avgTemp.toFixed(1)}°C</span>
                  <span className="w-24 text-sm text-muted-foreground">(max {rack.maxTemp.toFixed(1)}°C)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hotspots Detail */}
      {m.hotspots.length > 0 && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle size={20} className="text-amber-500" /> Detected Hotspots
          </h3>
          <div className="space-y-3">
            {m.hotspots.map((hs, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${
                hs.severity === 'emergency' ? 'bg-[rgba(216,77,87,0.1)] border-[rgba(216,77,87,0.3)]' :
                hs.severity === 'critical' ? 'bg-[rgba(219,142,47,0.14)] border-[rgba(219,142,47,0.35)]' :
                'bg-[rgba(206,161,74,0.14)] border-[rgba(206,161,74,0.35)]'
              }`}>
                <div>
                  <span className={`rounded-md px-2.5 py-1 text-sm font-bold uppercase ${
                    hs.severity === 'emergency' ? 'bg-[rgba(216,77,87,0.18)] text-destructive' :
                    hs.severity === 'critical' ? 'bg-[rgba(219,142,47,0.18)] text-warning' :
                    'bg-[rgba(206,161,74,0.2)] text-accent'
                  }`}>{hs.severity}</span>
                  <span className="ml-3 text-sm text-foreground/90">
                    Position: ({hs.position.x.toFixed(1)}, {hs.position.y.toFixed(1)}, {hs.position.z.toFixed(1)})m
                  </span>
                </div>
                <span className="text-lg font-semibold text-foreground">{hs.temperature.toFixed(1)}°C</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ASHRAE Compliance */}
      {complianceReport && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck size={20} className={complianceReport.overallPass ? 'text-emerald-500' : 'text-red-500'} />
              ASHRAE TC 9.9 Compliance — Class {complianceReport.thermalClass}
            </h3>
            <div className={`px-4 py-2 rounded-xl text-sm font-bold ${
              complianceReport.overallPass ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              Score: {complianceReport.score}/100
            </div>
          </div>
          <div className="space-y-2">
            {complianceReport.checks.map((check, i) => (
              <div key={i} className={`flex items-center justify-between rounded-lg border p-3 ${
                check.passed
                  ? 'border-border bg-secondary/50'
                  : check.severity === 'critical'
                    ? 'border-[rgba(216,77,87,0.32)] bg-[rgba(216,77,87,0.1)]'
                    : 'border-[rgba(219,142,47,0.32)] bg-[rgba(219,142,47,0.12)]'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${check.passed ? 'bg-emerald-500' : check.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="text-sm font-medium text-foreground">{check.description}</span>
                </div>
                <span className="text-sm font-bold text-muted-foreground">{check.value} {check.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PUE Analysis */}
      {pueAnalysis && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Zap size={20} className="text-accent" /> Energy Efficiency (PUE)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className="text-3xl font-semibold text-accent">{pueAnalysis.pue}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">PUE</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.itEquipmentPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">IT Power</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.coolingPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Cooling Power</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.totalFacilityPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Total Power</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className={`text-xl font-bold ${
                pueAnalysis.rating === 'excellent' ? 'text-emerald-600' :
                pueAnalysis.rating === 'good' ? 'text-accent' :
                pueAnalysis.rating === 'average' ? 'text-amber-600' : 'text-red-600'
              }`}>{pueAnalysis.rating.toUpperCase()}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Rating</p>
            </div>
          </div>
          {pueAnalysis.recommendations.length > 0 && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-4">
              <p className="mb-2 text-sm font-bold text-accent">Recommendations:</p>
              <ul className="space-y-1">
                {pueAnalysis.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-0.5 text-accent">•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Failure Simulation */}
      {failureResult && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle size={20} className="text-red-500" /> Failure Analysis: {failureResult.scenario.replace(/_/g, ' ').toUpperCase()}
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-xl border border-[rgba(219,142,47,0.35)] bg-[rgba(219,142,47,0.14)] p-4 text-center">
              <p className="text-2xl font-semibold text-yellow-700">{failureResult.timeToWarning >= 0 ? `${Math.round(failureResult.timeToWarning / 60)}m` : 'N/A'}</p>
              <p className="mt-1 text-sm font-semibold text-yellow-600">Time to Warning</p>
            </div>
            <div className="rounded-xl border border-[rgba(216,77,87,0.35)] bg-[rgba(216,77,87,0.1)] p-4 text-center">
              <p className="text-2xl font-semibold text-red-700">{failureResult.timeToCritical >= 0 ? `${Math.round(failureResult.timeToCritical / 60)}m` : 'N/A'}</p>
              <p className="mt-1 text-sm font-semibold text-red-600">Time to Critical</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{failureResult.affectedRacks.length}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Affected Racks</p>
            </div>
          </div>
          {failureResult.recommendations.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-4">
              <ul className="space-y-1">
                {failureResult.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-destructive">
                    <span className="text-red-400 mt-0.5">•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Optimization Results */}
      {optimizationResult && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <TrendingUp size={20} className="text-emerald-500" /> Optimization Results
          </h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-3xl font-semibold text-emerald-600">{optimizationResult.improvement}%</p>
              <p className="mt-1 text-sm font-semibold text-emerald-600">Improvement</p>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-muted-foreground">Before: Max Temp</p>
                <p className="text-lg font-bold text-foreground">{optimizationResult.initialMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-muted-foreground">After: Max Temp</p>
                <p className="text-lg font-bold text-emerald-600">{optimizationResult.optimizedMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
            </div>
          </div>
          <h4 className="mb-3 text-sm font-bold text-foreground">Suggestions ({optimizationResult.suggestions.length})</h4>
          <div className="space-y-2">
            {optimizationResult.suggestions.map((sug, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
                <span className="text-sm text-foreground">{sug.description}</span>
                <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-700">{sug.impact}% impact</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Failure Simulation Panel ───────────────────────────────────────

function FailurePanel() {
  const { hvacUnits, runFailure, isRunning } = useSimulationStore();
  const [scenario, setScenario] = useState<FailureScenario>('crac_failure');
  const [duration, setDuration] = useState(3600);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const handleRun = () => {
    runFailure({
      scenario,
      failedUnitIds: selectedUnits,
      duration,
      timeStep: 10,
      rackMass: 500,
      specificHeat: 900,
    });
  };

  return (
    <div className="space-y-6">
      <div className="panel-glass grid grid-cols-2 gap-5 rounded-xl border border-border/70 bg-card p-5 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Failure Scenario</label>
          <select className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" value={scenario} onChange={e => setScenario(e.target.value as FailureScenario)} aria-label="Failure Scenario">
            <option value="crac_failure">CRAC Unit Failure</option>
            <option value="power_loss">Total Power Loss</option>
            <option value="cooling_restart">Cooling Restart</option>
            <option value="partial_cooling">Partial Cooling Loss</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Duration (seconds)</label>
          <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={duration} onChange={e => setDuration(+e.target.value)} aria-label="Duration" />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            <AlertTriangle size={16} /> Run Failure Sim
          </button>
        </div>
      </div>
      {scenario !== 'power_loss' && hvacUnits.length > 0 && (
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Select Failed Units</label>
          <div className="panel-glass flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card p-4">
            {hvacUnits.map(unit => (
              <button
                key={unit.id}
                onClick={() => {
                  setSelectedUnits(prev =>
                    prev.includes(unit.id) ? prev.filter(id => id !== unit.id) : [...prev, unit.id]
                  );
                }}
                className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  selectedUnits.includes(unit.id)
                    ? 'border-red-500/35 bg-red-500/10 text-destructive'
                    : 'border-border bg-background text-muted-foreground hover:border-border'
                }`}
              >
                {unit.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

function ProjectDropdown({ projects, onSelect, selectedId }: ProjectDropdownProps) {
  return (
    <div className="panel-glass mb-6 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Choose Project</label>
      <select
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
        value={selectedId}
        onChange={e => onSelect(e.target.value)}
        aria-label="Choose Project"
      >
        {projects.map((p: Project) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

interface ProjectDropdownProps {
  projects: Project[];
  onSelect: (id: string) => void;
  selectedId: string;
}
// Project dropdown now fetches from API

export default function SimulationPage() {
  const [simError, setSimError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeTab, setActiveTab] = useState('equipment');
  const [selectedHVACId, setSelectedHVACId] = useState<string | null>(null);
  const [layoutSaveState, setLayoutSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const layoutHydratingRef = useRef(false);
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLayoutPayloadHashRef = useRef('');

  const {
    racks,
    hvacUnits,
    tiles,
    isRunning,
    result,
    runSimulation, runCompliance, runPUE, runOptimization,
    activeView, showHotspots, showAirflow, selectedSliceZ,
    setActiveView, setShowHotspots, setShowAirflow, setSelectedSliceZ,
    addRack, updateHVACUnit, setHVACUnits, setTiles, setConfig, setMode, config, clearAll,
    inspectedCell, setInspectedCell,
    tileFlowView, setTileFlowView, alerts, tileAirflowData,
  } = useSimulationStore();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [detectedFloors, setDetectedFloors] = useState<DetectedFloor[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const tileFlowViewerRef = useRef<import('@/components/building/AirflowViewer3D').AirflowViewerHandle>(null);
  const selectedFloor = useMemo(
    () => detectedFloors.find((floor) => floor.id === selectedFloorId) ?? null,
    [detectedFloors, selectedFloorId],
  );

  // Fetch projects
  useEffect(() => {
    authFetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.projects && Array.isArray(data.projects)) {
          setProjectList(data.projects);
          if (data.projects.length > 0) {
            setSelectedProjectId(data.projects[0].id);
          }
        }
        setLoadingProjects(false);
      })
      .catch((err) => {
        setLoadingProjects(false);
        setSimError('Failed to load projects: ' + err?.message);
      });
  }, []);

  // Fetch floors+rooms when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    authFetch(`/api/projects/${selectedProjectId}`)
      .then(res => res.json())
      .then(data => {
        const project = data.project || data;
        if (project.floors && Array.isArray(project.floors)) {
          const floors: DetectedFloor[] = project.floors.map((f: Record<string, unknown>) => ({
            id: f.id as string,
            floorNumber: (f.floorNumber as number) ?? 0,
            name: (f.name as string) ?? `Floor ${f.floorNumber}`,
            scale: Number(f.scale) > 0 ? Number(f.scale) : 50,
            ceilingHeight: (f.ceilingHeight as number) ?? 3.0,
            rooms: Array.isArray(f.rooms) ? (f.rooms as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
              id: r.id as string,
              name: (r.name as string) ?? 'Room',
              area: (r.area as number) ?? 0,
              ceilingHeight: (r.ceilingHeight as number) ?? 3.0,
              spaceType: (r.spaceType as string) ?? 'office',
              occupantCount: (r.occupantCount as number) ?? 0,
              lightingDensity: (r.lightingDensity as number) ?? 0,
              equipmentLoad: (r.equipmentLoad as number) ?? 0,
              coolingLoad: r.coolingLoad as DetectedRoom['coolingLoad'],
              polygon: typeof r.polygon === 'string' ? r.polygon : undefined,
            })) : [],
          }));
          setDetectedFloors(floors);
          if (floors.length > 0) setSelectedFloorId(floors[0].id);
        }
      })
      .catch(() => { /* ignore */ });
  }, [selectedProjectId]);

  // Sync HVAC/tile placements from saved floorplan layout.
  useEffect(() => {
    if (!selectedProjectId || !selectedFloorId) {
      return;
    }

    let cancelled = false;
    layoutHydratingRef.current = true;

    authFetch(`/api/projects/${selectedProjectId}/simulation-layout?floorId=${encodeURIComponent(selectedFloorId)}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const data = await response.json();
        return (data?.layout ?? null) as Record<string, unknown> | null;
      })
      .then((layout) => {
        if (cancelled) {
          return;
        }

        const hvacPlacements = Array.isArray(layout?.hvacPlacements)
          ? (layout?.hvacPlacements as Record<string, unknown>[])
          : [];
        const tilePlacements = Array.isArray(layout?.tilePlacements)
          ? (layout?.tilePlacements as Record<string, unknown>[])
          : [];

        const mappedHVAC = hvacPlacements.map((placement, index) => mapLayoutHVACToUnit(placement, index));
        const mappedTiles = tilePlacements
          .map(mapLayoutTile)
          .filter((tile): tile is PerforatedTile => tile !== null);

        const floorRoomBoundaries = buildRoomBoundariesForFloor(selectedFloor);
        const sanitizedHVAC = sanitizeHVACPlacements(mappedHVAC, floorRoomBoundaries);

        setHVACUnits(sanitizedHVAC.accepted);
        setTiles(mappedTiles);
        if (selectedHVACId && !sanitizedHVAC.accepted.some((unit) => unit.id === selectedHVACId)) {
          setSelectedHVACId(null);
        }

        const hydratedPayload = buildLayoutPayload(
          selectedFloorId,
          selectedFloor,
          sanitizedHVAC.accepted,
          mappedTiles,
        );
        lastLayoutPayloadHashRef.current = buildLayoutPayloadHash(hydratedPayload);

        if (sanitizedHVAC.rejected.length > 0) {
          showToast(
            'warning',
            'Layout HVAC validation applied',
            `${sanitizedHVAC.accepted.length} unit(s) accepted, ${sanitizedHVAC.rejected.length} skipped due to boundary/overlap constraints.`,
          );
        }

        const floorBounds = selectedFloor
          ? deriveFloorBoundsMeters(selectedFloor)
          : { width: 6, length: 6 };
        const hvacExtentX = sanitizedHVAC.accepted.reduce((max, unit) => Math.max(max, unit.position.x + unit.width), 0);
        const hvacExtentY = sanitizedHVAC.accepted.reduce((max, unit) => Math.max(max, unit.position.y + unit.depth), 0);
        const tileExtentX = mappedTiles.reduce((max, tile) => Math.max(max, tile.x + tile.tileSize), 0);
        const tileExtentY = mappedTiles.reduce((max, tile) => Math.max(max, tile.y + tile.tileSize), 0);

        const targetWidthM = Math.max(floorBounds.width, hvacExtentX + 1, tileExtentX + 1, 6);
        const targetLengthM = Math.max(floorBounds.length, hvacExtentY + 1, tileExtentY + 1, 6);
        const cellSize = Math.max(0.1, config.gridResolution);

        const nextGridSizeX = Math.max(10, Math.min(80, Math.ceil(targetWidthM / cellSize) + 2));
        const nextGridSizeY = Math.max(10, Math.min(80, Math.ceil(targetLengthM / cellSize) + 2));
        const nextGridSizeZ = Math.max(
          6,
          Math.min(24, Math.ceil(Math.max(2.4, selectedFloor?.ceilingHeight ?? 3.0) / cellSize)),
        );
        const currentConfig = useSimulationStore.getState().config;

        if (
          nextGridSizeX !== currentConfig.gridSizeX
          || nextGridSizeY !== currentConfig.gridSizeY
          || nextGridSizeZ !== currentConfig.gridSizeZ
        ) {
          setConfig({
            gridSizeX: nextGridSizeX,
            gridSizeY: nextGridSizeY,
            gridSizeZ: nextGridSizeZ,
          });
        }
      })
      .catch(() => { /* ignore layout sync errors */ })
      .finally(() => {
        if (!cancelled) {
          layoutHydratingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
      layoutHydratingRef.current = false;
    };
  }, [
    selectedProjectId,
    selectedFloorId,
    selectedFloor,
    selectedHVACId,
    config.gridResolution,
    setConfig,
    setHVACUnits,
    setTiles,
  ]);

  const viewerRoomBoundaries = useMemo<ViewerRoomBoundary[]>(
    () => buildRoomBoundariesForFloor(selectedFloor),
    [selectedFloor],
  );

  const canEditHVACIn3D = viewerRoomBoundaries.length > 0;

  const handleHVACDragPreview = useCallback((unitId: string, proposedPosition: Vec3) => {
    const unit = hvacUnits.find((item) => item.id === unitId);
    if (!unit) {
      return {
        position: proposedPosition,
        valid: false,
        reason: 'Selected HVAC unit no longer exists.',
      };
    }

    const snappedCandidate = snapHVACUnit({
      ...unit,
      position: {
        x: proposedPosition.x,
        y: proposedPosition.y,
        z: unit.position.z,
      },
    });
    const validation = validateHVACPlacement(
      snappedCandidate,
      hvacUnits.filter((item) => item.id !== unitId),
      viewerRoomBoundaries,
    );

    return {
      position: snappedCandidate.position,
      valid: validation.valid,
      reason: validation.reason,
    };
  }, [hvacUnits, viewerRoomBoundaries]);

  const handleHVACDragCommit = useCallback((unitId: string, position: Vec3) => {
    const unit = hvacUnits.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    const snappedCandidate = snapHVACUnit({
      ...unit,
      position: {
        x: position.x,
        y: position.y,
        z: unit.position.z,
      },
    });
    const validation = validateHVACPlacement(
      snappedCandidate,
      hvacUnits.filter((item) => item.id !== unitId),
      viewerRoomBoundaries,
    );

    if (!validation.valid) {
      showToast('warning', 'Invalid HVAC placement', validation.reason ?? 'Placement failed validation.');
      return;
    }

    setSelectedHVACId(unitId);
    updateHVACUnit(unitId, { position: snappedCandidate.position });
  }, [hvacUnits, updateHVACUnit, viewerRoomBoundaries]);

  const handleHVACDragInvalid = useCallback((_: string, reason: string) => {
    showToast('warning', 'Invalid HVAC placement', reason || 'Placement failed validation.');
  }, []);

  // Persist committed HVAC/tile layout changes back to the floor simulation layout.
  useEffect(() => {
    if (!selectedProjectId || !selectedFloorId || layoutHydratingRef.current) {
      return;
    }

    const payload = buildLayoutPayload(selectedFloorId, selectedFloor, hvacUnits, tiles);
    const nextHash = buildLayoutPayloadHash(payload);

    if (nextHash === lastLayoutPayloadHashRef.current) {
      return;
    }

    if (layoutSaveTimerRef.current) {
      clearTimeout(layoutSaveTimerRef.current);
      layoutSaveTimerRef.current = null;
    }

    layoutSaveTimerRef.current = setTimeout(() => {
      setLayoutSaveState('saving');
      authFetch(`/api/projects/${selectedProjectId}/simulation-layout`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (!response.ok) {
            const details = await response.text().catch(() => '');
            throw new Error(details || 'Failed to save simulation layout.');
          }
          lastLayoutPayloadHashRef.current = nextHash;
          setLayoutSaveState('saved');
        })
        .catch(() => {
          setLayoutSaveState('error');
          showToast(
            'error',
            'Simulation layout save failed',
            'Recent HVAC or tile changes were not persisted. Move the unit again to retry.',
          );
        });
    }, 650);

    return () => {
      if (layoutSaveTimerRef.current) {
        clearTimeout(layoutSaveTimerRef.current);
        layoutSaveTimerRef.current = null;
      }
    };
  }, [selectedProjectId, selectedFloorId, selectedFloor, hvacUnits, tiles]);

  useEffect(() => {
    if (layoutSaveState !== 'saved') {
      return;
    }
    const clearSavedStateTimer = setTimeout(() => {
      setLayoutSaveState('idle');
    }, 1200);
    return () => {
      clearTimeout(clearSavedStateTimer);
    };
  }, [layoutSaveState]);

  const layoutSaveStatusText = useMemo(() => {
    if (layoutSaveState === 'saving') return 'Layout saving...';
    if (layoutSaveState === 'saved') return 'Layout saved';
    if (layoutSaveState === 'error') return 'Layout save failed';
    return 'Layout synced';
  }, [layoutSaveState]);

  // Auto-detect handler: infer racks + HVAC from room specs
  const handleAutoDetect = useCallback(() => {
    const floor = detectedFloors.find(f => f.id === selectedFloorId);
    if (!floor || floor.rooms.length === 0) {
      showToast('error', 'No rooms found', 'This floor has no rooms to auto-detect from.');
      return;
    }

    setIsDetecting(true);

    // Clear existing equipment and results
    clearAll();
    setSelectedHVACId(null);

    const allRacks: Omit<ServerRack, 'id'>[] = [];
    const allHVAC: Omit<HVACUnit, 'id'>[] = [];
    let offsetX = 1;

    for (const room of floor.rooms) {
      // Infer racks (only for server rooms)
      const racks = inferRacksFromRoom(room, offsetX);
      allRacks.push(...racks);

      // Infer HVAC units for every room
      const hvacs = inferHVACFromRoom(room, offsetX, floor.scale);
      allHVAC.push(...hvacs);

      offsetX += Math.max(Math.ceil(Math.sqrt(room.area)), 4) + 2;
    }

    // Add all to store
    for (const rack of allRacks) addRack(rack);
    const inferredUnits: HVACUnit[] = allHVAC.map((unit, index) => ({
      ...unit,
      id: `auto-hvac-${index + 1}-${crypto.randomUUID()}`,
    }));
    const floorRoomBoundaries = buildRoomBoundariesForFloor(floor);
    const sanitizedHVAC = sanitizeHVACPlacements(inferredUnits, floorRoomBoundaries);
    setHVACUnits(sanitizedHVAC.accepted);

    // Auto-size grid based on floor area
    const totalArea = floor.rooms.reduce((s, r) => s + r.area, 0);
    const gridSide = Math.max(10, Math.ceil(Math.sqrt(totalArea) / 0.5));
    const gridZ = Math.max(6, Math.ceil(floor.ceilingHeight / 0.5));
    setConfig({
      gridSizeX: Math.min(gridSide, 50),
      gridSizeY: Math.min(gridSide, 50),
      gridSizeZ: gridZ,
    });

    setIsDetecting(false);
    const acceptedCount = sanitizedHVAC.accepted.length;
    const rejectedCount = sanitizedHVAC.rejected.length;
    const message = rejectedCount > 0
      ? `Added ${allRacks.length} rack${allRacks.length !== 1 ? 's' : ''}; ${acceptedCount} HVAC placed, ${rejectedCount} skipped by placement validation.`
      : `Added ${allRacks.length} rack${allRacks.length !== 1 ? 's' : ''} and ${acceptedCount} HVAC unit${acceptedCount !== 1 ? 's' : ''} from ${floor.rooms.length} room${floor.rooms.length !== 1 ? 's' : ''}.`;
    showToast(rejectedCount > 0 ? 'warning' : 'success', 'Equipment auto-detected', message);
  }, [detectedFloors, selectedFloorId, addRack, setHVACUnits, setConfig, clearAll]);
  const totalHeatKW = useMemo(() => racks.reduce((s, r) => s + r.powerKW, 0), [racks]);
  const totalCoolingKW = useMemo(() => hvacUnits.filter(u => u.status !== 'failed').reduce((s, u) => s + u.capacityKW, 0), [hvacUnits]);

  const tabs = [
    { id: 'equipment', label: 'Equipment', icon: <Server size={16} />, badge: racks.length + hvacUnits.length },
    { id: 'config', label: 'Configuration', icon: <Settings2 size={16} /> },
    { id: 'simulation', label: 'Simulation', icon: <Activity size={16} /> },
    { id: '3d', label: '3D Airflow', icon: <Box size={16} /> },
    { id: 'results', label: 'Results & Analysis', icon: <BarChart3 size={16} /> },
    { id: 'tileflow', label: 'TileFlow Analysis', icon: <Layers size={16} /> },
    { id: 'failure', label: 'Failure Simulation', icon: <AlertTriangle size={16} /> },
    { id: 'calibration', label: 'Calibration', icon: <Crosshair size={16} /> },
  ];

  return (
    <PageWrapper>
      {simError && (
        <div className="mx-auto mb-6 mt-6 max-w-4xl rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm font-semibold text-destructive">
          {simError}
        </div>
      )}
      <PageHeader
        title="CFD Simulation"
        description="Airflow simulation, thermal analysis, and cooling optimization"
        actions={
          <div className="panel-glass flex flex-wrap items-center gap-2.5 rounded-xl border border-border/70 bg-card p-2 shadow-sm">
            <button
              onClick={() => { runPUE(); }}
              disabled={racks.length === 0}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              <Zap size={16} /> PUE
            </button>
            <button
              onClick={() => { runCompliance(); }}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
            >
              <ShieldCheck size={16} /> Compliance
            </button>
            <button
              onClick={() => { runOptimization(); }}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              <TrendingUp size={16} /> Optimize
            </button>
            <button
              onClick={() => runSimulation(selectedProjectId || '', selectedFloorId || '')}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {isRunning ? <><RotateCcw size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run Simulation</>}
            </button>
          </div>
        }
      />

      <div className="panel-glass mb-6 rounded-xl border border-border/70 bg-primary/5 px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Simulation Command Deck</p>
            <p className="mt-0.5 text-sm text-foreground">
              Configure thermal model inputs, run airflow scenarios, and evaluate compliance and energy outcomes.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground tabular-nums">
            {racks.length} racks · {hvacUnits.length} HVAC units · {result ? 'Result ready' : 'Awaiting run'}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {loadingProjects ? (
          <div className="py-6 text-center text-sm font-medium text-muted-foreground">Loading projects...</div>
        ) : (
          <ProjectDropdown
            projects={projectList}
            selectedId={selectedProjectId}
            onSelect={(id) => { setDetectedFloors([]); setSelectedProjectId(id); }}
          />
        )}
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-2 gap-5 md:grid-cols-4">
        <StatCard title="Server Racks" value={racks.length} icon={Server} />
        <StatCard title="HVAC Units" value={hvacUnits.length} icon={AirVent} />
        <StatCard title="Total Heat Load" value={`${totalHeatKW.toFixed(0)} kW`} subtitle={`${(totalHeatKW * 3412).toLocaleString()} BTU/hr`} icon={Thermometer} />
        <StatCard title="Cooling Capacity" value={`${totalCoolingKW.toFixed(0)} kW`} subtitle={totalHeatKW > 0 ? `${((totalCoolingKW / totalHeatKW) * 100).toFixed(0)}% of load` : '—'} icon={Wind} />
      </div>

      {/* Capacity Alert */}
      {totalHeatKW > 0 && totalCoolingKW < totalHeatKW && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/8 p-4 shadow-sm"
        >
          <AlertTriangle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium text-destructive">
            <strong>Cooling deficit:</strong> Total heat load ({totalHeatKW.toFixed(0)} kW) exceeds cooling capacity ({totalCoolingKW.toFixed(0)} kW).
            Add {(totalHeatKW - totalCoolingKW).toFixed(0)} kW more cooling capacity.
          </p>
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        <TabPanel tabId="equipment" activeTab={activeTab}>
          <EquipmentPanel
            floors={detectedFloors}
            selectedFloorId={selectedFloorId}
            roomBoundaries={viewerRoomBoundaries}
            onFloorChange={setSelectedFloorId}
            onAutoDetect={handleAutoDetect}
            isDetecting={isDetecting}
          />
        </TabPanel>
        <TabPanel tabId="config" activeTab={activeTab}>
          <ConfigPanel />
        </TabPanel>
        <TabPanel tabId="simulation" activeTab={activeTab}>
          <div className="space-y-5">
            {/* Run Simulation */}
            <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Run Simulation</h3>
              <button
                onClick={() => runSimulation(selectedProjectId || '', selectedFloorId || '')}
                disabled={racks.length === 0 || isRunning}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {isRunning ? <><RotateCcw size={18} className="animate-spin" /> Running Simulation...</> : <><Play size={18} /> Run CFD Simulation</>}
              </button>
              {racks.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Add equipment in the Equipment tab or auto-detect from project to enable simulation.</p>
              )}
            </div>

            {/* Mesh Density */}
            <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Sliders size={14} /> Mesh Density
              </h3>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Coarse</span>
                <input
                  type="range"
                  min={0.25}
                  max={2.0}
                  step={0.25}
                  value={config.gridResolution}
                  onChange={(e) => setConfig({ gridResolution: Number(e.target.value) })}
                  className="w-full"
                  aria-label="Grid resolution"
                />
                <span className="text-xs text-muted-foreground">Fine</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{config.gridResolution} m/cell</span>
                <span className="text-xs text-muted-foreground">
                  Grid: {config.gridSizeX}×{config.gridSizeY}×{config.gridSizeZ}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                {(['fast', 'balanced', 'engineering'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                      config.mode === m
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border bg-background text-muted-foreground hover:border-border'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Accuracy Indicator */}
            <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Gauge size={14} /> Accuracy Indicator
              </h3>
              {result ? (() => {
                const converged = result.metrics.converged;
                const residual = result.metrics.energyResidual;
                const iterPct = Math.min(100, Math.round((result.iteration / result.config.iterations) * 100));
                const qualityLabel = converged ? 'Converged' : residual < 0.01 ? 'Near-converged' : 'Not converged';
                const qualityColor = converged ? 'text-green-500' : residual < 0.01 ? 'text-yellow-500' : 'text-red-500';
                const barColor = converged ? 'bg-green-500' : residual < 0.01 ? 'bg-yellow-500' : 'bg-red-500';
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${qualityColor}`}>{qualityLabel}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{result.iteration}/{result.config.iterations} iters</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${iterPct}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Energy Residual</span>
                        <p className="font-semibold tabular-nums text-foreground">{residual.toExponential(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Momentum Residual</span>
                        <p className="font-semibold tabular-nums text-foreground">{result.metrics.momentumResidual.toExponential(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Max Divergence</span>
                        <p className="font-semibold tabular-nums text-foreground">{result.metrics.maxDivergence.toExponential(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Effective Δt</span>
                        <p className="font-semibold tabular-nums text-foreground">{result.effectiveTimeStep.toFixed(4)} s</p>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="flex flex-col items-center py-6 text-center">
                  <Gauge size={32} className="mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Run a simulation to see convergence data</p>
                </div>
              )}
            </div>
          </div>
        </TabPanel>
        <TabPanel tabId="3d" activeTab={activeTab}>
          {result ? (
            <>
              <div className="panel-glass mb-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    View Mode
                  </span>
                  {(['temperature', 'velocity', 'pressure', 'humidity'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setActiveView(mode)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors ${
                        activeView === mode
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-background text-muted-foreground hover:border-border'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <div className="flex min-w-65 flex-1 items-center gap-3">
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Slice Z
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, result.config.gridSizeZ - 1)}
                      value={Math.max(0, Math.min(selectedSliceZ, result.config.gridSizeZ - 1))}
                      onChange={(event) => setSelectedSliceZ(Number(event.target.value))}
                      className="w-full"
                      aria-label="Slice Z"
                    />
                    <span className="w-24 text-right text-sm font-semibold tabular-nums text-foreground">
                      {Math.max(0, Math.min(selectedSliceZ, result.config.gridSizeZ - 1))} ({(Math.max(0, Math.min(selectedSliceZ, result.config.gridSizeZ - 1)) * result.config.gridResolution).toFixed(1)}m)
                    </span>
                  </div>

                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showHotspots}
                      onChange={(event) => setShowHotspots(event.target.checked)}
                    />
                    Hotspots
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showAirflow}
                      onChange={(event) => setShowAirflow(event.target.checked)}
                    />
                    Airflow Particles
                  </label>

                  <div className="ml-auto rounded-lg border border-border/80 bg-background px-3 py-2 text-xs">
                    <p className="font-semibold text-foreground">
                      {canEditHVACIn3D ? 'Drag HVAC in 3D to reposition' : 'Room polygons required for HVAC drag editing'}
                    </p>
                    <p className={`mt-0.5 font-medium ${layoutSaveState === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {layoutSaveStatusText}
                    </p>
                  </div>
                </div>
              </div>

              <AirflowViewer3D
                result={result}
                racks={racks}
                hvacUnits={hvacUnits}
                roomBoundaries={viewerRoomBoundaries}
                editableHVAC={canEditHVACIn3D}
                selectedHVACId={selectedHVACId}
                onSelectHVAC={setSelectedHVACId}
                onHVACDragPreview={handleHVACDragPreview}
                onHVACDragCommit={handleHVACDragCommit}
                onHVACDragInvalid={handleHVACDragInvalid}
                showHotspots={showHotspots}
                showAirflow={showAirflow}
                selectedSliceZ={selectedSliceZ}
                viewMode={activeView}
                onInspect={setInspectedCell}
              />

              {/* Inspect overlay card */}
              {inspectedCell && (
                <div className="mt-3 panel-glass rounded-xl border border-accent/30 bg-card p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-accent">Inspected Cell</h4>
                    <button
                      onClick={() => setInspectedCell(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Position</span>
                      <p className="font-semibold tabular-nums text-foreground">
                        ({inspectedCell.position.x.toFixed(1)}, {inspectedCell.position.y.toFixed(1)}, {inspectedCell.position.z.toFixed(1)}) m
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Temperature</span>
                      <p className="font-semibold tabular-nums text-foreground">{inspectedCell.temperature.toFixed(1)} °C</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Velocity</span>
                      <p className="font-semibold tabular-nums text-foreground">
                        {Math.sqrt(inspectedCell.velocity.x ** 2 + inspectedCell.velocity.y ** 2 + inspectedCell.velocity.z ** 2).toFixed(2)} m/s
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Pressure</span>
                      <p className="font-semibold tabular-nums text-foreground">{inspectedCell.pressure.toFixed(1)} Pa</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="panel-glass flex h-125 flex-col items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm">
              <Box size={48} className="mb-4 text-muted-foreground/45" />
              <p className="font-semibold text-foreground">Run a simulation to view 3D airflow</p>
            </div>
          )}
        </TabPanel>
        <TabPanel tabId="results" activeTab={activeTab}>
          <ResultsPanel />
        </TabPanel>
        <TabPanel tabId="tileflow" activeTab={activeTab}>
          {result ? (
            <div className="space-y-6">
              {/* TileFlow 3D Controls */}
              <div className="panel-glass rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">TileFlow Overlays</span>
                  {([
                    { key: 'showStreamlines' as const, label: 'Streamlines' },
                    { key: 'showFog' as const, label: 'Temp Fog' },
                    { key: 'showTileOverlay' as const, label: 'Tile Airflow' },
                    { key: 'showAlerts' as const, label: 'Alert Zones' },
                  ]).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={tileFlowView[key]}
                        onChange={(e) => setTileFlowView({ [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                  <div className="ml-auto flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Fog Opacity</label>
                    <input
                      type="range"
                      min={0.05}
                      max={0.8}
                      step={0.05}
                      value={tileFlowView.fogOpacity}
                      onChange={(e) => setTileFlowView({ fogOpacity: Number(e.target.value) })}
                      className="w-24"
                      aria-label="Fog opacity"
                    />
                    <span className="w-8 text-xs tabular-nums text-foreground">{(tileFlowView.fogOpacity * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {/* 3D Viewer with TileFlow overlays */}
              <AirflowViewer3D
                ref={tileFlowViewerRef}
                result={result}
                racks={racks}
                hvacUnits={hvacUnits}
                roomBoundaries={viewerRoomBoundaries}
                showHotspots={showHotspots}
                showAirflow={false}
                selectedSliceZ={selectedSliceZ}
                viewMode={activeView}
                onInspect={setInspectedCell}
                tileFlowView={tileFlowView}
                tileAirflowData={tileAirflowData}
                alerts={alerts}
              />

              {/* TileFlow Dashboard */}
              <TileFlowDashboard
                result={result}
                alerts={alerts}
                tileAirflowData={tileAirflowData}
                onSnapshotCapture={() => tileFlowViewerRef.current?.captureSnapshot() ?? null}
              />
            </div>
          ) : (
            <div className="panel-glass flex h-64 flex-col items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm">
              <Layers size={48} className="mb-4 text-muted-foreground/45" />
              <p className="text-lg font-bold text-foreground">No simulation results yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Run a CFD simulation to view TileFlow analysis</p>
            </div>
          )}
        </TabPanel>
        <TabPanel tabId="failure" activeTab={activeTab}>
          <FailurePanel />
        </TabPanel>
        <TabPanel tabId="calibration" activeTab={activeTab}>
          <CalibrationPanel />
        </TabPanel>
      </Tabs>
    </PageWrapper>
  );
}
