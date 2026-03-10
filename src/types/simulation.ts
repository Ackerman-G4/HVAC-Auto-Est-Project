// ─── CFD Simulation Types ───────────────────────────────────────────

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TileType = 'open' | 'perforated' | 'solid' | 'inlet' | 'outlet';
export type RackDensity = 'low' | 'medium' | 'high' | 'ultra';
export type HVACUnitType = 'crac' | 'crah' | 'ahu' | 'in_row' | 'rear_door' | 'vent_duct';
export type FailureScenario = 'crac_failure' | 'power_loss' | 'cooling_restart' | 'partial_cooling';

/** Power density ranges in kW per rack */
export const RACK_POWER_DENSITY: Record<RackDensity, { min: number; max: number; typical: number }> = {
  low:    { min: 3,  max: 5,  typical: 4 },
  medium: { min: 5,  max: 10, typical: 7 },
  high:   { min: 10, max: 30, typical: 15 },
  ultra:  { min: 30, max: 60, typical: 40 },
};

/** Heat conversion constant: 1W = 3.412 BTU/hr */
export const WATTS_TO_BTU = 3.412;
export const BTU_PER_TON = 12000;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CFDCell {
  x: number;
  y: number;
  z: number;
  temperature: number;   // °C
  velocity: Vec3;        // m/s
  pressure: number;      // Pa
  heatSource: number;    // W
  isObstacle: boolean;
  tileType: TileType;
}

export interface CFDGrid {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  resolution: number;  // meters per cell
  cells: CFDCell[][][]; // [x][y][z]
}

export interface ServerRack {
  id: string;
  name: string;
  position: Vec3;       // meters
  width: number;
  depth: number;
  height: number;
  powerDensity: RackDensity;
  powerKW: number;
  airflowCFM: number;
  orientation: number;  // degrees
  rackUnits: number;
  filledUnits: number;
}

export interface HVACUnit {
  id: string;
  type: HVACUnitType;
  name: string;
  position: Vec3;
  width: number;
  depth: number;
  height: number;
  capacityKW: number;
  capacityTR: number;
  airflowCFM: number;
  supplyTempC: number;
  returnTempC: number;
  orientation: number;
  powerInputKW: number;
  status: 'active' | 'standby' | 'failed';
}

export interface PerforatedTile {
  x: number;           // grid position
  y: number;
  openArea: number;    // percentage (0-1)
  tileSize: number;    // meters (typically 0.6)
}

export interface SimulationConfig {
  gridResolution: number;  // m per cell
  gridSizeX: number;
  gridSizeY: number;
  gridSizeZ: number;
  iterations: number;
  convergence: number;
  timeStep: number;
  ambientTempC: number;
  // Physics parameters
  airDensity: number;      // kg/m³ (default ~1.2)
  airViscosity: number;    // Pa·s (default ~1.8e-5)
  thermalDiffusivity: number; // m²/s (default ~2.2e-5)
  specificHeat: number;    // J/(kg·K) (default ~1005)
}

export interface SimulationInput {
  projectId: string;
  floorId: string;
  config: SimulationConfig;
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  tiles: PerforatedTile[];
  raisedFloorHeight: number; // meters (typically 0.3-0.6)
}

export interface HotspotInfo {
  position: Vec3;
  temperature: number;
  severity: 'warning' | 'critical' | 'emergency';
  nearestRack: string;
}

export interface AirflowVector {
  position: Vec3;
  velocity: Vec3;
  temperature: number;
}

export interface SimulationMetrics {
  maxTemperature: number;
  minTemperature: number;
  avgTemperature: number;
  maxVelocity: number;
  avgVelocity: number;
  totalHeatLoad: number;      // W
  totalCoolingCapacity: number; // W
  coolingDeficit: number;       // W
  hotspots: HotspotInfo[];
  pue: number;
  supplyHeatIndex: number;      // SHI
  returnHeatIndex: number;      // RHI
  rackInletTemps: { rackId: string; avgTemp: number; maxTemp: number }[];
}

export interface SimulationResult {
  id: string;
  projectId: string;
  status: SimulationStatus;
  config: SimulationConfig;
  metrics: SimulationMetrics;
  temperatureField: number[][][]; // [x][y][z] temperatures
  velocityField: Vec3[][][];      // [x][y][z] velocity vectors
  pressureField: number[][][];
  iteration: number;
  convergenceHistory: number[];
  completedAt?: string;
}

// ─── ASHRAE Compliance ──────────────────────────────────────────────

export type ASHRAEThermalClass = 'A1' | 'A2' | 'A3' | 'A4' | 'B' | 'C';

export interface ASHRAELimits {
  class: ASHRAEThermalClass;
  inletTempMin: number;  // °C
  inletTempMax: number;  // °C
  inletTempRecommendedMin: number;
  inletTempRecommendedMax: number;
  maxDewPoint: number;   // °C
  humidityMin: number;   // %RH
  humidityMax: number;   // %RH
}

export interface ComplianceCheck {
  rule: string;
  description: string;
  passed: boolean;
  value: number;
  limit: number;
  unit: string;
  severity: 'info' | 'warning' | 'critical';
  recommendation?: string;
}

export interface ComplianceReport {
  thermalClass: ASHRAEThermalClass;
  overallPass: boolean;
  checks: ComplianceCheck[];
  score: number; // 0-100
}

// ─── Failure Simulation ─────────────────────────────────────────────

export interface FailureConfig {
  scenario: FailureScenario;
  failedUnitIds: string[];
  duration: number;        // seconds
  timeStep: number;        // seconds
  rackMass: number;        // kg (thermal mass)
  specificHeat: number;    // J/(kg·K)
}

export interface FailureTimeStep {
  time: number;            // seconds
  temperatures: { rackId: string; temp: number }[];
  maxTemp: number;
  criticalRacks: string[];
}

export interface FailureResult {
  scenario: FailureScenario;
  timeToWarning: number;   // seconds until first rack hits warning
  timeToCritical: number;  // seconds until first rack hits critical
  timeSteps: FailureTimeStep[];
  affectedRacks: string[];
  recommendations: string[];
}

// ─── Energy Efficiency ──────────────────────────────────────────────

export interface PUEAnalysis {
  totalFacilityPower: number; // kW
  itEquipmentPower: number;   // kW
  coolingPower: number;        // kW
  lightingPower: number;       // kW
  otherPower: number;          // kW
  pue: number;
  dcie: number;                // Data Center Infrastructure Efficiency (%)
  rating: 'excellent' | 'good' | 'average' | 'poor';
  recommendations: string[];
}

// ─── Optimization ───────────────────────────────────────────────────

export interface OptimizationTarget {
  type: 'minimize_hotspots' | 'minimize_pue' | 'balance_airflow';
  weight: number; // 0-1
}

export interface OptimizationConfig {
  targets: OptimizationTarget[];
  maxIterations: number;
  adjustableTiles: boolean;
  adjustableCRAC: boolean;
  adjustableRacks: boolean;
}

export interface OptimizationSuggestion {
  type: 'move_tile' | 'add_tile' | 'remove_tile' | 'move_crac' | 'adjust_airflow' | 'rearrange_racks';
  description: string;
  impact: number;        // estimated improvement percentage
  position?: Vec3;
  parameters?: Record<string, number>;
}

export interface OptimizationResult {
  initialMetrics: SimulationMetrics;
  optimizedMetrics: SimulationMetrics;
  suggestions: OptimizationSuggestion[];
  improvement: number;   // percentage
  iterations: number;
}
