import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  calculateLoadScenario,
  defaultLoadInputs,
  defaultOverrides,
  LoadCalculationInputs,
  LoadCalculationResult,
  ManualOverrides,
  SpaceType,
} from '@/lib/engine/hvac/load-calculation-engine';

interface LoadWorkspaceStore {
  inputs: LoadCalculationInputs;
  overrides: ManualOverrides;
  result: LoadCalculationResult;
  loading: boolean;
  getSnapshot: () => PersistedLoadWorkspaceState;
  applySnapshot: (snapshot: Partial<PersistedLoadWorkspaceState>) => void;
  setInput: <K extends keyof LoadCalculationInputs>(field: K, value: LoadCalculationInputs[K]) => void;
  setSpaceType: (spaceType: SpaceType) => void;
  setOverride: <K extends keyof ManualOverrides>(field: K, value: ManualOverrides[K]) => void;
  reset: () => void;
  simulateRun: () => Promise<void>;
}

export type PersistedLoadWorkspaceState = Pick<LoadWorkspaceStore, 'inputs' | 'overrides'>;

const initialResult = calculateLoadScenario(defaultLoadInputs, defaultOverrides);

export const useLoadWorkspaceStore = create<LoadWorkspaceStore>()(
  persist(
    (set, get) => ({
      inputs: defaultLoadInputs,
      overrides: defaultOverrides,
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
          result: calculateLoadScenario(nextInputs, nextOverrides),
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
          result: calculateLoadScenario(nextInputs, current.overrides),
        });
      },

      setSpaceType: (spaceType) => {
        const current = get();
        const nextInputs = {
          ...current.inputs,
          spaceType,
        };

        set({
          inputs: nextInputs,
          result: calculateLoadScenario(nextInputs, current.overrides),
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
          result: calculateLoadScenario(current.inputs, nextOverrides),
        });
      },

      reset: () => {
        set({
          inputs: defaultLoadInputs,
          overrides: defaultOverrides,
          result: calculateLoadScenario(defaultLoadInputs, defaultOverrides),
          loading: false,
        });
      },

      simulateRun: async () => {
        set({ loading: true });
        await new Promise((resolve) => setTimeout(resolve, 180));

        const current = get();
        set({
          loading: false,
          result: calculateLoadScenario(current.inputs, current.overrides),
        });
      },
    }),
    {
      name: 'hvac-load-workspace-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedLoadWorkspaceState => ({
        inputs: state.inputs,
        overrides: state.overrides,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedLoadWorkspaceState>;
        const inputs = persisted.inputs ?? currentState.inputs;
        const overrides = persisted.overrides ?? currentState.overrides;

        return {
          ...currentState,
          ...persisted,
          inputs,
          overrides,
          result: calculateLoadScenario(inputs, overrides),
          loading: false,
        };
      },
    },
  ),
);
