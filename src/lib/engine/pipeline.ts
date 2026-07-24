/**
 * HVAC Design Pipeline — end-to-end orchestration
 *
 * Chains: Load Calculation → Equipment Selection → Airflow/Duct Design → Pricing
 * Each stage feeds its outputs into the next stage's inputs.
 */

import {
  calculateLoadScenario,
  defaultLoadInputs,
  defaultOverrides,
  type LoadCalculationInputs,
  type ManualOverrides as LoadOverrides,
  type LoadCalculationResult,
} from '@/lib/engine/hvac/load-calculation-engine';

import {
  calculateEquipmentSelection,
  defaultEquipmentSelectionInputs,
  defaultEquipmentSelectionOverrides,
  type EquipmentSelectionInputs,
  type EquipmentSelectionOverrides,
  type EquipmentSelectionResult,
} from '@/lib/engine/hvac/equipment-selection-engine';

import {
  calculateAirflowScenario,
  defaultAirflowInputs,
  defaultAirflowOverrides,
  type AirflowInputs,
  type AirflowOverrideState,
  type AirflowResult,
} from '@/lib/engine/hvac/airflow-duct-engine';

import {
  calculateTotalProjectCost,
  type ProjectCostInput,
  type CostBreakdown,
} from '@/lib/engine/pricing-engine';

/* ─── Pipeline Types ─────────────────────────────────────────────── */

export interface PipelineInputs {
  /** Load calculation room parameters */
  load: LoadCalculationInputs;
  loadOverrides: LoadOverrides;

  /** Equipment selection parameters (partial — TR auto-filled from load) */
  equipment: Partial<EquipmentSelectionInputs>;
  equipmentOverrides: Partial<EquipmentSelectionOverrides>;

  /** Airflow parameters (partial — cfm auto-filled from load) */
  airflow: Partial<AirflowInputs>;
  airflowOverrides: Partial<AirflowOverrideState>;

  /** Pricing parameters (partial — costs auto-filled from equipment) */
  pricing: Partial<ProjectCostInput>;
}

export interface PipelineStageResult<T> {
  data: T;
  durationMs: number;
}

export interface PipelineResult {
  load: PipelineStageResult<LoadCalculationResult>;
  equipment: PipelineStageResult<EquipmentSelectionResult>;
  airflow: PipelineStageResult<AirflowResult>;
  pricing: PipelineStageResult<CostBreakdown>;
  totalDurationMs: number;
  timestamp: string;
}

/* ─── Default Pipeline Inputs ────────────────────────────────────── */

export const defaultPipelineInputs: PipelineInputs = {
  load: defaultLoadInputs,
  loadOverrides: defaultOverrides,
  equipment: {},
  equipmentOverrides: {},
  airflow: {},
  airflowOverrides: {},
  pricing: {},
};

/* ─── Pipeline Execution ─────────────────────────────────────────── */

function timed<T>(fn: () => T): PipelineStageResult<T> {
  const start = performance.now();
  const data = fn();
  return { data, durationMs: performance.now() - start };
}

/**
 * Run the full HVAC design pipeline.
 *
 * Data flows:
 * - Load → trValue feeds into Equipment's requiredTR
 * - Load → cfmSupply feeds into Airflow's totalCFM
 * - Equipment → result feeds into Pricing's equipment costs
 */
export function runPipeline(inputs: PipelineInputs): PipelineResult {
  const pipelineStart = performance.now();

  // ── Stage 1: Load Calculation ──────────────────────────────────
  const load = timed(() =>
    calculateLoadScenario(inputs.load, inputs.loadOverrides),
  );

  // ── Stage 2: Equipment Selection ───────────────────────────────
  // Feed load result into equipment inputs
  const equipInputs: EquipmentSelectionInputs = {
    ...defaultEquipmentSelectionInputs,
    ...inputs.equipment,
    requiredTr: inputs.equipment.requiredTr ?? load.data.breakdown.trRequired,
  };
  const equipOverrides: EquipmentSelectionOverrides = {
    ...defaultEquipmentSelectionOverrides,
    ...inputs.equipmentOverrides,
  };
  const equipment = timed(() =>
    calculateEquipmentSelection(equipInputs, equipOverrides),
  );

  // ── Stage 3: Airflow / Duct Design ────────────────────────────
  // Feed load result into airflow inputs
  const airflowInputs: AirflowInputs = {
    ...defaultAirflowInputs,
    ...inputs.airflow,
    supplyCfm: inputs.airflow.supplyCfm ?? load.data.breakdown.cfmRequired,
  };
  const airflowOvr: AirflowOverrideState = {
    ...defaultAirflowOverrides,
    ...inputs.airflowOverrides,
  };
  const airflow = timed(() =>
    calculateAirflowScenario(airflowInputs, airflowOvr),
  );

  // ── Stage 4: Pricing / Cost Breakdown ─────────────────────────
  // Feed equipment result into pricing
  const pricingInput: ProjectCostInput = {
    equipment: equipment.data.candidates?.map((item) => ({
      manufacturer: item.model.split(' ')[0] ?? 'Unknown',
      unitPricePHP: item.capexPhp / Math.max(item.quantity, 1),
      quantity: item.quantity,
      type: item.type,
    })) ?? [],
    materials: [],
    ...inputs.pricing,
  };
  const pricing = timed(() => calculateTotalProjectCost(pricingInput));

  return {
    load,
    equipment,
    airflow,
    pricing,
    totalDurationMs: performance.now() - pipelineStart,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run a single stage of the pipeline independently.
 * Useful for re-calculating only the changed stage.
 */
export function runLoadStage(
  inputs: LoadCalculationInputs,
  overrides: LoadOverrides,
): PipelineStageResult<LoadCalculationResult> {
  return timed(() => calculateLoadScenario(inputs, overrides));
}

export function runEquipmentStage(
  inputs: EquipmentSelectionInputs,
  overrides: EquipmentSelectionOverrides,
): PipelineStageResult<EquipmentSelectionResult> {
  return timed(() => calculateEquipmentSelection(inputs, overrides));
}

export function runAirflowStage(
  inputs: AirflowInputs,
  overrides: AirflowOverrideState,
): PipelineStageResult<AirflowResult> {
  return timed(() => calculateAirflowScenario(inputs, overrides));
}

export function runPricingStage(
  input: ProjectCostInput,
): PipelineStageResult<CostBreakdown> {
  return timed(() => calculateTotalProjectCost(input));
}
