import { create } from 'zustand';
import { 
  ref, 
  onValue, 
  off, 
  set as firebaseSet, 
  update as firebaseUpdate 
} from 'firebase/database';
import { db, auth } from '@/lib/db/firebase';
import { showToast } from '@/components/ui/toast';
import type {
  SimulationConfig,
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

  // Actions
  subscribeToSimulation: (projectId: string) => () => void;
  saveSimulationData: (projectId: string) => Promise<void>;
  
  // Actions - Equipment (Local state first, then save)
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
  runCompliance: (projectId: string) => Promise<void>;
  runFailure: (projectId: string, config: FailureConfig) => Promise<void>;
  runPUE: (projectId: string) => Promise<void>;
  runOptimization: (projectId: string, config?: OptimizationConfig) => Promise<void>;
  clearResults: (projectId: string) => Promise<void>;

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

  subscribeToSimulation: (projectId: string) => {
    const simRef = ref(db, `simulations/${projectId}`);
    
    const unsubscribe = onValue(simRef, (snapshot) => {
      const data = snapshot.val() || {};
      set({
        racks: data.racks || [],
        hvacUnits: data.hvacUnits || [],
        tiles: data.tiles || [],
        config: data.config || DEFAULT_CONFIG,
        result: data.result || null,
        complianceReport: data.complianceReport || null,
        failureResult: data.failureResult || null,
        pueAnalysis: data.pueAnalysis || null,
        optimizationResult: data.optimizationResult || null,
        raisedFloorHeight: data.raisedFloorHeight || 0.45,
      });
    });

    return () => off(simRef, 'value', unsubscribe);
  },

  saveSimulationData: async (projectId: string) => {
    const { racks, hvacUnits, tiles, config, raisedFloorHeight } = get();
    try {
      await firebaseUpdate(ref(db, `simulations/${projectId}`), {
        racks,
        hvacUnits,
        tiles,
        config,
        raisedFloorHeight,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error saving simulation data:", error);
    }
  },

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
    set({ isRunning: true });

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'cfd',
          input: { projectId, floorId, config, racks, hvacUnits, tiles, raisedFloorHeight },
        }),
      });

      if (!res.ok) throw new Error('Simulation failed');
      const data = await res.json();
      
      // Save result to Firebase
      await firebaseUpdate(ref(db, `simulations/${projectId}`), {
        result: data.result,
        updatedAt: new Date().toISOString(),
      });
      
      set({ isRunning: false });
      showToast('success', 'CFD simulation completed');
    } catch (error) {
      console.error(error);
      set({ isRunning: false });
      showToast('error', 'Simulation failed');
    }
  },

  runCompliance: async (projectId) => {
    const { result, racks, hvacUnits } = get();
    if (!result) {
      showToast('error', 'Run CFD simulation first');
      return;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'compliance',
          metrics: result.metrics,
          racks,
          hvacUnits,
        }),
      });

      if (!res.ok) throw new Error('Compliance check failed');
      const data = await res.json();
      
      await firebaseUpdate(ref(db, `simulations/${projectId}`), {
        complianceReport: data.report,
        updatedAt: new Date().toISOString(),
      });
      
      showToast(data.report.overallPass ? 'success' : 'error',
        data.report.overallPass ? 'ASHRAE compliance passed' : 'ASHRAE compliance issues found');
    } catch (error) {
      console.error(error);
      showToast('error', 'Compliance check failed');
    }
  },

  runFailure: async (projectId, failureConfig) => {
    const { racks, hvacUnits, config } = get();
    set({ isRunning: true });

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
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
      
      await firebaseUpdate(ref(db, `simulations/${projectId}`), {
        failureResult: data.result,
        updatedAt: new Date().toISOString(),
      });
      
      set({ isRunning: false });
      showToast('success', 'Failure simulation completed');
    } catch (error) {
      console.error(error);
      set({ isRunning: false });
      showToast('error', 'Failure simulation failed');
    }
  },

  runPUE: async (projectId) => {
    const { racks, hvacUnits } = get();

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ action: 'pue', racks, hvacUnits }),
      });

      if (!res.ok) throw new Error('PUE calculation failed');
      const data = await res.json();
      
      await firebaseUpdate(ref(db, `simulations/${projectId}`), {
        pueAnalysis: data.analysis,
        updatedAt: new Date().toISOString(),
      });
      
      showToast('success', `PUE: ${data.analysis.pue}`);
    } catch (error) {
      console.error(error);
      showToast('error', 'PUE calculation failed');
    }
  },

  runOptimization: async (projectId, optimizationConfig) => {
    const { config, racks, hvacUnits, tiles, raisedFloorHeight } = get();
    set({ isRunning: true });

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'optimize',
          input: { projectId: '', floorId: '', config, racks, hvacUnits, tiles, raisedFloorHeight },
          optimizationConfig,
        }),
      });

      if (!res.ok) throw new Error('Optimization failed');
      const data = await res.json();
      
      await firebaseUpdate(ref(db, `simulations/${projectId}`), {
        optimizationResult: data.result,
        updatedAt: new Date().toISOString(),
      });
      
      set({ isRunning: false });
      showToast('success', `Optimization complete: ${data.result.improvement}% improvement`);
    } catch (error) {
      console.error(error);
      set({ isRunning: false });
      showToast('error', 'Optimization failed');
    }
  },

  clearResults: async (projectId: string) => {
    await firebaseUpdate(ref(db, `simulations/${projectId}`), {
      result: null,
      complianceReport: null,
      failureResult: null,
      pueAnalysis: null,
      optimizationResult: null,
      updatedAt: new Date().toISOString(),
    });
  },

  // ─── UI Actions ─────────────────────────────────────────────

  setActiveView: (view) => set({ activeView: view }),
  setShowHotspots: (show) => set({ showHotspots: show }),
  setShowAirflow: (show) => set({ showAirflow: show }),
  setSelectedSliceZ: (z) => set({ selectedSliceZ: z }),
}));
