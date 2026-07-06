import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  EquipmentSelectionInputs,
  EquipmentSelectionOverrides,
  EquipmentSelectionResult,
  calculateEquipmentSelection,
  defaultEquipmentSelectionInputs,
  defaultEquipmentSelectionOverrides,
} from '@/lib/engine/hvac/equipment-selection-engine';

interface EquipmentWorkspaceStore {
  inputs: EquipmentSelectionInputs;
  overrides: EquipmentSelectionOverrides;
  result: EquipmentSelectionResult;
  loading: boolean;
  getSnapshot: () => PersistedEquipmentWorkspaceState;
  applySnapshot: (snapshot: Partial<PersistedEquipmentWorkspaceState>) => void;
  setInput: <K extends keyof EquipmentSelectionInputs>(
    field: K,
    value: EquipmentSelectionInputs[K],
  ) => void;
  setOverride: <K extends keyof EquipmentSelectionOverrides>(
    field: K,
    value: EquipmentSelectionOverrides[K],
  ) => void;
  setRequiredTr: (requiredTr: number) => void;
  reset: () => void;
  simulateRun: () => Promise<void>;
}

export type PersistedEquipmentWorkspaceState = Pick<EquipmentWorkspaceStore, 'inputs' | 'overrides'>;

const initialResult = calculateEquipmentSelection(
  defaultEquipmentSelectionInputs,
  defaultEquipmentSelectionOverrides,
);

export const useEquipmentWorkspaceStore = create<EquipmentWorkspaceStore>()(
  persist(
    (set, get) => ({
      inputs: defaultEquipmentSelectionInputs,
      overrides: defaultEquipmentSelectionOverrides,
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
          result: calculateEquipmentSelection(nextInputs, nextOverrides),
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
          result: calculateEquipmentSelection(nextInputs, current.overrides),
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
          result: calculateEquipmentSelection(current.inputs, nextOverrides),
        });
      },

      setRequiredTr: (requiredTr) => {
        const current = get();
        const nextInputs = {
          ...current.inputs,
          requiredTr,
        };

        set({
          inputs: nextInputs,
          result: calculateEquipmentSelection(nextInputs, current.overrides),
        });
      },

      reset: () => {
        set({
          inputs: defaultEquipmentSelectionInputs,
          overrides: defaultEquipmentSelectionOverrides,
          result: calculateEquipmentSelection(
            defaultEquipmentSelectionInputs,
            defaultEquipmentSelectionOverrides,
          ),
          loading: false,
        });
      },

      simulateRun: async () => {
        set({ loading: true });
        await new Promise((resolve) => setTimeout(resolve, 180));

        const current = get();
        set({
          loading: false,
          result: calculateEquipmentSelection(current.inputs, current.overrides),
        });
      },
    }),
    {
      name: 'hvac-equipment-workspace-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedEquipmentWorkspaceState => ({
        inputs: state.inputs,
        overrides: state.overrides,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedEquipmentWorkspaceState>;
        const inputs = persisted.inputs ?? currentState.inputs;
        const overrides = persisted.overrides ?? currentState.overrides;

        return {
          ...currentState,
          ...persisted,
          inputs,
          overrides,
          result: calculateEquipmentSelection(inputs, overrides),
          loading: false,
        };
      },
    },
  ),
);
