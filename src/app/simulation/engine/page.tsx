'use client';

/**
 * Simulation Engine Workspace — Case Management & CFD Execution
 *
 * Left:   Case list + geometry builder + physics/solver config
 * Center: 3D mesh preview + contour slice viewer
 * Right:  Run control, residual convergence, export/import
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Play, Download, Upload, Trash2, RefreshCw,
  Box, Settings2, Layers, BarChart3,
  AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AirflowViewer3D from '@/components/building/AirflowViewer3D';
import { useSimulationEngineStore } from '@/stores/simulation-engine-store';
import { useProjectStore } from '@/stores/project-store';
import type {
  GeometryInput,
  CaseStatus,
  ContourSliceConfig,
  FieldName,
  RunFieldSnapshot,
  SimulationResult,
  TileFlowViewConfig,
  Vec3,
} from '@/types/simulation';

const SNAPSHOT_FIELD_OPTIONS: FieldName[] = [
  'temperature',
  'velocity',
  'pressure',
  'humidity',
  'turbulentViscosity',
];

const SNAPSHOT_PREVIEW_MODES: Array<'temperature' | 'velocity' | 'pressure' | 'humidity'> = [
  'temperature',
  'velocity',
  'pressure',
  'humidity',
];

const SNAPSHOT_UI_PREFS_STORAGE_KEY = 'hvac-simulation-engine-snapshot-ui:v1';

type SnapshotPreviewMode = (typeof SNAPSHOT_PREVIEW_MODES)[number];

interface SnapshotUiPreferences {
  previewMode: SnapshotPreviewMode;
  autoLoadPreviewField: boolean;
  timelineByCase?: Record<string, SnapshotTimelinePreference>;
  hideTimelineHelpNote?: boolean;
}

interface SnapshotTimelinePreference {
  runId: string | null;
  iteration: number | null;
}

function isSnapshotPreviewMode(value: unknown): value is SnapshotPreviewMode {
  return SNAPSHOT_PREVIEW_MODES.includes(value as SnapshotPreviewMode);
}

function parseSnapshotTimelineByCase(value: unknown): Record<string, SnapshotTimelinePreference> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const parsed: Record<string, SnapshotTimelinePreference> = {};

  for (const [caseId, preference] of Object.entries(value as Record<string, unknown>)) {
    if (!preference || typeof preference !== 'object' || Array.isArray(preference)) {
      continue;
    }

    const candidate = preference as { runId?: unknown; iteration?: unknown };
    const runId = typeof candidate.runId === 'string' && candidate.runId.length > 0
      ? candidate.runId
      : null;
    const iteration = typeof candidate.iteration === 'number'
      && Number.isInteger(candidate.iteration)
      && candidate.iteration > 0
      ? candidate.iteration
      : null;

    if (runId !== null || iteration !== null) {
      parsed[caseId] = { runId, iteration };
    }
  }

  return parsed;
}

// ─── Status Badges ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<CaseStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  meshed: { label: 'Meshed', variant: 'outline' },
  queued: { label: 'Queued', variant: 'default' },
  running: { label: 'Running', variant: 'default' },
  completed: { label: 'Completed', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  imported: { label: 'Imported', variant: 'outline' },
};

function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

type SnapshotDims = { nx: number; ny: number; nz: number };

function createScalarField(dims: SnapshotDims, fallback: number): number[][][] {
  const out: number[][][] = new Array(dims.nx);
  for (let x = 0; x < dims.nx; x += 1) {
    const yz: number[][] = new Array(dims.ny);
    for (let y = 0; y < dims.ny; y += 1) {
      yz[y] = new Array(dims.nz).fill(fallback);
    }
    out[x] = yz;
  }
  return out;
}

function createVectorField(dims: SnapshotDims): Vec3[][][] {
  const out: Vec3[][][] = new Array(dims.nx);
  for (let x = 0; x < dims.nx; x += 1) {
    const yz: Vec3[][] = new Array(dims.ny);
    for (let y = 0; y < dims.ny; y += 1) {
      const zValues: Vec3[] = new Array(dims.nz);
      for (let z = 0; z < dims.nz; z += 1) {
        zValues[z] = { x: 0, y: 0, z: 0 };
      }
      yz[y] = zValues;
    }
    out[x] = yz;
  }
  return out;
}

function resolveSnapshotScalarField(
  snapshot: RunFieldSnapshot,
  fieldName: 'temperature' | 'pressure' | 'humidity',
  dims: SnapshotDims,
  fallback: number,
): number[][][] {
  const payload = snapshot.fields.find((field) => field.name === fieldName);
  return payload?.scalarData ?? createScalarField(dims, fallback);
}

function resolveSnapshotVelocityField(snapshot: RunFieldSnapshot, dims: SnapshotDims): Vec3[][][] {
  const payload = snapshot.fields.find((field) => field.name === 'velocity');
  return payload?.vectorData ?? createVectorField(dims);
}

function summarizeScalarField(field: number[][][]): { min: number; max: number; avg: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;

  for (const yz of field) {
    for (const zValues of yz) {
      for (const value of zValues) {
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return { min: 0, max: 0, avg: 0 };
  }

  return {
    min,
    max,
    avg: sum / count,
  };
}

function summarizeVelocityField(field: Vec3[][][]): { max: number; avg: number } {
  let max = 0;
  let sum = 0;
  let count = 0;

  for (const yz of field) {
    for (const zValues of yz) {
      for (const vec of zValues) {
        const speed = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
        max = Math.max(max, speed);
        sum += speed;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return { max: 0, avg: 0 };
  }

  return {
    max,
    avg: sum / count,
  };
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function SimulationEnginePage() {
  const {
    projectId, setProjectId,
    cases, isLoadingCases, loadCases,
    activeCase, selectCase, createCase, deleteCase,
    activeRun, runHistory, startRun, loadRunHistory, loadRunSnapshots,
    snapshotRunId,
    runSnapshots, selectedSnapshotIteration, activeSnapshot,
    isPolling, isLoadingSnapshots, isLoadingSnapshotDetail, snapshotStreamlineSeeds,
    loadSnapshotIteration, loadSnapshotField,
    exportOpenFOAM, importResults, isExporting, isImporting,
    contourSlices, addContourSlice, removeContourSlice, updateContourSlice,
  } = useSimulationEngineStore();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [snapshotPreviewMode, setSnapshotPreviewMode] = useState<SnapshotPreviewMode>('temperature');
  const [snapshotAutoLoadPreviewField, setSnapshotAutoLoadPreviewField] = useState(true);
  const [snapshotTimelineByCase, setSnapshotTimelineByCase] = useState<Record<string, SnapshotTimelinePreference>>({});
  const [pendingTimelineRestoreCaseId, setPendingTimelineRestoreCaseId] = useState<string | null>(null);
  const [showSnapshotTimelineHelpNote, setShowSnapshotTimelineHelpNote] = useState(true);
  const [isSnapshotPrefsHydrated, setIsSnapshotPrefsHydrated] = useState(false);
  const [snapshotPrefsSaveStatus, setSnapshotPrefsSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [snapshotFieldLoadingMap, setSnapshotFieldLoadingMap] = useState<Partial<Record<FieldName, boolean>>>({});
  const [snapshotFieldErrorMap, setSnapshotFieldErrorMap] = useState<Partial<Record<FieldName, string>>>({});
  const hasInteractedWithSnapshotPrefs = useRef(false);

  const { projects, fetchProjects } = useProjectStore();

  const selectedSnapshotSeeds = useMemo(() => {
    if (selectedSnapshotIteration === null) return [];
    return snapshotStreamlineSeeds[selectedSnapshotIteration] ?? [];
  }, [selectedSnapshotIteration, snapshotStreamlineSeeds]);

  const snapshotRun = runHistory.find((run) => run.id === snapshotRunId) ?? activeRun ?? runHistory[0] ?? null;
  const activeCaseId = activeCase?.id ?? null;
  const snapshotIterationOptions = useMemo(() => {
    return Array.from(
      new Set(
        runSnapshots
          .map((snapshot) => snapshot.iteration)
          .filter((iteration) => Number.isFinite(iteration) && iteration > 0),
      ),
    ).sort((a, b) => a - b);
  }, [runSnapshots]);

  const loadedSnapshotFields = useMemo(() => {
    return new Set(activeSnapshot?.fields.map((field) => field.name) ?? []);
  }, [activeSnapshot]);

  const availableSnapshotFields = useMemo(() => {
    return new Set(activeSnapshot?.meta.availableFields ?? []);
  }, [activeSnapshot]);

  const snapshotPreviewField = snapshotPreviewMode as FieldName;
  const isSnapshotPreviewFieldLoaded = loadedSnapshotFields.has(snapshotPreviewField);
  const isSnapshotPreviewFieldAvailable = availableSnapshotFields.has(snapshotPreviewField);
  const isSnapshotPreviewFieldLoading = Boolean(snapshotFieldLoadingMap[snapshotPreviewField]);
  const snapshotPreviewFieldError = snapshotFieldErrorMap[snapshotPreviewField];

  const failedSnapshotFieldNames = useMemo(
    () => SNAPSHOT_FIELD_OPTIONS.filter((fieldName) => {
      return Boolean(snapshotFieldErrorMap[fieldName]) && availableSnapshotFields.has(fieldName);
    }),
    [snapshotFieldErrorMap, availableSnapshotFields],
  );

  const isRetryingFailedFields = useMemo(
    () => failedSnapshotFieldNames.some((fieldName) => Boolean(snapshotFieldLoadingMap[fieldName])),
    [failedSnapshotFieldNames, snapshotFieldLoadingMap],
  );

  const requestSnapshotField = useCallback(
    async (iteration: number, fieldName: FieldName) => {
      setSnapshotFieldLoadingMap((state) => ({ ...state, [fieldName]: true }));
      setSnapshotFieldErrorMap((state) => ({ ...state, [fieldName]: undefined }));
      try {
        const field = await loadSnapshotField(iteration, fieldName);
        if (!field) {
          setSnapshotFieldErrorMap((state) => ({
            ...state,
            [fieldName]: 'Failed to load. Retry.',
          }));
          return;
        }
        setSnapshotFieldErrorMap((state) => ({ ...state, [fieldName]: undefined }));
      } finally {
        setSnapshotFieldLoadingMap((state) => ({ ...state, [fieldName]: false }));
      }
    },
    [loadSnapshotField],
  );

  const retryFailedSnapshotFields = useCallback(async () => {
    if (selectedSnapshotIteration === null || failedSnapshotFieldNames.length === 0) {
      return;
    }

    for (const fieldName of failedSnapshotFieldNames) {
      await requestSnapshotField(selectedSnapshotIteration, fieldName);
    }
  }, [selectedSnapshotIteration, failedSnapshotFieldNames, requestSnapshotField]);

  const selectSnapshotIteration = useCallback((iteration: number) => {
    if (!Number.isFinite(iteration) || iteration < 1) {
      return;
    }

    hasInteractedWithSnapshotPrefs.current = true;
    void loadSnapshotIteration(iteration, ['temperature', 'velocity']);
  }, [loadSnapshotIteration]);

  const handleSnapshotIterationKeyDown = useCallback((event: React.KeyboardEvent<HTMLSelectElement>) => {
    if (snapshotIterationOptions.length === 0) {
      return;
    }

    const currentIndex = selectedSnapshotIteration === null
      ? -1
      : snapshotIterationOptions.indexOf(selectedSnapshotIteration);

    let nextIndex: number | null = null;

    switch (event.key) {
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = snapshotIterationOptions.length - 1;
        break;
      case 'PageUp':
        nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        break;
      case 'PageDown':
        nextIndex = currentIndex < 0
          ? snapshotIterationOptions.length - 1
          : Math.min(snapshotIterationOptions.length - 1, currentIndex + 1);
        break;
      default:
        return;
    }

    event.preventDefault();

    const nextIteration = snapshotIterationOptions[nextIndex];
    if (nextIteration !== undefined && nextIteration !== selectedSnapshotIteration) {
      selectSnapshotIteration(nextIteration);
    }
  }, [snapshotIterationOptions, selectedSnapshotIteration, selectSnapshotIteration]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_UI_PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SnapshotUiPreferences>;
        if (isSnapshotPreviewMode(parsed.previewMode)) {
          setSnapshotPreviewMode(parsed.previewMode);
        }
        if (typeof parsed.autoLoadPreviewField === 'boolean') {
          setSnapshotAutoLoadPreviewField(parsed.autoLoadPreviewField);
        }
        if (typeof parsed.hideTimelineHelpNote === 'boolean') {
          setShowSnapshotTimelineHelpNote(!parsed.hideTimelineHelpNote);
        }
        setSnapshotTimelineByCase(parseSnapshotTimelineByCase(parsed.timelineByCase));
      }
    } catch {
      // Ignore malformed localStorage payloads.
    } finally {
      setIsSnapshotPrefsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isSnapshotPrefsHydrated) {
      return;
    }
    const prefs: SnapshotUiPreferences = {
      previewMode: snapshotPreviewMode,
      autoLoadPreviewField: snapshotAutoLoadPreviewField,
      timelineByCase: snapshotTimelineByCase,
      hideTimelineHelpNote: !showSnapshotTimelineHelpNote,
    };

    try {
      window.localStorage.setItem(SNAPSHOT_UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
      if (hasInteractedWithSnapshotPrefs.current) {
        setSnapshotPrefsSaveStatus('saved');
      }
    } catch {
      // Ignore localStorage write failures.
      if (hasInteractedWithSnapshotPrefs.current) {
        setSnapshotPrefsSaveStatus('error');
      }
    }
  }, [
    isSnapshotPrefsHydrated,
    snapshotPreviewMode,
    snapshotAutoLoadPreviewField,
    snapshotTimelineByCase,
    showSnapshotTimelineHelpNote,
  ]);

  useEffect(() => {
    if (snapshotPrefsSaveStatus !== 'saved') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSnapshotPrefsSaveStatus('idle');
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [snapshotPrefsSaveStatus]);

  useEffect(() => {
    if (!isSnapshotPrefsHydrated || !activeCaseId) {
      setPendingTimelineRestoreCaseId(null);
      return;
    }

    setPendingTimelineRestoreCaseId(snapshotTimelineByCase[activeCaseId] ? activeCaseId : null);
  }, [isSnapshotPrefsHydrated, activeCaseId]);

  useEffect(() => {
    if (!isSnapshotPrefsHydrated || !activeCaseId) {
      return;
    }
    if (pendingTimelineRestoreCaseId !== activeCaseId) {
      return;
    }

    const preferred = snapshotTimelineByCase[activeCaseId];
    if (!preferred) {
      setPendingTimelineRestoreCaseId(null);
      return;
    }

    if (runHistory.length === 0) {
      return;
    }

    if (preferred.runId && runHistory.some((run) => run.id === preferred.runId)) {
      if (snapshotRunId !== preferred.runId) {
        if (!isLoadingSnapshots) {
          void loadRunSnapshots(preferred.runId);
        }
        return;
      }
    }

    if (
      preferred.iteration !== null
      && runSnapshots.some((snapshot) => snapshot.iteration === preferred.iteration)
      && selectedSnapshotIteration !== preferred.iteration
    ) {
      if (!isLoadingSnapshotDetail) {
        void loadSnapshotIteration(preferred.iteration, ['temperature', 'velocity']);
      }
      return;
    }

    setPendingTimelineRestoreCaseId(null);
  }, [
    isSnapshotPrefsHydrated,
    activeCaseId,
    pendingTimelineRestoreCaseId,
    snapshotTimelineByCase,
    runHistory,
    snapshotRunId,
    isLoadingSnapshots,
    loadRunSnapshots,
    runSnapshots,
    selectedSnapshotIteration,
    isLoadingSnapshotDetail,
    loadSnapshotIteration,
  ]);

  useEffect(() => {
    if (!isSnapshotPrefsHydrated || !activeCaseId) {
      return;
    }
    if (pendingTimelineRestoreCaseId === activeCaseId) {
      return;
    }
    if (!snapshotRunId && selectedSnapshotIteration === null) {
      return;
    }

    const nextPreference: SnapshotTimelinePreference = {
      runId: snapshotRunId ?? null,
      iteration: selectedSnapshotIteration ?? null,
    };

    setSnapshotTimelineByCase((state) => {
      const current = state[activeCaseId];
      if (
        current?.runId === nextPreference.runId
        && current?.iteration === nextPreference.iteration
      ) {
        return state;
      }

      return {
        ...state,
        [activeCaseId]: nextPreference,
      };
    });
  }, [
    isSnapshotPrefsHydrated,
    activeCaseId,
    pendingTimelineRestoreCaseId,
    snapshotRunId,
    selectedSnapshotIteration,
  ]);

  useEffect(() => {
    setSnapshotFieldLoadingMap({});
    setSnapshotFieldErrorMap({});
  }, [selectedSnapshotIteration, snapshotRunId]);

  useEffect(() => {
    if (!activeSnapshot) {
      return;
    }
    const loadedFieldSet = new Set(activeSnapshot.fields.map((field) => field.name));
    setSnapshotFieldErrorMap((state) => {
      let changed = false;
      const next: Partial<Record<FieldName, string>> = { ...state };
      for (const fieldName of Object.keys(next) as FieldName[]) {
        if (loadedFieldSet.has(fieldName) && next[fieldName]) {
          next[fieldName] = undefined;
          changed = true;
        }
      }
      return changed ? next : state;
    });
  }, [activeSnapshot]);

  useEffect(() => {
    if (!activeSnapshot || selectedSnapshotIteration === null) {
      return;
    }
    if (!snapshotAutoLoadPreviewField) {
      return;
    }
    if (!isSnapshotPreviewFieldAvailable || isSnapshotPreviewFieldLoaded) {
      return;
    }
    void requestSnapshotField(selectedSnapshotIteration, snapshotPreviewField);
  }, [
    activeSnapshot,
    selectedSnapshotIteration,
    snapshotAutoLoadPreviewField,
    isSnapshotPreviewFieldAvailable,
    isSnapshotPreviewFieldLoaded,
    requestSnapshotField,
    snapshotPreviewField,
  ]);

  const snapshotPreviewResult = useMemo<SimulationResult | null>(() => {
    if (!activeCase || !activeSnapshot) {
      return null;
    }

    const dims = activeSnapshot.meta.dimensions;
    const ambientTemp = activeCase.physics.referenceTemperatureC;
    const ambientHumidity = 0.0093;
    const cellSize = activeCase.mesh?.cellSizeM ?? 1;

    const temperatureField = resolveSnapshotScalarField(activeSnapshot, 'temperature', dims, ambientTemp);
    const pressureField = resolveSnapshotScalarField(activeSnapshot, 'pressure', dims, 0);
    const humidityField = resolveSnapshotScalarField(activeSnapshot, 'humidity', dims, ambientHumidity);
    const velocityField = resolveSnapshotVelocityField(activeSnapshot, dims);

    const tempStats = summarizeScalarField(temperatureField);
    const humidityStats = summarizeScalarField(humidityField);
    const velocityStats = summarizeVelocityField(velocityField);

    const totalHeatLoad = activeCase.geometry.racks.reduce((sum, rack) => sum + (rack.powerKW * 1000), 0);
    const totalCoolingCapacity = activeCase.geometry.hvacUnits.reduce((sum, unit) => sum + (unit.capacityKW * 1000), 0);
    const hvacPower = activeCase.geometry.hvacUnits.reduce((sum, unit) => sum + (unit.powerInputKW * 1000), 0);
    const latestResidual = activeRun?.residuals[activeRun.residuals.length - 1];

    const config = {
      mode: 'balanced' as const,
      gridResolution: cellSize,
      gridSizeX: dims.nx,
      gridSizeY: dims.ny,
      gridSizeZ: dims.nz,
      iterations: activeRun?.totalIterations ?? activeCase.solver.maxIterations,
      convergence: activeCase.solver.convergenceTarget,
      timeStep: activeCase.solver.timeStepS || 0.1,
      ambientTempC: ambientTemp,
      ambientHumidityRatio: ambientHumidity,
      airDensity: activeCase.physics.fluid.density,
      airViscosity: activeCase.physics.fluid.viscosity,
      thermalDiffusivity:
        activeCase.physics.fluid.thermalConductivity
        / Math.max(activeCase.physics.fluid.density * activeCase.physics.fluid.specificHeat, 1e-6),
      specificHeat: activeCase.physics.fluid.specificHeat,
    };

    return {
      id: `${activeCase.id}-snapshot-${activeSnapshot.meta.iteration}`,
      projectId: activeCase.projectId,
      status: 'completed',
      config,
      metrics: {
        maxTemperature: tempStats.max,
        minTemperature: tempStats.min,
        avgTemperature: tempStats.avg,
        maxHumidityRatio: humidityStats.max,
        minHumidityRatio: humidityStats.min,
        avgHumidityRatio: humidityStats.avg,
        maxVelocity: velocityStats.max,
        avgVelocity: velocityStats.avg,
        totalHeatLoad,
        totalCoolingCapacity,
        coolingDeficit: Math.max(0, totalHeatLoad - totalCoolingCapacity),
        hotspots: [],
        pue: totalHeatLoad > 0 ? (totalHeatLoad + hvacPower) / totalHeatLoad : 1,
        supplyHeatIndex: 0,
        returnHeatIndex: 0,
        rackInletTemps: [],
        continuityResidual: latestResidual?.continuity ?? 0,
        momentumResidual: latestResidual?.momentumX ?? 0,
        energyResidual: latestResidual?.energy ?? 0,
        turbulenceResidual: latestResidual?.k ?? 0,
        maxDivergence: 0,
        converged: true,
        avgTurbulentViscosity: 0,
        maxTurbulentIntensity: 0,
      },
      temperatureField,
      humidityField,
      velocityField,
      pressureField,
      iteration: activeSnapshot.meta.iteration,
      convergenceHistory: activeRun?.residuals.map((residual) => residual.continuity) ?? [],
      cflHistory: [],
      effectiveTimeStep: activeCase.solver.timeStepS || 0.1,
      completedAt: activeSnapshot.meta.createdAt,
    };
  }, [activeCase, activeRun, activeSnapshot]);

  const snapshotStreamlineSeedPoints = useMemo<Vec3[]>(() => {
    if (!activeCase || selectedSnapshotSeeds.length === 0) {
      return [];
    }

    const cellSize = activeCase.mesh?.cellSizeM ?? 1;
    return selectedSnapshotSeeds.map((seed) => ({
      x: seed.x * cellSize,
      y: seed.y * cellSize,
      z: seed.z * cellSize,
    }));
  }, [activeCase, selectedSnapshotSeeds]);

  const snapshotTileFlowView = useMemo<TileFlowViewConfig>(() => {
    const baseCell = activeCase?.mesh?.cellSizeM ?? 0.25;
    return {
      showStreamlines: true,
      showFog: false,
      showTileOverlay: false,
      showAlerts: false,
      streamlineConfig: {
        seedCount: Math.max(8, Math.min(50, snapshotStreamlineSeedPoints.length || 30)),
        maxSteps: 180,
        stepSize: Math.max(0.05, baseCell * 0.6),
        colorBy: 'temperature',
        tubeRadius: Math.max(0.02, baseCell * 0.2),
      },
      fogOpacity: 0.2,
      alertThresholds: {
        maxTempC: 35,
        minCFM: 350,
      },
    };
  }, [activeCase?.mesh?.cellSizeM, snapshotStreamlineSeedPoints.length]);

  const snapshotSliceZ = useMemo(() => {
    if (!snapshotPreviewResult) return 0;
    return Math.max(0, Math.min(
      snapshotPreviewResult.config.gridSizeZ - 1,
      Math.floor(snapshotPreviewResult.config.gridSizeZ / 2),
    ));
  }, [snapshotPreviewResult]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Default geometry for new cases
  const [geometry, setGeometry] = useState<GeometryInput>({
    roomId: '',
    lengthM: 10,
    widthM: 8,
    heightM: 3,
    raisedFloorHeightM: 0.45,
    ceilingPlenumHeightM: 0,
    walls: [],
    hvacUnits: [],
    racks: [],
    tiles: [],
    obstructions: [],
  });

  // Load cases when project changes
  const handleLoadProject = useCallback(() => {
    if (selectedProjectId) {
      setProjectId(selectedProjectId);
      loadCases(selectedProjectId);
    }
  }, [selectedProjectId, setProjectId, loadCases]);

  // Create new case
  const handleCreateCase = useCallback(async () => {
    if (!newCaseName.trim()) return;
    await createCase({
      name: newCaseName.trim(),
      geometry,
    });
    setShowCreateForm(false);
    setNewCaseName('');
  }, [newCaseName, geometry, createCase]);

  // Export OpenFOAM case
  const handleExport = useCallback(async () => {
    const files = await exportOpenFOAM();
    if (files) {
      // Create a downloadable JSON blob
      const blob = new Blob([JSON.stringify(files, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `openfoam-case-${activeCase?.id?.slice(0, 8) || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [exportOpenFOAM, activeCase]);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* ── Left Panel: Cases & Config ──────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
        {/* Project Selector */}
        <Card className="p-3">
          <label className="text-xs font-medium text-muted-foreground">Select Project</label>
          <div className="mt-1 flex gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={handleLoadProject} disabled={!selectedProjectId}>
              Load
            </Button>
          </div>
        </Card>

        {/* Case List */}
        <Card className="flex-1 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Simulation Cases</h3>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => projectId && loadCases(projectId)} disabled={!projectId}>
                <RefreshCw size={12} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(true)} disabled={!projectId}>
                <Plus size={12} />
              </Button>
            </div>
          </div>

          {isLoadingCases && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          )}

          {!isLoadingCases && cases.length === 0 && projectId && (
            <p className="py-4 text-center text-xs text-muted-foreground">No simulation cases yet</p>
          )}

          <div className="space-y-1.5">
            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCase(c.id)}
                className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                  activeCase?.id === c.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  <CaseStatusBadge status={c.status} />
                </div>
                <p className="mt-0.5 text-muted-foreground">{c.runSource} &middot; {c.geometry.lengthM}×{c.geometry.widthM}×{c.geometry.heightM}m</p>
              </button>
            ))}
          </div>

          {/* Create Form */}
          {showCreateForm && (
            <div className="mt-3 space-y-2 rounded-md border border-border p-2">
              <input
                type="text"
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                placeholder="Case name..."
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] text-muted-foreground">Length (m)</label>
                  <input
                    type="number"
                    value={geometry.lengthM}
                    onChange={(e) => setGeometry({ ...geometry, lengthM: Number(e.target.value) || 1 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Width (m)</label>
                  <input
                    type="number"
                    value={geometry.widthM}
                    onChange={(e) => setGeometry({ ...geometry, widthM: Number(e.target.value) || 1 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Height (m)</label>
                  <input
                    type="number"
                    value={geometry.heightM}
                    onChange={(e) => setGeometry({ ...geometry, heightM: Number(e.target.value) || 1 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] text-muted-foreground">Raised Floor (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={geometry.raisedFloorHeightM}
                    onChange={(e) => setGeometry({ ...geometry, raisedFloorHeightM: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Ceiling Plenum (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={geometry.ceilingPlenumHeightM}
                    onChange={(e) => setGeometry({ ...geometry, ceilingPlenumHeightM: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={handleCreateCase} disabled={!newCaseName.trim()}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Center Panel: Case Details & Mesh Preview ──────── */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {!activeCase ? (
          <Card className="flex flex-1 items-center justify-center p-8">
            <div className="text-center">
              <Box size={40} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Select or create a simulation case</p>
            </div>
          </Card>
        ) : (
          <>
            {/* Case Header */}
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{activeCase.name}</h2>
                  <p className="text-xs text-muted-foreground">{activeCase.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CaseStatusBadge status={activeCase.status} />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteCase(activeCase.id)}
                    disabled={activeCase.status === 'running'}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Geometry Summary */}
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Layers size={14} /> Geometry & Mesh
              </h3>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Room</span>
                  <p className="font-mono">{activeCase.geometry.lengthM}×{activeCase.geometry.widthM}×{activeCase.geometry.heightM}m</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Racks</span>
                  <p className="font-mono">{activeCase.geometry.racks.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">HVAC Units</span>
                  <p className="font-mono">{activeCase.geometry.hvacUnits.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tiles</span>
                  <p className="font-mono">{activeCase.geometry.tiles.length}</p>
                </div>
              </div>
              {activeCase.mesh && (
                <div className="mt-2 grid grid-cols-4 gap-3 border-t border-border/50 pt-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Grid</span>
                    <p className="font-mono">{activeCase.mesh.nx}×{activeCase.mesh.ny}×{activeCase.mesh.nz}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cell Size</span>
                    <p className="font-mono">{activeCase.mesh.cellSizeM.toFixed(3)}m</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fluid Cells</span>
                    <p className="font-mono">{activeCase.mesh.fluidCellCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Patches</span>
                    <p className="font-mono">{activeCase.mesh.patches.length}</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Physics & Solver Config */}
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Settings2 size={14} /> Physics & Solver
              </h3>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Turbulence</span>
                  <p className="font-mono">{activeCase.physics.turbulenceModel}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Algorithm</span>
                  <p className="font-mono">{activeCase.solver.algorithm}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Iterations</span>
                  <p className="font-mono">{activeCase.solver.maxIterations}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Convergence Target</span>
                  <p className="font-mono">{activeCase.solver.convergenceTarget}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Buoyancy</span>
                  <p className="font-mono">{activeCase.physics.buoyancy ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Run Source</span>
                  <p className="font-mono">{activeCase.runSource}</p>
                </div>
              </div>
            </Card>

            {/* Active Run Progress */}
            {activeRun && (
              <Card className="p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <BarChart3 size={14} /> Run Progress
                </h3>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-mono capitalize">{activeRun.status}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Iteration</span>
                    <p className="font-mono">{activeRun.currentIteration} / {activeRun.totalIterations}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Elapsed</span>
                    <p className="font-mono">{activeRun.elapsedSeconds.toFixed(1)}s</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source</span>
                    <p className="font-mono">{activeRun.source}</p>
                  </div>
                </div>
                {activeRun.residuals.length > 0 && (
                  <div className="mt-2 border-t border-border/50 pt-2">
                    <p className="text-[10px] font-medium text-muted-foreground">Latest Residuals</p>
                    <div className="mt-1 grid grid-cols-5 gap-2 text-[10px] font-mono">
                      <span>Cont: {activeRun.residuals[activeRun.residuals.length - 1].continuity.toExponential(2)}</span>
                      <span>Mom-X: {activeRun.residuals[activeRun.residuals.length - 1].momentumX.toExponential(2)}</span>
                      <span>Mom-Y: {activeRun.residuals[activeRun.residuals.length - 1].momentumY.toExponential(2)}</span>
                      <span>Energy: {activeRun.residuals[activeRun.residuals.length - 1].energy.toExponential(2)}</span>
                      {activeRun.residuals[activeRun.residuals.length - 1].k !== undefined && (
                        <span>k: {activeRun.residuals[activeRun.residuals.length - 1].k!.toExponential(2)}</span>
                      )}
                    </div>
                  </div>
                )}
                {activeRun.errorMessage && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle size={12} /> {activeRun.errorMessage}
                  </div>
                )}
                {activeRun.status === 'completed' && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 size={12} /> Run completed successfully
                  </div>
                )}
              </Card>
            )}

            {/* Snapshot Timeline */}
            {(snapshotRun || runSnapshots.length > 0 || isLoadingSnapshots) && (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <BarChart3 size={14} /> Snapshot Timeline
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                      {snapshotPrefsSaveStatus === 'error'
                        ? 'Snapshot preference save failed.'
                        : snapshotPrefsSaveStatus === 'saved'
                          ? 'Snapshot preferences saved.'
                          : ''}
                    </span>
                    {snapshotPrefsSaveStatus !== 'idle' && (
                      <span className={`text-[10px] ${snapshotPrefsSaveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {snapshotPrefsSaveStatus === 'error' ? 'Preference save failed' : 'Preferences saved'}
                      </span>
                    )}
                    {snapshotRun && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        Run {snapshotRun.id.slice(0, 8)}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => activeCase && loadRunHistory()}
                      disabled={!activeCase}
                      aria-label="Refresh run history for snapshot timeline"
                      title="Refresh run history"
                    >
                      <RefreshCw size={12} className={isLoadingSnapshots ? 'animate-spin' : ''} />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Runs</span>
                    <p className="font-mono">{runHistory.length}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Snapshots</span>
                    <p className="font-mono">{runSnapshots.length}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Selected Iteration</span>
                    <p className="font-mono">{selectedSnapshotIteration ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Seed Cache</span>
                    <p className="font-mono">{selectedSnapshotSeeds.length}</p>
                  </div>
                </div>

                {showSnapshotTimelineHelpNote && (
                  <div className="mt-2 flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                    <p>
                      Timeline selection is saved per case in this browser. Preview field and auto-load settings are saved globally.
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        hasInteractedWithSnapshotPrefs.current = true;
                        setShowSnapshotTimelineHelpNote(false);
                      }}
                      aria-label="Dismiss snapshot timeline persistence help"
                      title="Dismiss this help note"
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
                  <select
                    value={snapshotRun?.id ?? ''}
                    onChange={(e) => {
                      const runId = e.target.value;
                      if (runId) {
                        hasInteractedWithSnapshotPrefs.current = true;
                        void loadRunSnapshots(runId);
                      }
                    }}
                    disabled={runHistory.length === 0 || isLoadingSnapshots}
                    aria-label="Select run for snapshot timeline"
                    title="Select run for snapshot timeline"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Select run...</option>
                    {runHistory.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.id.slice(0, 8)} · {run.status} · iter {run.currentIteration}/{run.totalIterations}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => snapshotRun && loadRunSnapshots(snapshotRun.id)}
                    disabled={!snapshotRun || isLoadingSnapshots}
                    aria-label={snapshotRun ? `Refresh snapshots for run ${snapshotRun.id.slice(0, 8)}` : 'Refresh snapshots'}
                    title="Refresh snapshots"
                  >
                    {isLoadingSnapshots ? (
                      <Loader2 size={12} className="mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw size={12} className="mr-1.5" />
                    )}
                    Refresh Snapshots
                  </Button>

                  <select
                    value={selectedSnapshotIteration ?? ''}
                    onChange={(e) => {
                      const iteration = Number(e.target.value);
                      selectSnapshotIteration(iteration);
                    }}
                    onKeyDown={handleSnapshotIterationKeyDown}
                    disabled={runSnapshots.length === 0 || isLoadingSnapshotDetail}
                    aria-label="Select snapshot iteration"
                    title="Select snapshot iteration (Home/End/PageUp/PageDown supported)"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Select iteration...</option>
                    {snapshotIterationOptions.map((iteration) => (
                      <option key={iteration} value={iteration}>
                        Iter {iteration}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (selectedSnapshotIteration !== null) {
                        void loadSnapshotIteration(selectedSnapshotIteration);
                      }
                    }}
                    disabled={selectedSnapshotIteration === null || isLoadingSnapshotDetail}
                    aria-label="Load full fields for selected snapshot iteration"
                    title="Load full fields for selected iteration"
                  >
                    {isLoadingSnapshotDetail ? (
                      <Loader2 size={12} className="mr-1.5 animate-spin" />
                    ) : null}
                    Load Full Fields
                  </Button>

                  <span className="text-[10px] text-muted-foreground">Iteration keys: Home / End / PageUp / PageDown</span>
                </div>

                {activeSnapshot && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-xs">
                    <span className="text-muted-foreground">Field Payloads</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void retryFailedSnapshotFields();
                      }}
                      disabled={
                        selectedSnapshotIteration === null
                        || failedSnapshotFieldNames.length === 0
                        || isRetryingFailedFields
                      }
                      className="h-7 px-2 text-[10px]"
                      aria-label={failedSnapshotFieldNames.length > 0
                        ? `Retry ${failedSnapshotFieldNames.length} failed snapshot fields`
                        : 'Retry failed snapshot fields'}
                      title="Retry failed snapshot field loads"
                    >
                      {isRetryingFailedFields ? <Loader2 size={10} className="mr-1 animate-spin" /> : null}
                      Retry Failed
                      {failedSnapshotFieldNames.length > 0 ? ` (${failedSnapshotFieldNames.length})` : ''}
                    </Button>
                    {SNAPSHOT_FIELD_OPTIONS.map((fieldName) => {
                      const isLoaded = loadedSnapshotFields.has(fieldName);
                      const isAvailable = availableSnapshotFields.has(fieldName);
                      const isLoading = Boolean(snapshotFieldLoadingMap[fieldName]);
                      const fieldError = snapshotFieldErrorMap[fieldName];
                      const fieldStatusLabel = isLoaded
                        ? 'loaded'
                        : isLoading
                          ? 'loading'
                          : fieldError
                            ? 'failed'
                            : isAvailable
                              ? 'not loaded'
                              : 'unavailable';
                      return (
                        <Button
                          key={fieldName}
                          size="sm"
                          variant={isLoaded ? 'secondary' : 'outline'}
                          onClick={() => {
                            if (selectedSnapshotIteration !== null && !isLoaded && isAvailable) {
                              void requestSnapshotField(selectedSnapshotIteration, fieldName);
                            }
                          }}
                          disabled={
                            selectedSnapshotIteration === null
                            || isLoading
                            || isLoaded
                            || !isAvailable
                          }
                          className={`h-7 px-2 text-[10px] ${fieldError ? 'border-red-500/50 text-red-600' : ''}`}
                          aria-label={`Snapshot field ${fieldName}, ${fieldStatusLabel}`}
                          title={`Snapshot field ${fieldName}, ${fieldStatusLabel}`}
                        >
                          {isLoading ? <Loader2 size={10} className="mr-1 animate-spin" /> : null}
                          {fieldName}
                          {isLoaded
                            ? ' · loaded'
                            : isLoading
                              ? ' · loading'
                              : fieldError
                                ? ' · failed'
                                : isAvailable
                                  ? ''
                                  : ' · n/a'}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {activeSnapshot && (
                  <div className="mt-2 grid grid-cols-4 gap-3 border-t border-border/50 pt-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Grid</span>
                      <p className="font-mono">
                        {activeSnapshot.meta.dimensions.nx}×{activeSnapshot.meta.dimensions.ny}×{activeSnapshot.meta.dimensions.nz}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Stride</span>
                      <p className="font-mono">{activeSnapshot.meta.sampleStride}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cells</span>
                      <p className="font-mono">{activeSnapshot.meta.cellCount.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Loaded Fields</span>
                      <p className="font-mono">{activeSnapshot.fields.map((field) => field.name).join(', ') || '—'}</p>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {snapshotPreviewResult && activeCase && (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Snapshot 3D Preview</h3>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    Iter {snapshotPreviewResult.iteration}
                  </Badge>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Streamline playback uses {snapshotStreamlineSeedPoints.length} cached velocity seeds from the selected snapshot.
                </p>
                <div className="mb-3 flex flex-wrap items-center gap-2 border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Preview Field</span>
                  <select
                    value={snapshotPreviewMode}
                    onChange={(event) => {
                      const mode = event.target.value as typeof snapshotPreviewMode;
                      hasInteractedWithSnapshotPrefs.current = true;
                      setSnapshotPreviewMode(mode);
                    }}
                    aria-label="Select snapshot preview field"
                    title="Select snapshot preview field"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {SNAPSHOT_PREVIEW_MODES.map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={snapshotAutoLoadPreviewField}
                      onChange={(event) => {
                        hasInteractedWithSnapshotPrefs.current = true;
                        setSnapshotAutoLoadPreviewField(event.target.checked);
                      }}
                      aria-label="Auto-load selected preview field"
                      title="Automatically load selected preview field when snapshot iteration changes"
                    />
                    Auto-load
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        selectedSnapshotIteration !== null
                        && !isSnapshotPreviewFieldLoaded
                        && isSnapshotPreviewFieldAvailable
                      ) {
                        void requestSnapshotField(selectedSnapshotIteration, snapshotPreviewField);
                      }
                    }}
                    disabled={
                      selectedSnapshotIteration === null
                      || isSnapshotPreviewFieldLoading
                      || isSnapshotPreviewFieldLoaded
                      || !isSnapshotPreviewFieldAvailable
                    }
                    aria-label={`Load preview field ${snapshotPreviewField}`}
                    title={`Load preview field ${snapshotPreviewField}`}
                  >
                    {isSnapshotPreviewFieldLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                    Load Preview Field
                  </Button>
                  <span className="text-muted-foreground">
                    {isSnapshotPreviewFieldLoading
                      ? 'Loading'
                      : isSnapshotPreviewFieldLoaded
                        ? 'Loaded'
                        : snapshotPreviewFieldError
                          ? snapshotPreviewFieldError
                          : isSnapshotPreviewFieldAvailable
                            ? 'Not loaded'
                            : 'Unavailable'}
                  </span>
                </div>
                <AirflowViewer3D
                  result={snapshotPreviewResult}
                  racks={activeCase.geometry.racks}
                  hvacUnits={activeCase.geometry.hvacUnits}
                  showHotspots={false}
                  showAirflow={false}
                  selectedSliceZ={snapshotSliceZ}
                  viewMode={snapshotPreviewMode}
                  tileFlowView={snapshotTileFlowView}
                  streamlineSeedPoints={snapshotStreamlineSeedPoints}
                />
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Right Panel: Actions & Export/Import ───────────── */}
      <div className="flex w-64 shrink-0 flex-col gap-3">
        {/* Run Controls */}
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-semibold">Run Controls</h3>
          <div className="space-y-1.5">
            <Button
              size="sm"
              className="w-full"
              onClick={() => startRun('internal')}
              disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
            >
              {isPolling ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Play size={12} className="mr-1.5" />}
              Run Internal Solver
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => startRun('openfoam')}
              disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
            >
              <Play size={12} className="mr-1.5" />
              Run via OpenFOAM
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => activeCase && loadRunHistory()}
              disabled={!activeCase}
            >
              <RefreshCw size={12} className="mr-1.5" />
              Refresh Run History
            </Button>
          </div>
        </Card>

        {/* Export / Import */}
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-semibold">Export / Import</h3>
          <div className="space-y-1.5">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleExport}
              disabled={!activeCase || !activeCase.mesh || isExporting}
            >
              {isExporting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Download size={12} className="mr-1.5" />}
              Export OpenFOAM Case
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                // Trigger file upload for result import
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    await importResults(data.fields || data, data.source);
                  } catch { /* handled by store */ }
                };
                input.click();
              }}
              disabled={!activeCase || !activeCase.mesh || isImporting}
            >
              {isImporting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Upload size={12} className="mr-1.5" />}
              Import Results
            </Button>
          </div>
        </Card>

        {/* Contour Slices */}
        <Card className="flex-1 p-3">
          <h3 className="mb-2 text-sm font-semibold">Contour Slices</h3>
          <Button
            size="sm"
            variant="ghost"
            className="mb-2 w-full"
            onClick={() =>
              addContourSlice({
                id: crypto.randomUUID(),
                field: 'temperature',
                orientation: 'xy',
                position: 1.5,
                levels: 20,
                colorMap: 'jet',
                opacity: 0.5,
                showLines: false,
              })
            }
          >
            <Plus size={12} className="mr-1" /> Add Slice
          </Button>

          <div className="space-y-2">
            {contourSlices.map((slice) => (
              <div key={slice.id} className="rounded border border-border p-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{slice.field} — {slice.orientation}</span>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeContourSlice(slice.id)}>
                    <Trash2 size={10} />
                  </Button>
                </div>
                <div className="mt-1 flex gap-1">
                  <select
                    value={slice.orientation}
                    onChange={(e) => updateContourSlice(slice.id, { orientation: e.target.value as ContourSliceConfig['orientation'] })}
                    className="rounded border border-border bg-background px-1 text-[10px]"
                  >
                    <option value="xy">XY (horizontal)</option>
                    <option value="xz">XZ (vertical)</option>
                    <option value="yz">YZ (vertical)</option>
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    value={slice.position}
                    onChange={(e) => updateContourSlice(slice.id, { position: Number(e.target.value) })}
                    className="w-14 rounded border border-border bg-background px-1 text-[10px]"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
