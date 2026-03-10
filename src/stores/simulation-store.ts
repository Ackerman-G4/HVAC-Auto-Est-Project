import { create } from 'zustand';
import { showToast } from '@/components/ui/toast';
import type {
  SimulationConfig,
  SimulationInput,
  SimulationResult,
  SimulationMetrics,
  ServerRack,
  HVACUnit,
  PerforatedTile,
  ComplianceReport,
  FailureResult,
  FailureConfig,
  PUEAnalysis,
  OptimizationResult,
  OptimizationConfig,
  HVACUnitType,
  RackDensity,
} from '@/types/simulation';

interface SimulationStore {
  // Equipment
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  tiles: PerforatedTile[];

  // Simulation state
  isRunning: boolean;
  result: SimulationResult | null;
  complianceReport: ComplianceReport | null;
  failureResult: FailureResult | null;
  pueAnalysis: PUEAnalysis | null;
  optimizationResult: OptimizationResult | null;

  // Config
  config: SimulationConfig;
  raisedFloorHeight: number;

  // UI state
  activeView: 'temperature' | 'velocity' | 'pressure';
  showHotspots: boolean;
  showAirflow: boolean;
  selectedSliceZ: number;

  // Actions - Equipment
  addRack: (rack: Omit<ServerRack, 'id'>) => void;
  updateRack: (id: string, updates: Partial<ServerRack>) => void;
  removeRack: (id: string) => void;
  addHVACUnit: (unit: Omit<HVACUnit, 'id'>) => void;
  updateHVACUnit: (id: string, updates: Partial<HVACUnit>) => void;
  removeHVACUnit: (id: string) => void;
  addTile: (tile: PerforatedTile) => void;
  removeTile: (x: number, y: number) => void;

  // Actions - Simulation
  setConfig: (config: Partial<SimulationConfig>) => void;
  runSimulation: (projectId: string, floorId: string) => Promise<void>;
  runCompliance: () => void;
  runFailure: (config: FailureConfig) => Promise<void>;
  runPUE: () => void;
  runOptimization: (config?: OptimizationConfig) => Promise<void>;
  clearResults: () => void;

  // Actions - UI
  setActiveView: (view: 'temperature' | 'velocity' | 'pressure') => void;
  setShowHotspots: (show: boolean) => void;
  setShowAirflow: (show: boolean) => void;
  setSelectedSliceZ: (z: number) => void;
}

