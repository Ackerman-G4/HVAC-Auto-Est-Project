import type {
  FieldName,
  LayoutConnectionOverride,
  LayoutHVACPlacement,
  LayoutTilePlacement,
  SimulationCase,
  SimulationConfig,
} from '@/types/simulation';

export interface FloorRoomOption {
  id: string;
  name: string;
}

export interface FloorOption {
  id: string;
  floorNumber: number;
  name: string;
  rooms: FloorRoomOption[];
}

export interface LayoutSnapshot {
  hvacPlacements: LayoutHVACPlacement[];
  tilePlacements: LayoutTilePlacement[];
  canvasScale: number;
}

export const DEFAULT_LAYOUT_SNAPSHOT: LayoutSnapshot = {
  hvacPlacements: [],
  tilePlacements: [],
  canvasScale: 50,
};

const SLICE_FIELD_COLORS: Record<FieldName, string> = {
  temperature: '#ef4444',
  velocity: '#3b82f6',
  pressure: '#f59e0b',
  humidity: '#10b981',
  turbulentViscosity: '#8b5cf6',
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function fieldColor(field: FieldName): string {
  return SLICE_FIELD_COLORS[field] ?? '#94a3b8';
}

export function normalizeConnectionOverride(input: LayoutConnectionOverride): LayoutConnectionOverride {
  return {
    ...input,
    openingAreaM2: Math.max(0.1, Number(input.openingAreaM2) || 0.1),
    resistance: Math.max(0.01, Number(input.resistance) || 0.01),
    enabled: input.enabled !== false,
  };
}

function connectionPairKey(fromRoomId: string, toRoomId: string): string {
  return fromRoomId < toRoomId
    ? `${fromRoomId}::${toRoomId}`
    : `${toRoomId}::${fromRoomId}`;
}

export function sanitizeConnectionOverrides(overrides: LayoutConnectionOverride[]): LayoutConnectionOverride[] {
  const byPair = new Map<string, LayoutConnectionOverride>();

  for (const override of overrides) {
    if (!override.fromRoomId || !override.toRoomId) continue;
    if (override.fromRoomId === override.toRoomId) continue;
    const key = connectionPairKey(override.fromRoomId, override.toRoomId);
    byPair.set(key, normalizeConnectionOverride(override));
  }

  return [...byPair.values()];
}

export function toEngineeringReportConfig(simCase: SimulationCase): SimulationConfig {
  const mesh = simCase.mesh;
  const density = simCase.physics.fluid.density;
  const specificHeat = simCase.physics.fluid.specificHeat;
  const thermalDiffusivity = simCase.physics.fluid.thermalConductivity / Math.max(1e-6, density * specificHeat);

  return {
    mode: 'engineering',
    runtimeMode: 'server',
    dimensionMode: '3d',
    gridResolution: mesh?.cellSizeM ?? 0.2,
    gridSizeX: mesh?.nx ?? Math.max(1, Math.round(simCase.geometry.lengthM / 0.2)),
    gridSizeY: mesh?.ny ?? Math.max(1, Math.round(simCase.geometry.widthM / 0.2)),
    gridSizeZ: mesh?.nz ?? Math.max(1, Math.round(simCase.geometry.heightM / 0.2)),
    iterations: simCase.solver.maxIterations,
    convergence: simCase.solver.convergenceTarget,
    timeStep: simCase.solver.timeStepS || 0.1,
    ambientTempC: simCase.physics.referenceTemperatureC,
    ambientHumidityRatio: 0.0093,
    airDensity: density,
    airViscosity: simCase.physics.fluid.viscosity,
    thermalDiffusivity,
    specificHeat,
  };
}

export function formatMetric(value: number | undefined, digits = 3): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}