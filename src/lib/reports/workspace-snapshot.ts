import type { AirflowInputs, AirflowOverrideState } from '@/lib/engine/hvac/airflow-duct-engine';
import type {
  BudgetBand,
  EquipmentSelectionInputs,
  EquipmentSelectionOverrides,
  OptimizationPriority,
} from '@/lib/engine/hvac/equipment-selection-engine';
import type { LoadCalculationInputs, ManualOverrides, SpaceType } from '@/lib/engine/hvac/load-calculation-engine';
import { safeJsonParse } from '@/lib/utils/safe-json';
import type { PersistedAirflowWorkspaceState } from '@/stores/airflow-workspace-store';
import type { PersistedEquipmentWorkspaceState } from '@/stores/equipment-workspace-store';
import type { PersistedLoadWorkspaceState } from '@/stores/load-workspace-store';

const SNAPSHOT_VERSION = 1 as const;

const SPACE_TYPES: readonly SpaceType[] = [
  'office',
  'retail',
  'residential',
  'server_room',
  'conference_room',
  'restaurant',
];

const BUDGET_BANDS: readonly BudgetBand[] = ['economy', 'balanced', 'premium'];
const OPTIMIZATION_PRIORITIES: readonly OptimizationPriority[] = ['capex', 'efficiency', 'balanced'];

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isString = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const isNullableFiniteNumber = (value: unknown): value is number | null => {
  return value === null || isFiniteNumber(value);
};

const isSpaceType = (value: unknown): value is SpaceType => {
  return isString(value) && (SPACE_TYPES as readonly string[]).includes(value);
};

const isBudgetBand = (value: unknown): value is BudgetBand => {
  return isString(value) && (BUDGET_BANDS as readonly string[]).includes(value);
};

const isOptimizationPriority = (value: unknown): value is OptimizationPriority => {
  return isString(value) && (OPTIMIZATION_PRIORITIES as readonly string[]).includes(value);
};

const isLoadInputs = (value: unknown): value is LoadCalculationInputs => {
  if (!isRecord(value)) return false;

  return isString(value.projectName)
    && isSpaceType(value.spaceType)
    && isFiniteNumber(value.areaM2)
    && isFiniteNumber(value.ceilingHeightM)
    && isFiniteNumber(value.occupants)
    && isFiniteNumber(value.outdoorTempC)
    && isFiniteNumber(value.indoorTempC)
    && isFiniteNumber(value.lightingWPerM2)
    && isFiniteNumber(value.equipmentLoadW)
    && isFiniteNumber(value.ventilationCfmPerPerson)
    && isFiniteNumber(value.safetyFactor)
    && isFiniteNumber(value.diversityFactor)
    && isFiniteNumber(value.supplyDeltaTF);
};

const isManualOverrides = (value: unknown): value is ManualOverrides => {
  if (!isRecord(value)) return false;

  return isBoolean(value.useManualTotalBtu)
    && isNullableFiniteNumber(value.manualTotalBtu)
    && isBoolean(value.useManualCfm)
    && isNullableFiniteNumber(value.manualCfm);
};

const isAirflowInputs = (value: unknown): value is AirflowInputs => {
  if (!isRecord(value)) return false;

  return isFiniteNumber(value.supplyCfm)
    && isFiniteNumber(value.branches)
    && isFiniteNumber(value.trunkLengthFt)
    && isFiniteNumber(value.longestBranchLengthFt)
    && isFiniteNumber(value.frictionRateInWgPer100Ft)
    && isFiniteNumber(value.targetVelocityFpm)
    && isFiniteNumber(value.fanEfficiency)
    && isFiniteNumber(value.fittingLossFactor);
};

const isAirflowOverrides = (value: unknown): value is AirflowOverrideState => {
  if (!isRecord(value)) return false;

  return isBoolean(value.useManualStaticPressure)
    && isNullableFiniteNumber(value.manualStaticPressureInWg);
};

const isEquipmentInputs = (value: unknown): value is EquipmentSelectionInputs => {
  if (!isRecord(value)) return false;

  return isFiniteNumber(value.requiredTr)
    && isBudgetBand(value.budgetBand)
    && isOptimizationPriority(value.optimizationPriority)
    && isBoolean(value.redundancyNPlusOne)
    && isFiniteNumber(value.electricityRatePhpKwh)
    && isFiniteNumber(value.operatingHoursPerYear)
    && isFiniteNumber(value.maxUnits);
};

const isEquipmentOverrides = (value: unknown): value is EquipmentSelectionOverrides => {
  if (!isRecord(value)) return false;

  return value.lockOptionId === null || isString(value.lockOptionId);
};

const isPersistedLoadState = (value: unknown): value is PersistedLoadWorkspaceState => {
  if (!isRecord(value)) return false;
  return isLoadInputs(value.inputs) && isManualOverrides(value.overrides);
};

const isPersistedAirflowState = (value: unknown): value is PersistedAirflowWorkspaceState => {
  if (!isRecord(value)) return false;
  return isAirflowInputs(value.inputs) && isAirflowOverrides(value.overrides);
};

const isPersistedEquipmentState = (value: unknown): value is PersistedEquipmentWorkspaceState => {
  if (!isRecord(value)) return false;
  return isEquipmentInputs(value.inputs) && isEquipmentOverrides(value.overrides);
};

export interface WorkspaceSnapshotV1 {
  version: typeof SNAPSHOT_VERSION;
  exportedAt: string;
  source: 'reports';
  modules: {
    load: PersistedLoadWorkspaceState;
    airflow: PersistedAirflowWorkspaceState;
    equipment: PersistedEquipmentWorkspaceState;
  };
}

export function buildWorkspaceSnapshot(modules: WorkspaceSnapshotV1['modules']): WorkspaceSnapshotV1 {
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    source: 'reports',
    modules,
  };
}

export function isWorkspaceSnapshotV1(value: unknown): value is WorkspaceSnapshotV1 {
  if (!isRecord(value)) return false;
  if (value.version !== SNAPSHOT_VERSION) return false;
  if (!isString(value.exportedAt)) return false;
  if (value.source !== 'reports') return false;
  if (!isRecord(value.modules)) return false;

  return isPersistedLoadState(value.modules.load)
    && isPersistedAirflowState(value.modules.airflow)
    && isPersistedEquipmentState(value.modules.equipment);
}

export function parseWorkspaceSnapshot(rawValue: string): WorkspaceSnapshotV1 | null {
  const parsed = safeJsonParse<unknown>(rawValue);
  if (!isWorkspaceSnapshotV1(parsed)) {
    return null;
  }

  return parsed;
}
