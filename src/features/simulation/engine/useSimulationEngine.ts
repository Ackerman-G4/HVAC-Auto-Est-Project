'use client';

/**
 * State, effects and handlers for the Simulation Engine workspace
 * (OpenFOAM case management, runs, and snapshot playback).
 *
 * Extracted verbatim from app/simulation/engine/page.tsx so the route stays a
 * composition shell, per the decomposition rule in docs/architecture-v3.md.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import { useSimulationStore } from '@/stores/simulation-store';
import { useProjectStore } from '@/stores/project-store';
import type {
  GeometryInput,
  FieldName,
  SimulationResult,
  TileFlowViewConfig,
  Vec3,
} from '@/types/simulation';

import {
  SNAPSHOT_FIELD_OPTIONS,
  SNAPSHOT_UI_PREFS_STORAGE_KEY,
} from './constants';
import type {
  SnapshotPreviewMode,
  SnapshotTimelinePreference,
  SnapshotUiPreferences,
} from './types';
import {
  isSnapshotPreviewMode,
  parseSnapshotTimelineByCase,
  resolveSnapshotScalarField,
  resolveSnapshotVelocityField,
  summarizeScalarField,
  summarizeVelocityField,
} from './helpers';

export function useSimulationEngine() {
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
    engineeringTierAvailable, engineeringTierReason, loadCapabilities,
  } = useSimulationStore();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const newCaseInputRef = useRef<HTMLInputElement>(null);
  const [snapshotPreviewMode, setSnapshotPreviewMode] = useState<SnapshotPreviewMode>('temperature');
  const [snapshotAutoLoadPreviewField, setSnapshotAutoLoadPreviewField] = useState(true);
  const [useR3FViewer, setUseR3FViewer] = useState(false);
  const [snapshotTimelineByCase, setSnapshotTimelineByCase] = useState<Record<string, SnapshotTimelinePreference>>({});
  const [pendingTimelineRestoreCaseId, setPendingTimelineRestoreCaseId] = useState<string | null>(null);
  const [showSnapshotTimelineHelpNote, setShowSnapshotTimelineHelpNote] = useState(true);
  const [isSnapshotPrefsHydrated, setIsSnapshotPrefsHydrated] = useState(false);
  const [snapshotPrefsSaveStatus, setSnapshotPrefsSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [snapshotFieldLoadingMap, setSnapshotFieldLoadingMap] = useState<Partial<Record<FieldName, boolean>>>({});
  const [snapshotFieldErrorMap, setSnapshotFieldErrorMap] = useState<Partial<Record<FieldName, string>>>({});
  const hasInteractedWithSnapshotPrefsRef = useRef(false);

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

    hasInteractedWithSnapshotPrefsRef.current = true;
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

  // Probe which solver tiers this deployment can run, so the Engineering
  // control can be gated before it is clicked rather than after.
  useEffect(() => {
    void loadCapabilities();
  }, [loadCapabilities]);

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
      if (hasInteractedWithSnapshotPrefsRef.current) {
        setSnapshotPrefsSaveStatus('saved');
      }
    } catch {
      // Ignore localStorage write failures.
      if (hasInteractedWithSnapshotPrefsRef.current) {
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
  }, [isSnapshotPrefsHydrated, activeCaseId, snapshotTimelineByCase]);

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
  return {
    projectId,
    setProjectId,
    cases,
    isLoadingCases,
    loadCases,
    activeCase,
    selectCase,
    createCase,
    deleteCase,
    activeRun,
    runHistory,
    startRun,
    loadRunHistory,
    loadRunSnapshots,
    snapshotRunId,
    runSnapshots,
    selectedSnapshotIteration,
    activeSnapshot,
    isPolling,
    isLoadingSnapshots,
    isLoadingSnapshotDetail,
    snapshotStreamlineSeeds,
    loadSnapshotIteration,
    loadSnapshotField,
    exportOpenFOAM,
    importResults,
    isExporting,
    isImporting,
    contourSlices,
    addContourSlice,
    removeContourSlice,
    updateContourSlice,
    engineeringTierAvailable,
    engineeringTierReason,
    selectedProjectId,
    setSelectedProjectId,
    showCreateForm,
    setShowCreateForm,
    newCaseName,
    setNewCaseName,
    newCaseInputRef,
    snapshotPreviewMode,
    setSnapshotPreviewMode,
    snapshotAutoLoadPreviewField,
    setSnapshotAutoLoadPreviewField,
    useR3FViewer,
    setUseR3FViewer,
    snapshotTimelineByCase,
    setSnapshotTimelineByCase,
    pendingTimelineRestoreCaseId,
    setPendingTimelineRestoreCaseId,
    showSnapshotTimelineHelpNote,
    setShowSnapshotTimelineHelpNote,
    isSnapshotPrefsHydrated,
    setIsSnapshotPrefsHydrated,
    snapshotPrefsSaveStatus,
    setSnapshotPrefsSaveStatus,
    snapshotFieldLoadingMap,
    setSnapshotFieldLoadingMap,
    snapshotFieldErrorMap,
    setSnapshotFieldErrorMap,
    hasInteractedWithSnapshotPrefsRef,
    projects,
    fetchProjects,
    selectedSnapshotSeeds,
    snapshotRun,
    activeCaseId,
    snapshotIterationOptions,
    loadedSnapshotFields,
    availableSnapshotFields,
    snapshotPreviewField,
    isSnapshotPreviewFieldLoaded,
    isSnapshotPreviewFieldAvailable,
    isSnapshotPreviewFieldLoading,
    snapshotPreviewFieldError,
    failedSnapshotFieldNames,
    isRetryingFailedFields,
    requestSnapshotField,
    retryFailedSnapshotFields,
    selectSnapshotIteration,
    handleSnapshotIterationKeyDown,
    snapshotPreviewResult,
    snapshotStreamlineSeedPoints,
    snapshotTileFlowView,
    snapshotSliceZ,
    geometry,
    setGeometry,
    handleLoadProject,
    handleCreateCase,
    handleExport,
  };
}
