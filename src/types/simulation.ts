// ─── CFD Simulation Types ───────────────────────────────────────────

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';
export type SimulationMode = 'fast' | 'balanced' | 'engineering';
export type SimulationRuntimeMode = 'worker' | 'server' | 'openfoam';
export type SimulationDimensionMode = '3d' | '2d-fast';
export type TileType = 'open' | 'perforated' | 'solid' | 'inlet' | 'outlet';
export type BoundaryType = 'wall' | 'inlet' | 'outlet' | 'symmetry' | 'open';
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
  humidity: number;       // kg water / kg dry air (humidity ratio)
  velocity: Vec3;        // m/s
  pressure: number;      // Pa (gauge)
  heatSource: number;    // W
  moistureSource: number; // kg/s moisture generation
  isObstacle: boolean;
  tileType: TileType;
  boundaryType: BoundaryType;
  // Turbulence fields (k-ε model)
  k: number;             // turbulent kinetic energy m²/s²
  epsilon: number;        // turbulent dissipation rate m²/s³
  nutTurb: number;        // turbulent (eddy) viscosity m²/s
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
  mode: SimulationMode;
  runtimeMode?: SimulationRuntimeMode;
  dimensionMode?: SimulationDimensionMode;
  gridResolution: number;  // m per cell
  gridSizeX: number;
  gridSizeY: number;
  gridSizeZ: number;
  iterations: number;
  progressEmitInterval?: number;
  convergence: number;
  timeStep: number;
  ambientTempC: number;
  ambientHumidityRatio: number; // kg/kg (default ~0.0093 for 50% RH at 24°C)
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
  calibration?: {
    coefficients?: CalibrationCoefficients;
    sensorReadings?: SensorReading[];
  };
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

export interface RoomSimulationMetric {
  roomId: string;
  floorId: string;
  floorNumber: number;
  avgTemperature: number;
  meanVelocity: number;
  stagnationRatio: number;
  pressure: number;
  inflowM3s: number;
  outflowM3s: number;
}

export interface SimulationMetrics {
  maxTemperature: number;
  minTemperature: number;
  avgTemperature: number;
  maxHumidityRatio: number;
  minHumidityRatio: number;
  avgHumidityRatio: number;
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
  // Convergence residuals
  continuityResidual: number;
  momentumResidual: number;
  energyResidual: number;
  turbulenceResidual: number;
  maxDivergence: number;        // max |∇·u|
  converged: boolean;
  // Turbulence statistics
  avgTurbulentViscosity: number; // average ν_t
  maxTurbulentIntensity: number;
  deadZoneCount?: number;
  deadZoneRatio?: number;
  airflowDistributionScore?: number;
  uniformityIndex?: number;
  pmvApprox?: number;
  ppdApprox?: number;
  airflowBalanceM3s?: number;
  pressureImbalancePa?: number;
  ventilationEffectiveness?: number;
  roomMetrics?: RoomSimulationMetric[];
}

export interface SimulationResult {
  id: string;
  projectId: string;
  status: SimulationStatus;
  config: SimulationConfig;
  metrics: SimulationMetrics;
  temperatureField: number[][][]; // [x][y][z] temperatures
  humidityField: number[][][];    // [x][y][z] humidity ratios
  velocityField: Vec3[][][];      // [x][y][z] velocity vectors
  pressureField: number[][][];
  iteration: number;
  convergenceHistory: number[];
  cflHistory: number[];           // CFL number per iteration
  effectiveTimeStep: number;      // actual dt used (may be reduced by CFL)
  completedAt?: string;
}

export interface SimulationRunProgress {
  simulationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  iteration: number;
  totalIterations: number;
  percent: number;
  continuityResidual?: number;
  momentumResidual?: number;
  energyResidual?: number;
  turbulenceResidual?: number;
  elapsedMs?: number;
  message?: string;
}

