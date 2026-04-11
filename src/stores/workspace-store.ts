import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  runPipeline,
  runLoadStage,
  runEquipmentStage,
  runAirflowStage,
  runPricingStage,
  defaultPipelineInputs,
  type PipelineInputs,
  type PipelineResult,
} from '@/lib/engine/pipeline';

import type { LoadCalculationInputs, ManualOverrides as LoadOverrides } from '@/lib/engine/hvac/load-calculation-engine';
import type { EquipmentSelectionInputs, EquipmentSelectionOverrides } from '@/lib/engine/hvac/equipment-selection-engine';
import type { AirflowInputs, AirflowOverrideState } from '@/lib/engine/hvac/airflow-duct-engine';
import type { ProjectCostInput } from '@/lib/engine/pricing-engine';

/* ─── Types ──────────────────────────────────────────────────────── */

export type PipelineStage = 'load' | 'equipment' | 'airflow' | 'pricing';

interface WorkspaceState {
  /** All pipeline inputs */
  inputs: PipelineInputs;

  /** Latest pipeline result (null until first run) */
  result: PipelineResult | null;

  /** Which stage is currently being re-calculated */
  activeStage: PipelineStage | 'idle' | 'full';

  /** Dirty flags per stage — true when inputs changed since last run */
  dirty: Record<PipelineStage, boolean>;

  /** Auto-run: re-run whole pipeline when any input changes */
  autoRun: boolean;
}

interface WorkspaceActions {
  /** Update load inputs */
  setLoadInput: <K extends keyof LoadCalculationInputs>(key: K, value: LoadCalculationInputs[K]) => void;
  setLoadOverride: <K extends keyof LoadOverrides>(key: K, value: LoadOverrides[K]) => void;

  /** Update equipment inputs */
  setEquipmentInput: <K extends keyof EquipmentSelectionInputs>(key: K, value: EquipmentSelectionInputs[K]) => void;
  setEquipmentOverride: <K extends keyof EquipmentSelectionOverrides>(key: K, value: EquipmentSelectionOverrides[K]) => void;

  /** Update airflow inputs */
  setAirflowInput: <K extends keyof AirflowInputs>(key: K, value: AirflowInputs[K]) => void;
  setAirflowOverride: <K extends keyof AirflowOverrideState>(key: K, value: AirflowOverrideState[K]) => void;

  /** Update pricing inputs */
  setPricingInput: <K extends keyof ProjectCostInput>(key: K, value: ProjectCostInput[K]) => void;

  /** Run entire pipeline end-to-end */
  runAll: () => void;

  /** Re-run only a single stage (uses latest inputs, cascades to downstream) */
  runStage: (stage: PipelineStage) => void;

  /** Toggle auto-run */
  setAutoRun: (on: boolean) => void;

  /** Reset to defaults */
  reset: () => void;

  /** Restore from snapshot */
  applySnapshot: (inputs: Partial<PipelineInputs>) => void;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

/* ─── Initial State ──────────────────────────────────────────────── */

const initialDirty: Record<PipelineStage, boolean> = {
  load: true,
  equipment: true,
  airflow: true,
  pricing: true,
};

/* ─── Store ──────────────────────────────────────────────────────── */

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      inputs: defaultPipelineInputs,
      result: null,
      activeStage: 'idle',
      dirty: { ...initialDirty },
      autoRun: false,

      /* ── Load inputs ──────────────────────────────────────── */
      setLoadInput: (key, value) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            load: { ...s.inputs.load, [key]: value },
          },
          dirty: { ...s.dirty, load: true, equipment: true, airflow: true, pricing: true },
        }));
        if (get().autoRun) get().runAll();
      },

      setLoadOverride: (key, value) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            loadOverrides: { ...s.inputs.loadOverrides, [key]: value },
          },
          dirty: { ...s.dirty, load: true },
        }));
        if (get().autoRun) get().runAll();
      },

      /* ── Equipment inputs ─────────────────────────────────── */
      setEquipmentInput: (key, value) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            equipment: { ...s.inputs.equipment, [key]: value },
          },
          dirty: { ...s.dirty, equipment: true, pricing: true },
        }));
        if (get().autoRun) get().runAll();
      },

      setEquipmentOverride: (key, value) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            equipmentOverrides: { ...s.inputs.equipmentOverrides, [key]: value },
          },
          dirty: { ...s.dirty, equipment: true },
        }));
        if (get().autoRun) get().runAll();
      },

      /* ── Airflow inputs ───────────────────────────────────── */
      setAirflowInput: (key, value) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            airflow: { ...s.inputs.airflow, [key]: value },
          },
          dirty: { ...s.dirty, airflow: true },
        }));
        if (get().autoRun) get().runAll();
      },

      setAirflowOverride: (key, value) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            airflowOverrides: { ...s.inputs.airflowOverrides, [key]: value },
          },
          dirty: { ...s.dirty, airflow: true },
        }));
        if (get().autoRun) get().runAll();
      },

      /* ── Pricing inputs ───────────────────────────────────── */
      setPricingInput: (key, value) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            pricing: { ...s.inputs.pricing, [key]: value },
          },
          dirty: { ...s.dirty, pricing: true },
        }));
        if (get().autoRun) get().runAll();
      },

      /* ── Execution ────────────────────────────────────────── */
      runAll: () => {
        set({ activeStage: 'full' });
        const { inputs } = get();
        const result = runPipeline(inputs);
        set({
          result,
          activeStage: 'idle',
          dirty: { load: false, equipment: false, airflow: false, pricing: false },
        });
      },

      runStage: (stage) => {
        set({ activeStage: stage });
        const { inputs, result: prev } = get();

        if (stage === 'load') {
          const loadResult = runLoadStage(inputs.load, inputs.loadOverrides);
          set((s) => ({
            result: s.result
              ? { ...s.result, load: loadResult, totalDurationMs: loadResult.durationMs, timestamp: new Date().toISOString() }
              : null,
            activeStage: 'idle',
            dirty: { ...s.dirty, load: false },
          }));
        }
        // For simplicity, other single-stage reruns still use the full pipeline
        // to maintain correct data flow between stages
        else {
          const result = runPipeline(inputs);
          set({
            result,
            activeStage: 'idle',
            dirty: { load: false, equipment: false, airflow: false, pricing: false },
          });
        }
      },

      setAutoRun: (on) => set({ autoRun: on }),

      reset: () => set({
        inputs: defaultPipelineInputs,
        result: null,
        activeStage: 'idle',
        dirty: { ...initialDirty },
      }),

      applySnapshot: (partial) => {
        set((s) => ({
          inputs: {
            ...s.inputs,
            ...partial,
            load: { ...s.inputs.load, ...partial.load },
            loadOverrides: { ...s.inputs.loadOverrides, ...partial.loadOverrides },
          },
          dirty: { ...initialDirty },
        }));
      },
    }),
    {
      name: 'hvac-workspace-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        inputs: state.inputs,
        autoRun: state.autoRun,
      }),
    },
  ),
);
