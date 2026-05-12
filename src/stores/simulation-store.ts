import { create } from 'zustand';
import { showToast } from '@/components/ui/toast';
import { authFetch } from '@/lib/api-client';
import { autoDetectEquipment, type AutoDetectInput } from '@/lib/functions/auto-detect-equipment';
import { sampleScalarTrilinear, sampleVectorTrilinear } from '@/lib/simulation/field-sampling';
import type {
  SimulationConfig,
  SimulationMode,
  SimulationResult,
  ServerRack,
  HVACUnit,
  PerforatedTile,
  ComplianceReport,
  FailureResult,
  FailureConfig,
  PUEAnalysis,
  OptimizationResult,
  OptimizationConfig,
  LayoutHVACPlacement,
  LayoutTilePlacement,
  InspectedCellInfo,
  ThermalAlert,
  TileAirflowData,
  TileFlowViewConfig,
  CalibrationCoefficients,
  CalibrationResult,
  CalibrationMode,
  SensorReading,
  SimulationRuntimeMode,
  SimulationRunProgress,
} from '@/types/simulation';
import { DEFAULT_CALIBRATION_COEFFICIENTS } from '@/types/simulation';

interface SimulationStore {
  // Equipment
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  tiles: PerforatedTile[];

  // Simulation state
  isRunning: boolean;
  runtimeMode: SimulationRuntimeMode;
  runProgress: SimulationRunProgress | null;
  activeAbortController: AbortController | null;
  result: SimulationResult | null;
  complianceReport: ComplianceReport | null;
  failureResult: FailureResult | null;
  pueAnalysis: PUEAnalysis | null;
  optimizationResult: OptimizationResult | null;

  // Config
  config: SimulationConfig;
  raisedFloorHeight: number;

  // UI state
  activeView: 'temperature' | 'velocity' | 'pressure' | 'humidity';
  showHotspots: boolean;
  showAirflow: boolean;
  selectedSliceZ: number;

  // Layout (floorplan ↔ simulation sync)
  layoutHVAC: LayoutHVACPlacement[];
  layoutTiles: LayoutTilePlacement[];
  layoutDirty: boolean;

  // Inspect
  inspectedCell: InspectedCellInfo | null;

  // TileFlow analysis
  tileFlowView: TileFlowViewConfig;
  alerts: ThermalAlert[];
  tileAirflowData: TileAirflowData[];

  // Calibration
  calibrationResult: CalibrationResult | null;
  calibrationCoefficients: CalibrationCoefficients;
  sensorReadings: SensorReading[];
  isCalibrating: boolean;

  // Actions - Equipment
  addRack: (rack: Omit<ServerRack, 'id'>) => void;
  updateRack: (id: string, updates: Partial<ServerRack>) => void;
  removeRack: (id: string) => void;
  addHVACUnit: (unit: Omit<HVACUnit, 'id'>) => void;
  updateHVACUnit: (id: string, updates: Partial<HVACUnit>) => void;
  removeHVACUnit: (id: string) => void;
  setHVACUnits: (units: HVACUnit[]) => void;
  addTile: (tile: PerforatedTile) => void;
  removeTile: (x: number, y: number) => void;
  setTiles: (tiles: PerforatedTile[]) => void;

  // Actions - Simulation
  setConfig: (config: Partial<SimulationConfig>) => void;
  setMode: (mode: SimulationMode) => void;
  setRuntimeMode: (mode: SimulationRuntimeMode) => void;
  cancelSimulation: () => void;
  autoDetectFromProject: (projectId: string) => Promise<string[]>;
  runSimulation: (projectId: string, floorId: string) => Promise<void>;
  runCompliance: () => void;
  runFailure: (config: FailureConfig) => Promise<void>;
  runPUE: () => void;
  runOptimization: (config?: OptimizationConfig) => Promise<void>;
  clearResults: () => void;
  clearAll: () => void;

  // Actions - UI
  setActiveView: (view: 'temperature' | 'velocity' | 'pressure' | 'humidity') => void;
  setShowHotspots: (show: boolean) => void;
  setShowAirflow: (show: boolean) => void;
  setSelectedSliceZ: (z: number) => void;