const DEFAULT_CONFIG: SimulationConfig = {
  gridResolution: 0.5,
  gridSizeX: 20,
  gridSizeY: 20,
  gridSizeZ: 6,
  iterations: 100,
  convergence: 0.001,
  timeStep: 0.1,
  ambientTempC: 24,
  airDensity: 1.2,
  airViscosity: 1.8e-5,
  thermalDiffusivity: 2.2e-5,
  specificHeat: 1005,
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  // Equipment
  racks: [],
  hvacUnits: [],
  tiles: [],

  // State
  isRunning: false,
  result: null,
  complianceReport: null,
  failureResult: null,
  pueAnalysis: null,
  optimizationResult: null,

  // Config
  config: DEFAULT_CONFIG,
  raisedFloorHeight: 0.45,

  // UI
  activeView: 'temperature',
  showHotspots: true,
  showAirflow: true,
  selectedSliceZ: 1,

  // ─── Equipment Actions ──────────────────────────────────────

  addRack: (rack) => {
    const id = crypto.randomUUID();
    set(state => ({ racks: [...state.racks, { ...rack, id }] }));
  },

  updateRack: (id, updates) => {
    set(state => ({
      racks: state.racks.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  },

  removeRack: (id) => {
    set(state => ({ racks: state.racks.filter(r => r.id !== id) }));
  },

  addHVACUnit: (unit) => {
    const id = crypto.randomUUID();
    set(state => ({ hvacUnits: [...state.hvacUnits, { ...unit, id }] }));
  },

  updateHVACUnit: (id, updates) => {
    set(state => ({
      hvacUnits: state.hvacUnits.map(u => u.id === id ? { ...u, ...updates } : u),
    }));
  },

  removeHVACUnit: (id) => {
    set(state => ({ hvacUnits: state.hvacUnits.filter(u => u.id !== id) }));
  },

  addTile: (tile) => {
    set(state => ({
      tiles: [...state.tiles.filter(t => !(t.x === tile.x && t.y === tile.y)), tile],
    }));
  },

  removeTile: (x, y) => {
    set(state => ({
      tiles: state.tiles.filter(t => !(t.x === x && t.y === y)),
    }));
  },

  // ─── Config ─────────────────────────────────────────────────

  setConfig: (partial) => {
    set(state => ({ config: { ...state.config, ...partial } }));
  },

  // ─── Simulation Actions ─────────────────────────────────────

  runSimulation: async (projectId, floorId) => {
    const { config, racks, hvacUnits, tiles, raisedFloorHeight } = get();
    set({ isRunning: true, result: null });

    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cfd',
          input: { projectId, floorId, config, racks, hvacUnits, tiles, raisedFloorHeight },
        }),
      });

      if (!res.ok) throw new Error('Simulation failed');
      const data = await res.json();
      set({ result: data.result, isRunning: false });
      showToast('success', 'CFD simulation completed');
    } catch (error) {
      console.error(error);
      set({ isRunning: false });
      showToast('error', 'Simulation failed');
    }
  },

  runCompliance: () => {
    const { result, racks, hvacUnits } = get();
    if (!result) {
      showToast('error', 'Run CFD simulation first');
      return;
    }

    try {
      // We'll call the API for compliance check
      fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'compliance',
          metrics: result.metrics,
          racks,
          hvacUnits,
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error('Compliance check failed');
        const data = await res.json();
        set({ complianceReport: data.report });
        showToast(data.report.overallPass ? 'success' : 'error',
          data.report.overallPass ? 'ASHRAE compliance passed' : 'ASHRAE compliance issues found');
      });
    } catch (error) {
      console.error(error);
      showToast('error', 'Compliance check failed');
    }
  },

  runFailure: async (failureConfig) => {
    const { racks, hvacUnits, config } = get();
    set({ isRunning: true });

    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'failure',
          racks,
          hvacUnits,
          failureConfig,
          ambientTempC: config.ambientTempC,
        }),
      });

      if (!res.ok) throw new Error('Failure simulation failed');
      const data = await res.json();
      set({ failureResult: data.result, isRunning: false });
      showToast('success', 'Failure simulation completed');
    } catch (error) {
      console.error(error);
      set({ isRunning: false });
      showToast('error', 'Failure simulation failed');
    }
  },

  runPUE: () => {
    const { racks, hvacUnits } = get();

    fetch('/api/simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pue', racks, hvacUnits }),
    }).then(async (res) => {
      if (!res.ok) throw new Error('PUE calculation failed');
      const data = await res.json();
      set({ pueAnalysis: data.analysis });
      showToast('success', `PUE: ${data.analysis.pue}`);
    }).catch((error) => {
      console.error(error);
      showToast('error', 'PUE calculation failed');
    });
  },

  runOptimization: async (optimizationConfig) => {
    const { config, racks, hvacUnits, tiles, raisedFloorHeight } = get();
    set({ isRunning: true });

    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'optimize',
          input: { projectId: '', floorId: '', config, racks, hvacUnits, tiles, raisedFloorHeight },
          optimizationConfig,
        }),
      });

      if (!res.ok) throw new Error('Optimization failed');
      const data = await res.json();
      set({ optimizationResult: data.result, isRunning: false });
      showToast('success', `Optimization complete: ${data.result.improvement}% improvement`);
    } catch (error) {
      console.error(error);
      set({ isRunning: false });
      showToast('error', 'Optimization failed');
    }
  },

  clearResults: () => {
    set({
      result: null,
      complianceReport: null,
      failureResult: null,
      pueAnalysis: null,
      optimizationResult: null,
    });
  },

  // ─── UI Actions ─────────────────────────────────────────────

  setActiveView: (view) => set({ activeView: view }),
  setShowHotspots: (show) => set({ showHotspots: show }),
  setShowAirflow: (show) => set({ showAirflow: show }),
  setSelectedSliceZ: (z) => set({ selectedSliceZ: z }),
}));