export type CFDWorkerIncomingMessage =
  | {
      type: 'start';
      payload: {
        simulationId: string;
        input: SimulationInput;
      };
    }
  | {
      type: 'cancel';
      simulationId: string;
    };

export type CFDWorkerOutgoingMessage =
  | {
      type: 'progress';
      simulationId: string;
      progress: SimulationRunProgress;
    }
  | {
      type: 'completed';
      simulationId: string;
      result: SimulationResult;
    }
  | {
      type: 'cancelled';
      simulationId: string;
    }
  | {
      type: 'error';
      simulationId: string;
      error: string;
    };

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

export interface OptimizationIteration {
  iteration: number;
  score: number;
  maxTemperature: number;
  hotspotCount: number;
  pue: number;
  accepted: boolean;
  suggestionType?: OptimizationSuggestion['type'];
  suggestionDescription: string;
}

export interface OptimizationResult {
  initialMetrics: SimulationMetrics;
  optimizedMetrics: SimulationMetrics;
  suggestions: OptimizationSuggestion[];
  improvement: number;   // percentage
  iterations: number;
  initialScore?: number;
  optimizedScore?: number;
  bestIteration?: number;
  optimizationHistory?: OptimizationIteration[];
}

// ─── Simulation Engine: Geometry & Mesh ─────────────────────────────

/** Wall segment in the room boundary */
export interface WallSegment {
  /** Start point (x, y) in meters from room origin */
  start: { x: number; y: number };
  /** End point (x, y) in meters from room origin */
  end: { x: number; y: number };
  /** Wall height in meters */
  height: number;
  /** Thermal boundary condition */
  thermalBC: 'adiabatic' | 'fixed_temp' | 'heat_flux';
  /** Fixed temperature in °C (used when thermalBC is 'fixed_temp') */
  fixedTempC?: number;
  /** Heat flux in W/m² (used when thermalBC is 'heat_flux') */
  heatFluxWm2?: number;
}

/** Obstruction inside the room (furniture, columns, etc.) */
export interface RoomObstruction {
  id: string;
  label: string;
  position: Vec3;
  width: number;
  depth: number;
  height: number;
  /** Heat output in watts (0 for passive obstructions) */
  heatOutputW: number;
}

/** Complete geometry input for the simulation engine */
export interface GeometryInput {
  /** Unique room identifier */
  roomId: string;
  /** Room length along X in meters */
  lengthM: number;
  /** Room width along Y in meters */
  widthM: number;
  /** Room (ceiling) height along Z in meters */
  heightM: number;
  /** Raised floor height in meters (0 if none) */
  raisedFloorHeightM: number;
  /** Ceiling plenum height in meters (0 if none) */
  ceilingPlenumHeightM: number;
  /** Wall segments defining the room perimeter */
  walls: WallSegment[];
  /** HVAC supply/return units placed in the room */
  hvacUnits: HVACUnit[];
  /** Server racks / heat-generating equipment */
  racks: ServerRack[];
  /** Perforated floor tiles */
  tiles: PerforatedTile[];
  /** Additional obstructions */
  obstructions: RoomObstruction[];
}

// ─── Simulation Engine: Structured Grid ─────────────────────────────

export type CellZoneType =
  | 'fluid'
  | 'solid_wall'
  | 'solid_rack'
  | 'solid_hvac'
  | 'solid_obstruction'
  | 'raised_floor'
  | 'ceiling_plenum';

export type BoundaryPatchType =
  | 'wall'
  | 'inlet'
  | 'outlet'
  | 'symmetry'
  | 'fixedTemperature'
  | 'heatFlux';