  // Actions - Layout
  setLayoutHVAC: (placements: LayoutHVACPlacement[]) => void;
  addLayoutHVAC: (placement: LayoutHVACPlacement) => void;
  updateLayoutHVAC: (id: string, updates: Partial<LayoutHVACPlacement>) => void;
  removeLayoutHVAC: (id: string) => void;
  setLayoutTiles: (placements: LayoutTilePlacement[]) => void;
  addLayoutTile: (placement: LayoutTilePlacement) => void;
  removeLayoutTile: (id: string) => void;
  markLayoutClean: () => void;

  // Actions - Inspect
  setInspectedCell: (cell: InspectedCellInfo | null) => void;

  // Actions - TileFlow
  setTileFlowView: (updates: Partial<TileFlowViewConfig>) => void;
  computeAlerts: () => void;
  computeTileAirflow: () => void;

  // Actions - Calibration
  addSensorReading: (reading: SensorReading) => void;
  removeSensorReading: (id: string) => void;
  clearSensorReadings: () => void;
  runCalibration: (mode: CalibrationMode, projectId: string, floorId: string) => Promise<void>;
  applyCalibration: (coefficients: CalibrationCoefficients) => void;
  resetCalibration: () => void;
}

const MODE_CONFIGS: Record<SimulationMode, Partial<SimulationConfig>> = {
  fast: { gridSizeX: 10, gridSizeY: 10, gridSizeZ: 6, iterations: 50, timeStep: 0.5, gridResolution: 1.0 },
  balanced: { gridSizeX: 20, gridSizeY: 20, gridSizeZ: 6, iterations: 200, timeStep: 0.1, gridResolution: 0.5 },
  engineering: { gridSizeX: 40, gridSizeY: 40, gridSizeZ: 12, iterations: 1000, timeStep: 0.02, gridResolution: 0.25 },
};

