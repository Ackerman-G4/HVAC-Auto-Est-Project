export type { 
  Project, 
  ProjectStatus, 
  OutputClassification, 
  BuildingType, 
  DesignConditions, 
  Floor, 
  Room, 
  SpaceType, 
  WallType, 
  GlassType, 
  Orientation,
  ProjectFormData 
} from './project';

export type { 
  CoolingLoadResult, 
  ZoneLoadResult, 
  FloorLoadResult, 
  CoolingLoadInput 
} from './calculation';

export type { 
  Equipment, 
  EquipmentType, 
  RefrigerantType, 
  PhaseType, 
  SelectedEquipment, 
  EquipmentRecommendation 
} from './equipment';

export type { 
  Material, 
  MaterialCategory, 
  Supplier, 
  BOQItem, 
  BOQSummary, 
  CostAlert 
} from './material';

export type {
  DiagnosticInput,
  DiagnosticResult,
  DiagnosticFault,
  DiagnosticSymptom,
  DiagnosticStep,
  CorrectiveAction,
  SystemType,
  ApplicationType,
  FaultDomain,
  Severity,
  CostLevel,
  RepairLevel,
  ConfidenceLevel,
} from './diagnostic';

export type {
  ApiSuccess,
  ApiError,
  ApiResponse,
  ProjectListItem,
  AppSettings,
  DiagnosticHistoryItem,
} from './api';

// Re-export simulation types
export type {
  SimulationStatus,
  TileType,
  RackDensity,
  HVACUnitType,
  FailureScenario,
  Vec3,
  CFDCell,
  CFDGrid,
  ServerRack as SimServerRack,
  HVACUnit as SimHVACUnit,
  PerforatedTile,
  SimulationConfig,
  SimulationInput,
  HotspotInfo,
  AirflowVector,
  SimulationMetrics,
  SimulationResult,
  ASHRAEThermalClass,
  ASHRAELimits,
  ComplianceCheck,
  ComplianceReport,
  FailureConfig,
  FailureTimeStep,
  FailureResult,
  PUEAnalysis,
  OptimizationTarget,
  OptimizationConfig,
  OptimizationSuggestion,
  OptimizationResult,
} from './simulation';

// Audit
export interface AuditEntry {
  id: string;
  projectId: string;
  action: string;
  entity: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: string;
  notes: string;
}

// Pipe routing
export interface PipeRoute {
  id: string;
  projectId: string;
  floorId: string;
  type: 'liquid' | 'gas' | 'drain';
  points: { x: number; y: number }[];
  length: number;
  diameter: string;
  insulation: string;
  refrigerantCharge: number;
}

// Duct segment
export interface DuctSegment {
  id: string;
  projectId: string;
  floorId: string;
  type: 'supply' | 'return' | 'exhaust' | 'fresh_air';
  points: { x: number; y: number }[];
  width: number;
  height: number;
  length: number;
  material: string;
  gaugeNumber: number;
  insulationType: string;
  insulationThickness: number;
  accessories: string[];
}

// Electrical load
export interface ElectricalLoad {
  id: string;
  projectId: string;
  equipmentId: string;
  equipmentName: string;
  powerKW: number;
  currentAmps: number;
  voltage: number;
  phase: string;
  cableSize: string;
  breakerRating: number;
  disconnectType: string;
}