/** Boundary patch on the structured grid */
export interface BoundaryPatch {
  id: string;
  name: string;
  type: BoundaryPatchType;
  /** Cell face indices belonging to this patch */
  faces: { i: number; j: number; k: number; face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z' }[];
  /** Parameters for the boundary condition */
  params: {
    velocity?: Vec3;           // m/s (for inlet)
    temperature?: number;      // °C (for fixedTemperature / inlet)
    heatFlux?: number;         // W/m² (for heatFlux)
    openAreaFraction?: number; // (for perforated tile inlets)
  };
}

/** Descriptor for a hexahedral structured grid */
export interface StructuredGrid {
  /** Number of cells along X */
  nx: number;
  /** Number of cells along Y */
  ny: number;
  /** Number of cells along Z */
  nz: number;
  /** Cell size in meters (uniform) */
  cellSizeM: number;
  /** Physical extents in meters */
  extents: { x: number; y: number; z: number };
  /** 3D zone type array [i][j][k] */
  zones: CellZoneType[][][];
  /** Named boundary patches */
  patches: BoundaryPatch[];
  /** Total number of fluid cells */
  fluidCellCount: number;
  /** Total number of solid cells */
  solidCellCount: number;
}

// ─── Simulation Engine: Physics & Solver ────────────────────────────

export type TurbulenceModel = 'laminar' | 'k-epsilon' | 'k-omega-sst' | 'realizable-k-epsilon';
export type RadiationModel = 'none' | 'p1' | 'discrete-ordinates';
export type SolverAlgorithm = 'SIMPLE' | 'SIMPLEC' | 'PISO';

/** Physics configuration for a simulation case */
export interface PhysicsSetup {
  /** Flow type */
  flowType: 'incompressible';
  /** Include buoyancy (Boussinesq approximation) */
  buoyancy: boolean;
  /** Turbulence model selection */
  turbulenceModel: TurbulenceModel;
  /** Radiation model selection */
  radiationModel: RadiationModel;
  /** Include humidity transport */
  humidityTransport: boolean;
  /** Reference temperature for Boussinesq in °C */
  referenceTemperatureC: number;
  /** Reference pressure in Pa */
  referencePressurePa: number;
  /** Gravitational acceleration m/s² */
  gravity: Vec3;
  /** Fluid properties */
  fluid: {
    density: number;           // kg/m³
    viscosity: number;         // Pa·s
    specificHeat: number;      // J/(kg·K)
    thermalConductivity: number; // W/(m·K)
    thermalExpansionCoeff: number; // 1/K (for Boussinesq)
    prandtlNumber: number;
  };
}

/** Solver profile controlling convergence and numerics */
export interface SolverProfile {
  algorithm: SolverAlgorithm;
  maxIterations: number;
  /** Convergence residual target */
  convergenceTarget: number;
  /** Under-relaxation factors */
  relaxation: {
    pressure: number;
    velocity: number;
    temperature: number;
    turbulence: number;
  };
  /** Time stepping (0 for steady-state) */
  timeStepS: number;
  /** Maximum CFL number allowed */
  maxCFL: number;
  /** Enable CFL-adaptive time stepping */
  adaptiveTimeStep: boolean;
}

// ─── Simulation Engine: Case Lifecycle ──────────────────────────────

export type CaseStatus =
  | 'draft'
  | 'meshed'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'imported';

export type RunSource = 'internal' | 'openfoam' | 'simflow' | 'manual-import';

/** Top-level simulation case metadata */
export interface SimulationCase {
  id: string;
  projectId: string;
  ownerId: string;
  /** User-visible case name */
  name: string;
  description: string;
  status: CaseStatus;
  /** Which solver produced the result */
  runSource: RunSource;
  /**
   * Scope of the simulation.
   * - 'room'     — single-room CFD (default)
   * - 'building' — multi-room building-level simulation derived from project floors
   */
  simulationScope?: 'room' | 'building';
  /** Geometry snapshot at case creation */
  geometry: GeometryInput;
  /**
   * Building geometry snapshot (present when simulationScope === 'building').
   * Derived from project floors/rooms at creation and re-derived on rebuild.
   */
  buildingGeometry?: BuildingGeometryInput;
  /** Generated mesh descriptor (populated after meshing) */
  mesh?: StructuredGrid;
  /** Physics configuration */
  physics: PhysicsSetup;
  /** Solver profile */
  solver: SolverProfile;
  /** Active run job (null if not running) */
  activeRunId?: string;
  /** ID of the result set (populated after completion/import) */
  resultId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Simulation Engine: Run Job ─────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Residual snapshot at a given iteration */
export interface ResidualSnapshot {
  iteration: number;
  continuity: number;
  momentumX: number;
  momentumY: number;
  momentumZ: number;
  energy: number;
  k?: number;
  epsilon?: number;
}

/** A single execution run of a simulation case */
export interface RunJob {
  id: string;
  caseId: string;
  projectId: string;
  ownerId: string;
  status: JobStatus;
  source: RunSource;
  /** Current iteration (for polling progress) */
  currentIteration: number;
  /** Total iterations configured */
  totalIterations: number;
  /** Residual convergence history */
  residuals: ResidualSnapshot[];
  /** Wall-clock elapsed time in seconds */
  elapsedSeconds: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Optional building-level visualization payload */
  buildingVisualization?: BuildingVisualizationPayload;
  /** Optional metrics snapshot captured with this run */
  metricsSnapshot?: SimulationMetrics;
  /** Log output (tail) */
  logTail: string[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ─── Simulation Engine: Results & Fields ────────────────────────────

export type FieldName = 'temperature' | 'velocity' | 'pressure' | 'humidity' | 'turbulentViscosity';

export interface FieldEnvelope {
  schemaVersion: number;
  coordinateSystem: 'right-handed-z-up';
  sampleLocation: 'cell-centered';
  interpolation: 'trilinear';
  units: {
    length: 'm';
    velocity: 'm/s';
    temperature: 'C';
    pressure: 'Pa';
    humidityRatio: 'kg/kg';
  };
  renderAxisMap: {
    renderX: 'x';
    renderY: 'z';
    renderZ: 'y';
  };
}

export const DEFAULT_FIELD_ENVELOPE: FieldEnvelope = {
  schemaVersion: 1,
  coordinateSystem: 'right-handed-z-up',
  sampleLocation: 'cell-centered',
  interpolation: 'trilinear',
  units: {
    length: 'm',
    velocity: 'm/s',
    temperature: 'C',
    pressure: 'Pa',
    humidityRatio: 'kg/kg',
  },
  renderAxisMap: {
    renderX: 'x',
    renderY: 'z',
    renderZ: 'y',
  },
};

/** Describes how a single field payload is stored/loaded */
export interface FieldDescriptor {
  name: FieldName;
  /** Dimensions of the data array */
  dimensions: { nx: number; ny: number; nz: number };
  /** Data type per cell */
  dataType: 'scalar' | 'vector3';
  /** Min/max range for visualization scaling */
  range: { min: number; max: number };
  /** Byte size of the compressed payload */
  compressedSizeBytes: number;
}

/** Manifest listing all available result fields for a case */
export interface ArtifactManifest {
  caseId: string;
  runJobId: string;
  source: RunSource;
  fieldEnvelope: FieldEnvelope;
  /** Available fields */
  fields: FieldDescriptor[];
  /** Simulation metrics summary */
  metrics: SimulationMetrics;
  /** Convergence history */
  convergenceHistory: number[];
  /** Total compressed size in bytes */
  totalSizeBytes: number;
  createdAt: string;
}

/** A loaded result field payload (scalar or vector) */
export interface FieldPayload {
  name: FieldName;
  /** Scalar field [i][j][k] — present when dataType is 'scalar' */
  scalarData?: number[][][];
  /** Vector field [i][j][k] — present when dataType is 'vector3' */
  vectorData?: Vec3[][][];
}

/** Complete loaded result set for visualization */
export interface CaseResult {
  caseId: string;
  manifest: ArtifactManifest;
  /** Loaded field payloads (populated on demand) */
  loadedFields: FieldPayload[];
}

/** Metadata for one persisted run snapshot at a specific iteration. */
export interface RunFieldSnapshotMeta {
  caseId: string;
  runJobId: string;
  iteration: number;
  source: RunSource;
  fieldEnvelope: FieldEnvelope;
  dimensions: { nx: number; ny: number; nz: number };
  sampleStride: number;
  cellCount: number;
  availableFields: FieldName[];
  createdAt: string;
}

/** Snapshot payload for one iteration, including all requested fields. */
export interface RunFieldSnapshot {
  meta: RunFieldSnapshotMeta;
  fields: FieldPayload[];
}

// ─── Simulation Engine: OpenFOAM/SimFlow Export ─────────────────────

export type OpenFOAMBCType =
  | 'fixedValue'
  | 'zeroGradient'
  | 'inletOutlet'
  | 'fixedFluxPressure'
  | 'kqRWallFunction'
  | 'epsilonWallFunction'
  | 'nutkWallFunction';

/** OpenFOAM boundary condition for a patch */
export interface OpenFOAMPatchBC {
  patchName: string;
  field: string;
  type: OpenFOAMBCType;
  value?: number | Vec3;
}

/** Full OpenFOAM case configuration for export */
export interface OpenFOAMCaseConfig {
  caseName: string;
  /** Mesh export format */
  meshFormat: 'blockMesh' | 'snappyHexMesh';
  /** blockMeshDict parameters */
  blockMesh?: {
    vertices: Vec3[];
    blocks: { cells: [number, number, number]; grading: [number, number, number] }[];
  };
  /** Solver selection (e.g., buoyantSimpleFoam) */
  solver: string;
  /** turbulenceProperties dict content */
  turbulenceProperties: {
    simulationType: 'laminar' | 'RAS';
    RASModel?: string;
  };
  /** fvSchemes content */
  schemes: {
    ddtSchemes: Record<string, string>;
    gradSchemes: Record<string, string>;
    divSchemes: Record<string, string>;
    laplacianSchemes: Record<string, string>;
  };
  /** fvSolution content */
  solution: {
    solvers: Record<string, { solver: string; preconditioner?: string; tolerance: number; relTol: number }>;
    algorithms: Record<string, { nCorrectors?: number; nNonOrthogonalCorrectors?: number; pRefCell?: number; pRefValue?: number }>;
    relaxationFactors: Record<string, number>;
  };
  /** Boundary conditions per patch per field */
  boundaryConditions: OpenFOAMPatchBC[];
  /** controlDict parameters */
  controlDict: {
    application: string;
    startFrom: string;
    startTime: number;
    stopAt: string;
    endTime: number;
    deltaT: number;
    writeControl: string;
    writeInterval: number;
    purgeWrite: number;
    writeFormat: string;
    writePrecision: number;
  };
}

// ─── Simulation Engine: Contour/Slice Visualization ─────────────────

export type SliceOrientation = 'xy' | 'xz' | 'yz';

/** Configuration for a contour slice plane */
export interface ContourSliceConfig {
  id: string;
  /** Which field to visualize */
  field: FieldName;
  /** Slice plane orientation */
  orientation: SliceOrientation;
  /** Position along the normal axis in meters */
  position: number;
  /** Number of contour levels */
  levels: number;
  /** Color map name */
  colorMap: 'jet' | 'viridis' | 'coolwarm' | 'inferno' | 'plasma';
  /** Opacity 0-1 */
  opacity: number;
  /** Show contour lines */
  showLines: boolean;
}

// ─── Simulation Engine: Default Configs ─────────────────────────────

export const DEFAULT_PHYSICS_SETUP: PhysicsSetup = {
  flowType: 'incompressible',
  buoyancy: true,
  turbulenceModel: 'k-epsilon',
  radiationModel: 'none',
  humidityTransport: true,
  referenceTemperatureC: 24,
  referencePressurePa: 101325,
  gravity: { x: 0, y: 0, z: -9.81 },
  fluid: {
    density: 1.2,
    viscosity: 1.8e-5,
    specificHeat: 1005,
    thermalConductivity: 0.026,
    thermalExpansionCoeff: 3.43e-3,
    prandtlNumber: 0.71,
  },
};

export const DEFAULT_SOLVER_PROFILE: SolverProfile = {
  algorithm: 'SIMPLE',
  maxIterations: 500,
  convergenceTarget: 1e-4,
  relaxation: {
    pressure: 0.3,
    velocity: 0.7,
    temperature: 0.8,
    turbulence: 0.5,
  },
  timeStepS: 0,
  maxCFL: 1.0,
  adaptiveTimeStep: true,
};

// ─── Simulation Layout (Floorplan ↔ Simulation) ─────────────────────

/** An HVAC unit placed on the floorplan canvas (meters) */
export interface LayoutHVACPlacement {
  id: string;
  type: HVACUnitType;
  label: string;
  /** Position in meters (x, y on floor; z typically 0) */
  position: Vec3;
  /** Orientation in degrees */
  orientation: number;
  /** Nominal cooling capacity kW */
  capacityKW: number;
  /** Supply airflow CFM */
  airflowCFM: number;
}

/** An airflow tile placed on the floorplan canvas (meters) */
export interface LayoutTilePlacement {
  id: string;
  /** Position in meters (x, y on floor) */
  x: number;
  y: number;
  /** Open area fraction 0-1 */
  openArea: number;
  /** Tile edge length in meters (default 0.6) */
  tileSize: number;
}

/** Full simulation layout document for a project + floor */
export interface SimulationLayoutDoc {
  projectId: string;
  floorId: string;
  hvacPlacements: LayoutHVACPlacement[];
  tilePlacements: LayoutTilePlacement[];
  connectionOverrides?: LayoutConnectionOverride[];
  /** Metres-per-pixel scale used when placing entities */
  canvasScale: number;
  updatedAt: string;
}

export type AirConnectionType = 'door' | 'shaft' | 'transfer' | 'window' | 'custom';

export interface LayoutConnectionOverride {
  id?: string;
  fromRoomId: string;
  toRoomId: string;
  type: AirConnectionType | string;
  openingAreaM2: number;
  resistance: number;
  enabled?: boolean;
}

export interface AirConnection {
  id?: string;
  fromRoom: string;
  toRoom: string;
  type: AirConnectionType | string;
  openingAreaM2: number;
  resistance: number;
  flowRateM3s?: number;
}

export interface AirVent {
  id?: string;
  type: 'supply' | 'return' | 'exhaust' | 'transfer';
  flowRateM3s: number;
  temperatureC?: number;
}

export interface BuildingRoom {
  id: string;
  floorId: string;
  floorNumber: number;
  name: string;
  origin: Vec3;
  dimensions: {
    width: number;
    length: number;
    height: number;
  };
  vents: AirVent[];
  heatLoadW: number;
}

export interface BuildingGeometryInput {
  buildingId: string;
  rooms: BuildingRoom[];
  connections: AirConnection[];
}

export interface BuildingCell {
  u: number;
  v: number;
  temp: number;
  pressure: number;
}

export interface BuildingRoomState {
  roomId: string;
  grid: BuildingCell[][];
  avgTemperature: number;
  meanVelocity: number;
  pressure: number;
  inflowM3s: number;
  outflowM3s: number;
}

export interface BuildingSimulationResult {
  id: string;
  projectId: string;
  iteration: number;
  converged: boolean;
  metrics: SimulationMetrics;
  roomStates: BuildingRoomState[];
  connectionFlows: AirConnection[];
  convergenceHistory: number[];
}

export interface BuildingVisualizationPayload {
  rooms: Array<{
    roomId: string;
    avgTemperature: number;
    avgVelocity: number;
    samples: Array<{
      position: Vec3;
      temperature: number;
      velocity: { u: number; v: number };
      velocityMagnitude: number;
    }>;
  }>;
  connections: Array<{
    id: string;
    flowRateM3s: number;
    fromPoint: Vec3;
    toPoint: Vec3;
  }>;
  temperatureRange: { min: number; max: number };
  velocityRange: { min: number; max: number };
}

/** Inspect-overlay data shown when clicking a 3D cell */
export interface InspectedCellInfo {
  position: Vec3;
  temperature: number;
  velocity: Vec3;
  pressure: number;
  humidity: number;
}

// ─── TileFlow Result Visualization ──────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export interface ThermalAlert {
  id: string;
  type: 'overheating' | 'insufficient_airflow' | 'recirculation' | 'bypass';
  severity: AlertSeverity;
  position: Vec3;
  value: number;
  threshold: number;
  unit: string;
  description: string;
  affectedRacks: string[];
}

export interface TileAirflowData {
  tileId: string;
  x: number;
  y: number;
  /** Actual airflow rate CFM */
  actualCFM: number;
  /** Required airflow rate CFM */
  requiredCFM: number;
  /** Efficiency ratio (actual / required) */
  efficiency: number;
  /** Supply air temperature at tile °C */
  supplyTempC: number;
  /** Bypass fraction — share of cool air not reaching racks */
  bypassFraction: number;
}

export interface StreamlineConfig {
  seedCount: number;
  maxSteps: number;
  stepSize: number;
  colorBy: 'temperature' | 'velocity';
  tubeRadius: number;
}

export interface TileFlowViewConfig {
  showStreamlines: boolean;
  showFog: boolean;
  showTileOverlay: boolean;
  showAlerts: boolean;
  streamlineConfig: StreamlineConfig;
  fogOpacity: number;
  alertThresholds: {
    maxTempC: number;
    minCFM: number;
  };
}

// --- Calibration Types ---

export interface SensorReading {
  id: string;
  position: Vec3;
  type: 'temperature' | 'velocity' | 'humidity';
  measuredValue: number;
  unit: string;
  timestamp: string;
}

export interface CalibrationCoefficients {
  tileDischargeCoeff: number;      // multiplier for tile_correction_factor (default 1.0)
  thermalLossFactor: number;       // multiplier for rack heat sources (default 1.0)
  wallConductivity: number;        // W/(m²·K) wall heat leak coefficient (default 0 = adiabatic)
  plenumMixingFactor: number;      // multiplier for plenum_temp_offset (default 1.0)
  turbulenceIntensityFactor: number; // multiplier for inlet turbulence intensity (default 1.0)
}

export const DEFAULT_CALIBRATION_COEFFICIENTS: CalibrationCoefficients = {
  tileDischargeCoeff: 1.0,
  thermalLossFactor: 1.0,
  wallConductivity: 0,
  plenumMixingFactor: 1.0,
  turbulenceIntensityFactor: 1.0,
};

export interface CalibrationPoint {
  location: Vec3;
  fieldType: 'temperature' | 'velocity' | 'humidity';
  simulatedValue: number;
  referenceValue: number; // measured or estimated
  deviationPct: number;
  deviationAbs: number;
}

export interface CalibrationResult {
  id: string;
  points: CalibrationPoint[];
  overallDeviationPct: { temperature: number; velocity: number; humidity: number };
  adjustedCoefficients: CalibrationCoefficients;
  convergenceHistory: number[];
  iterations: number;
  sensorReadings: SensorReading[];
  timestamp: string;
}

export type CalibrationMode = 'compare' | 'auto-adjust' | 'sensor';

export interface CalibrationConfig {
  mode: CalibrationMode;
  maxIterations: number;
  targetDeviationPct: number;
  dampingFactor: number;
}