const DEFAULT_CONFIG: SimulationConfig = {
  mode: 'balanced',
  gridResolution: 0.5,
  gridSizeX: 20,
  gridSizeY: 20,
  gridSizeZ: 6,
  iterations: 200,
  convergence: 0.001,
  timeStep: 0.1,
  ambientTempC: 24,
  ambientHumidityRatio: 0.0093,
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
  runtimeMode: 'worker',
  runProgress: null,
  activeAbortController: null,
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

  // Layout
  layoutHVAC: [],
  layoutTiles: [],
  layoutDirty: false,

  // Inspect
  inspectedCell: null,

  // TileFlow analysis
  tileFlowView: {
    showStreamlines: false,
    showFog: false,
    showTileOverlay: true,
    showAlerts: true,
    streamlineConfig: { seedCount: 30, maxSteps: 200, stepSize: 0.15, colorBy: 'temperature', tubeRadius: 0.03 },
    fogOpacity: 0.35,
    alertThresholds: { maxTempC: 35, minCFM: 150 },
  },
  alerts: [],
  tileAirflowData: [],

  // Calibration
  calibrationResult: null,
  calibrationCoefficients: { ...DEFAULT_CALIBRATION_COEFFICIENTS },
  sensorReadings: [],
  isCalibrating: false,

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

  setHVACUnits: (units) => {
    set({ hvacUnits: units });
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

  setTiles: (tiles) => {
    set({ tiles });
  },

  // ─── Config ─────────────────────────────────────────────────

  setConfig: (partial) => {
    set(state => ({ config: { ...state.config, ...partial } }));
  },

  setMode: (mode) => {
    const modeOverrides = MODE_CONFIGS[mode];
    set(state => ({ config: { ...state.config, ...modeOverrides, mode } }));
  },

  setRuntimeMode: (runtimeMode) => {
    set((state) => ({
      runtimeMode,
      config: {
        ...state.config,
        runtimeMode,
      },
    }));
  },

  cancelSimulation: () => {
    const { activeAbortController, runProgress } = get();
    activeAbortController?.abort();

    set({
      isRunning: false,
      activeAbortController: null,
      runProgress: {
        simulationId: runProgress?.simulationId ?? crypto.randomUUID(),
        status: 'cancelled',
        iteration: runProgress?.iteration ?? 0,
        totalIterations: runProgress?.totalIterations ?? 0,
        percent: runProgress?.percent ?? 0,
        continuityResidual: runProgress?.continuityResidual,
        momentumResidual: runProgress?.momentumResidual,
        energyResidual: runProgress?.energyResidual,
        elapsedMs: runProgress?.elapsedMs,
        message: 'Simulation cancelled by user',
      },
    });

    showToast('info', 'Simulation cancelled');
  },

  // ─── Auto-detect from project ─────────────────────────────

  autoDetectFromProject: async (projectId: string) => {
    try {
      // Fetch floors + rooms from the project API
      const res = await authFetch(`/api/projects/${encodeURIComponent(projectId)}/floors`);
      if (!res.ok) throw new Error('Failed to fetch project floors');
      const data = await res.json();
      const floors = data.floors ?? [];

      const { config } = get();
      const input: AutoDetectInput = { floors, gridResolution: config.gridResolution };
      const result = autoDetectEquipment(input);

      // Apply detected equipment to the store
      const newRacks = result.racks.map(r => ({ ...r, id: crypto.randomUUID() }));
      const newHvac = result.hvacUnits.map(u => ({ ...u, id: crypto.randomUUID() }));

      set({
        racks: newRacks,
        hvacUnits: newHvac,
        tiles: result.tiles,
      });

      showToast('success', `Detected ${newRacks.length} rack(s), ${newHvac.length} HVAC unit(s), ${result.tiles.length} tile(s)`);
      return result.summary;
    } catch (error) {
      console.error('Auto-detect failed:', error);
      showToast('error', 'Auto-detect failed — check project data');
      return ['Auto-detect failed'];
    }
  },

  // ─── Simulation Actions ─────────────────────────────────────

  runSimulation: async (projectId, floorId) => {
    const { config, racks, hvacUnits, tiles, raisedFloorHeight, runtimeMode } = get();
    const simulationId = crypto.randomUUID();
    const startedAt = Date.now();
    const abortController = new AbortController();

    set({
      isRunning: true,
      result: null,
      activeAbortController: abortController,
      runProgress: {
        simulationId,
        status: 'running',
        iteration: 0,
        totalIterations: config.iterations,
        percent: 5,
        message: 'Submitting simulation request',
      },
    });

    try {
      const res = await authFetch('/api/simulation', {
        method: 'POST',
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cfd',
          input: {
            projectId,
            floorId,
            config: {
              ...config,
              runtimeMode,
            },
            racks,
            hvacUnits,
            tiles,
            raisedFloorHeight,
            calibration: { coefficients: get().calibrationCoefficients } },
        }),
      });

      if (!res.ok) throw new Error('Simulation failed');
      const data = await res.json();
      const elapsedMs = Date.now() - startedAt;
      set({
        result: data.result,
        isRunning: false,
        activeAbortController: null,
        runProgress: {
          simulationId,
          status: 'completed',
          iteration: data.result?.iteration ?? config.iterations,
          totalIterations: config.iterations,
          percent: 100,
          continuityResidual: data.result?.metrics?.continuityResidual,
          momentumResidual: data.result?.metrics?.momentumResidual,
          energyResidual: data.result?.metrics?.energyResidual,
          elapsedMs,
          message: 'Simulation completed',
        },
      });
      // Auto-compute TileFlow analysis
      get().computeAlerts();
      get().computeTileAirflow();
      showToast('success', 'CFD simulation completed');
    } catch (error) {
      const wasCancelled =
        error instanceof Error &&
        (error.name === 'AbortError' || /abort/i.test(error.message));

      console.error(error);
      set((state) => ({
        isRunning: false,
        activeAbortController: null,
        runProgress: {
          simulationId,
          status: wasCancelled ? 'cancelled' : 'failed',
          iteration: state.runProgress?.iteration ?? 0,
          totalIterations: config.iterations,
          percent: state.runProgress?.percent ?? 0,
          continuityResidual: state.runProgress?.continuityResidual,
          momentumResidual: state.runProgress?.momentumResidual,
          energyResidual: state.runProgress?.energyResidual,
          elapsedMs: Date.now() - startedAt,
          message: wasCancelled ? 'Simulation cancelled' : 'Simulation failed',
        },
      }));

      if (wasCancelled) {
        showToast('info', 'Simulation cancelled');
      } else {
        showToast('error', 'Simulation failed');
      }
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
      authFetch('/api/simulation', {
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
      const res = await authFetch('/api/simulation', {
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

    authFetch('/api/simulation', {
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
      const res = await authFetch('/api/simulation', {
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
      runProgress: null,
      complianceReport: null,
      failureResult: null,
      pueAnalysis: null,
      optimizationResult: null,
    });
  },

  clearAll: () => {
    get().activeAbortController?.abort();

    set({
      racks: [],
      hvacUnits: [],
      tiles: [],
      isRunning: false,
      runProgress: null,
      activeAbortController: null,
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

  // ─── Layout Actions ─────────────────────────────────────────

  setLayoutHVAC: (placements) => set({ layoutHVAC: placements, layoutDirty: true }),
  addLayoutHVAC: (placement) => set(state => ({ layoutHVAC: [...state.layoutHVAC, placement], layoutDirty: true })),
  updateLayoutHVAC: (id, updates) => set(state => ({
    layoutHVAC: state.layoutHVAC.map(p => p.id === id ? { ...p, ...updates } : p),
    layoutDirty: true,
  })),
  removeLayoutHVAC: (id) => set(state => ({ layoutHVAC: state.layoutHVAC.filter(p => p.id !== id), layoutDirty: true })),
  setLayoutTiles: (placements) => set({ layoutTiles: placements, layoutDirty: true }),
  addLayoutTile: (placement) => set(state => ({ layoutTiles: [...state.layoutTiles, placement], layoutDirty: true })),
  removeLayoutTile: (id) => set(state => ({ layoutTiles: state.layoutTiles.filter(p => p.id !== id), layoutDirty: true })),
  markLayoutClean: () => set({ layoutDirty: false }),

  // ─── Inspect Actions ────────────────────────────────────────

  setInspectedCell: (cell) => set({ inspectedCell: cell }),

  // ─── TileFlow Actions ──────────────────────────────────────

  setTileFlowView: (updates) => set(state => ({ tileFlowView: { ...state.tileFlowView, ...updates } })),

  computeAlerts: () => {
    const { result, racks, tileFlowView } = get();
    if (!result) { set({ alerts: [] }); return; }
    const { maxTempC } = tileFlowView.alertThresholds;
    const m = result.metrics;
    const newAlerts: ThermalAlert[] = [];

    // Hotspot-derived overheating alerts
    for (const hs of m.hotspots) {
      if (hs.temperature >= maxTempC) {
        newAlerts.push({
          id: crypto.randomUUID(),
          type: 'overheating',
          severity: hs.severity === 'emergency' ? 'emergency' : hs.severity === 'critical' ? 'critical' : 'warning',
          position: hs.position,
          value: hs.temperature,
          threshold: maxTempC,
          unit: '°C',
          description: `Overheating zone at (${hs.position.x.toFixed(1)}, ${hs.position.y.toFixed(1)}, ${hs.position.z.toFixed(1)})m — ${hs.temperature.toFixed(1)}°C exceeds ${maxTempC}°C limit`,
          affectedRacks: hs.nearestRack ? [hs.nearestRack] : [],
        });
      }
    }

    // Rack inlet temperature alerts
    for (const ri of m.rackInletTemps) {
      if (ri.maxTemp >= maxTempC) {
        const rack = racks.find(r => r.id === ri.rackId);
        newAlerts.push({
          id: crypto.randomUUID(),
          type: 'overheating',
          severity: ri.maxTemp >= maxTempC + 5 ? 'critical' : 'warning',
          position: rack ? rack.position : { x: 0, y: 0, z: 0 },
          value: ri.maxTemp,
          threshold: maxTempC,
          unit: '°C',
          description: `Rack ${ri.rackId.slice(0, 8)} inlet max ${ri.maxTemp.toFixed(1)}°C exceeds ${maxTempC}°C`,
          affectedRacks: [ri.rackId],
        });
      }
    }

    set({ alerts: newAlerts });
  },

  computeTileAirflow: () => {
    const { result, tiles, tileFlowView } = get();
    if (!result || tiles.length === 0) { set({ tileAirflowData: [] }); return; }
    const cfg = result.config;
    const res = cfg.gridResolution;
    const samplingSpec = {
      resolution: res,
      sizeX: cfg.gridSizeX,
      sizeY: cfg.gridSizeY,
      sizeZ: cfg.gridSizeZ,
    };
    const floorZ = 0;
    const topSampleZ = Math.min(3 * res, Math.max((cfg.gridSizeZ - 1) * res, 0));
    const { minCFM } = tileFlowView.alertThresholds;
    const data: TileAirflowData[] = [];

    for (const tile of tiles) {
      const vel = sampleVectorTrilinear(result.velocityField, tile.x, tile.y, floorZ, samplingSpec, { x: 0, y: 0, z: 0 });
      const temp = sampleScalarTrilinear(result.temperatureField, tile.x, tile.y, floorZ, samplingSpec, cfg.ambientTempC);
      const vz = Math.abs(vel.z);
      // Convert m/s through tile area to CFM (1 m³/s ≈ 2118.88 CFM)
      const tileAreaM2 = (tile.tileSize ?? 0.6) * (tile.tileSize ?? 0.6) * (tile.openArea ?? 0.25);
      const actualCFM = vz * tileAreaM2 * 2118.88;
      const requiredCFM = minCFM;
      const efficiency = requiredCFM > 0 ? actualCFM / requiredCFM : 1;
      // Bypass: fraction of supply air above ambient that doesn't reach rack height
      const velTop = sampleVectorTrilinear(result.velocityField, tile.x, tile.y, topSampleZ, samplingSpec, { x: 0, y: 0, z: 0 });
      const vzTop = Math.abs(velTop.z);
      const bypassFraction = vz > 0.01 ? Math.max(0, 1 - vzTop / vz) : 0;

      data.push({
        tileId: `tile-${tile.x}-${tile.y}`,
        x: tile.x,
        y: tile.y,
        actualCFM: Math.round(actualCFM * 10) / 10,
        requiredCFM,
        efficiency: Math.round(efficiency * 1000) / 1000,
        supplyTempC: Math.round(temp * 10) / 10,
        bypassFraction: Math.round(bypassFraction * 100) / 100,
      });
    }

    // Also generate insufficient airflow alerts
    const { alerts } = get();
    const airflowAlerts: ThermalAlert[] = data
      .filter(d => d.efficiency < 0.7)
      .map(d => ({
        id: crypto.randomUUID(),
        type: 'insufficient_airflow' as const,
        severity: (d.efficiency < 0.4 ? 'critical' : 'warning') as ThermalAlert['severity'],
        position: { x: d.x, y: d.y, z: 0 },
        value: d.actualCFM,
        threshold: d.requiredCFM,
        unit: 'CFM',
        description: `Tile (${d.x}, ${d.y}) delivers ${d.actualCFM.toFixed(0)} CFM — ${(d.efficiency * 100).toFixed(0)}% of required ${d.requiredCFM} CFM`,
        affectedRacks: [],
      }));

    set({ tileAirflowData: data, alerts: [...alerts, ...airflowAlerts] });
  },

  // ─── Calibration Actions ─────────────────────────────────────

  addSensorReading: (reading) => {
    set(state => ({ sensorReadings: [...state.sensorReadings, reading] }));
  },

  removeSensorReading: (id) => {
    set(state => ({ sensorReadings: state.sensorReadings.filter(s => s.id !== id) }));
  },

  clearSensorReadings: () => {
    set({ sensorReadings: [] });
  },

  runCalibration: async (mode, projectId, floorId) => {
    const { config, racks, hvacUnits, tiles, raisedFloorHeight, calibrationCoefficients, sensorReadings } = get();
    set({ isCalibrating: true, calibrationResult: null });

    try {
      const res = await authFetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calibrate',
          input: {
            projectId, floorId, config, racks, hvacUnits, tiles, raisedFloorHeight,
            calibration: { coefficients: calibrationCoefficients },
          },
          calibrationConfig: {
            mode,
            maxIterations: 20,
            targetDeviationPct: 5,
            dampingFactor: 0.5,
          },
          sensorReadings: mode === 'sensor' ? sensorReadings : undefined,
        }),
      });

      if (!res.ok) throw new Error('Calibration failed');
      const data = await res.json();
      const calResult: CalibrationResult = data.calibrationResult;

      set({
        calibrationResult: calResult,
        isCalibrating: false,
      });

      // Auto-apply coefficients for auto-adjust and sensor modes
      if (mode !== 'compare') {
        set({ calibrationCoefficients: calResult.adjustedCoefficients });
        showToast('success', `Calibration complete — deviation: ${calResult.overallDeviationPct.temperature.toFixed(1)}%`);
      } else {
        showToast('success', 'Comparison complete');
      }
    } catch (error) {
      console.error(error);
      set({ isCalibrating: false });
      showToast('error', 'Calibration failed');
    }
  },

  applyCalibration: (coefficients) => {
    set({ calibrationCoefficients: coefficients });
    showToast('success', 'Calibration coefficients applied');
  },

  resetCalibration: () => {
    set({
      calibrationCoefficients: { ...DEFAULT_CALIBRATION_COEFFICIENTS },
      calibrationResult: null,
    });
    showToast('success', 'Calibration reset to defaults');
  },
}));
