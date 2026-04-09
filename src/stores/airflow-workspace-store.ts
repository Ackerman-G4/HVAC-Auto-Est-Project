import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  AirflowInputs,
  AirflowOverrideState,
  AirflowResult,
  calculateAirflowScenario,
  defaultAirflowInputs,
  defaultAirflowOverrides,
} from '@/lib/engine/hvac/airflow-duct-engine';

interface AirflowWorkspaceStore {
  inputs: AirflowInputs;
  overrides: AirflowOverrideState;
  result: AirflowResult;
  loading: boolean;
  getSnapshot: () => PersistedAirflowWorkspaceState;
  applySnapshot: (snapshot: Partial<PersistedAirflowWorkspaceState>) => void;
  setInput: <K extends keyof AirflowInputs>(field: K, value: AirflowInputs[K]) => void;
  setOverride: <K extends keyof AirflowOverrideState>(
    field: K,
    value: AirflowOverrideState[K],
  ) => void;
  setSupplyCfm: (cfm: number) => void;
  reset: () => void;
  simulateRun: () => Promise<void>;
}

export type PersistedAirflowWorkspaceState = Pick<AirflowWorkspaceStore, 'inputs' | 'overrides'>;

const initialResult = calculateAirflowScenario(defaultAirflowInputs, defaultAirflowOverrides);

export const useAirflowWorkspaceStore = create<AirflowWorkspaceStore>()(
  persist(
    (set, get) => ({
      inputs: defaultAirflowInputs,
      overrides: defaultAirflowOverrides,
      result: initialResult,
      loading: false,

      getSnapshot: () => {
        const current = get();
        return {
          inputs: current.inputs,
          overrides: current.overrides,
        };
      },

      applySnapshot: (snapshot) => {
        const current = get();
        const nextInputs = snapshot.inputs ?? current.inputs;
        const nextOverrides = snapshot.overrides ?? current.overrides;

        set({
          inputs: nextInputs,
          overrides: nextOverrides,
          result: calculateAirflowScenario(nextInputs, nextOverrides),
          loading: false,
        });
      },

      setInput: (field, value) => {
        const current = get();
        const nextInputs = {
          ...current.inputs,
          [field]: value,
        };

        set({
          inputs: nextInputs,
          result: calculateAirflowScenario(nextInputs, current.overrides),
        });
      },

      setOverride: (field, value) => {
        const current = get();
        const nextOverrides = {
          ...current.overrides,
          [field]: value,
        };

        set({
          overrides: nextOverrides,
          result: calculateAirflowScenario(current.inputs, nextOverrides),
        });
      },

      setSupplyCfm: (cfm) => {
        const current = get();
        const nextInputs = {
          ...current.inputs,
          supplyCfm: cfm,
        };

        set({
          inputs: nextInputs,
          result: calculateAirflowScenario(nextInputs, current.overrides),
        });
      },

      reset: () => {
        set({
          inputs: defaultAirflowInputs,
          overrides: defaultAirflowOverrides,
          result: calculateAirflowScenario(defaultAirflowInputs, defaultAirflowOverrides),
          loading: false,
        });
      },

      simulateRun: async () => {
        set({ loading: true });
        await new Promise((resolve) => setTimeout(resolve, 180));

        const current = get();
        set({
          loading: false,
          result: calculateAirflowScenario(current.inputs, current.overrides),
        });
      },
    }),
    {
      name: 'hvac-airflow-workspace-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedAirflowWorkspaceState => ({
        inputs: state.inputs,
        overrides: state.overrides,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedAirflowWorkspaceState>;
        const inputs = persisted.inputs ?? currentState.inputs;
        const overrides = persisted.overrides ?? currentState.overrides;

        return {
          ...currentState,
          ...persisted,
          inputs,
          overrides,
          result: calculateAirflowScenario(inputs, overrides),
          loading: false,
        };
      },
    },
  ),
);
