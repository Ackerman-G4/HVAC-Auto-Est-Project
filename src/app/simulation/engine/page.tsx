'use client';

/**
 * Simulation Engine Workspace — Case Management & CFD Execution
 *
 * Left:   Case list + geometry builder + physics/solver config
 * Center: 3D mesh preview + contour slice viewer
 * Right:  Run control, residual convergence, export/import
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Plus, Trash2, RefreshCw,
  Box, Settings2, Layers, Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SimulationRunProgressCard from '@/components/building/SimulationRunProgressCard';
import CaseStatusBadge from '@/components/simulation/CaseStatusBadge';
import MeshSlicePreview from '@/components/simulation/MeshSlicePreview';
import SimulationEngineRightPanel from '@/components/simulation/SimulationEngineRightPanel';
import { showToast } from '@/components/ui/toast';
import { authFetch } from '@/lib/api-client';
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  normalizeConnectionOverride,
  sanitizeConnectionOverrides,
  toEngineeringReportConfig,
} from '@/lib/simulation/engine/page-helpers';
import { appendSimulationReportHistory } from '@/lib/reports/simulation-report-history';
import {
  buildSimulationEngineeringReport,
  exportSimulationReportCsv,
  exportSimulationReportJson,
  exportSimulationReportPdf,
} from '@/lib/reports/simulation-report';
import { exportMetricsCSV } from '@/lib/utils/simulation-export';
import { useSimulationEngineStore } from '@/stores/simulation-engine-store';
import { useProjectStore } from '@/stores/project-store';
import type { FloorOption, LayoutSnapshot } from '@/lib/simulation/engine/page-helpers';
import type {
  SimulationMetrics,
  GeometryInput,
  LayoutConnectionOverride,
  LayoutHVACPlacement,
  LayoutTilePlacement,
  RunSource,
} from '@/types/simulation';

const BuildingSimulationViewer3D = dynamic(
  () => import('@/components/building/BuildingSimulationViewer3D'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[30rem] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
        Loading building 3D viewer...
      </div>
    ),
  },
);

// ─── Main Page ──────────────────────────────────────────────────────

export default function SimulationEnginePage() {
  const {
    projectId, setProjectId,
    cases, isLoadingCases, loadCases,
    activeCase, selectCase, createCase, updateCase, deleteCase,
    activeRun, runHistory, isLoadingRunHistory, loadRunHistory, startRun, isPolling,
    exportOpenFOAM, importResults, isExporting, isImporting,
    contourSlices, addContourSlice, removeContourSlice, updateContourSlice,
  } = useSimulationEngineStore();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseScope, setNewCaseScope] = useState<'room' | 'building'>('room');
  const [selectedRunSourceByCase, setSelectedRunSourceByCase] = useState<Record<string, RunSource>>({});
  const [buildingOverlayMode, setBuildingOverlayMode] = useState<'temperature' | 'velocity' | 'flow'>('temperature');
  const [floorOptions, setFloorOptions] = useState<FloorOption[]>([]);
  const [selectedLayoutFloorId, setSelectedLayoutFloorId] = useState('');
  const [layoutByFloor, setLayoutByFloor] = useState<Record<string, LayoutSnapshot>>({});
  const [connectionDraftsByFloor, setConnectionDraftsByFloor] = useState<Record<string, LayoutConnectionOverride[]>>({});
  const [isLoadingFloors, setIsLoadingFloors] = useState(false);
  const [isLoadingLayout, setIsLoadingLayout] = useState(false);
  const [isSavingOverrides, setIsSavingOverrides] = useState(false);
  const [reportExporting, setReportExporting] = useState<'pdf' | 'csv' | 'json' | null>(null);

  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const loadFloorOptions = useCallback(async () => {
    if (!projectId) {
      setFloorOptions([]);
      setSelectedLayoutFloorId('');
      setLayoutByFloor({});
      setConnectionDraftsByFloor({});
      return;
    }

    setIsLoadingFloors(true);
    try {
      const res = await authFetch(`/api/projects/${encodeURIComponent(projectId)}/floors`);
      if (!res.ok) {
        throw new Error(`Failed to load floors (${res.status})`);
      }

      const data = await res.json();
      const normalizedFloors: FloorOption[] = Array.isArray(data.floors)
        ? data.floors.map((floor: Record<string, unknown>) => ({
          id: String(floor.id ?? ''),
          floorNumber: Number(floor.floorNumber ?? 0),
          name: String(floor.name ?? `Floor ${Number(floor.floorNumber ?? 0)}`),
          rooms: Array.isArray(floor.rooms)
            ? floor.rooms.map((room: Record<string, unknown>) => ({
              id: String(room.id ?? ''),
              name: String(room.name ?? 'Room'),
            }))
            : [],
        })).filter((floor: FloorOption) => floor.id.length > 0)
        : [];

      normalizedFloors.sort((a, b) => a.floorNumber - b.floorNumber);
      setFloorOptions(normalizedFloors);
      setSelectedLayoutFloorId((prev) => {
        if (prev && normalizedFloors.some((floor) => floor.id === prev)) {
          return prev;
        }
        return normalizedFloors[0]?.id ?? '';
      });
    } catch (error) {
      console.error('loadFloorOptions error:', error);
      setFloorOptions([]);
      setSelectedLayoutFloorId('');
      setLayoutByFloor({});
      setConnectionDraftsByFloor({});
      showToast('error', 'Failed to load project floors for connection overrides');
    } finally {
      setIsLoadingFloors(false);
    }
  }, [projectId]);

  const loadLayoutForFloor = useCallback(async (floorId: string, force = false) => {
    if (!projectId || !floorId) return;
    if (!force && layoutByFloor[floorId] && connectionDraftsByFloor[floorId]) return;

    setIsLoadingLayout(true);
    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulation-layout?floorId=${encodeURIComponent(floorId)}`,
      );

      if (!res.ok) {
        throw new Error(`Failed to load simulation layout (${res.status})`);
      }

      const data = await res.json();
      const layout = (data.layout ?? null) as {
        hvacPlacements?: LayoutHVACPlacement[];
        tilePlacements?: LayoutTilePlacement[];
        connectionOverrides?: LayoutConnectionOverride[];
        canvasScale?: number;
      } | null;

      const snapshot: LayoutSnapshot = {
        hvacPlacements: Array.isArray(layout?.hvacPlacements) ? layout?.hvacPlacements : [],
        tilePlacements: Array.isArray(layout?.tilePlacements) ? layout?.tilePlacements : [],
        canvasScale: typeof layout?.canvasScale === 'number' ? layout.canvasScale : 50,
      };

      const overrides = Array.isArray(layout?.connectionOverrides)
        ? sanitizeConnectionOverrides(layout.connectionOverrides)
        : [];

      setLayoutByFloor((prev) => ({
        ...prev,
        [floorId]: snapshot,
      }));
      setConnectionDraftsByFloor((prev) => ({
        ...prev,
        [floorId]: overrides,
      }));
    } catch (error) {
      console.error('loadLayoutForFloor error:', error);
      setLayoutByFloor((prev) => ({
        ...prev,
        [floorId]: DEFAULT_LAYOUT_SNAPSHOT,
      }));
      setConnectionDraftsByFloor((prev) => ({
        ...prev,
        [floorId]: [],
      }));
      showToast('warning', 'No saved layout found for this floor yet; starting with empty overrides');
    } finally {
      setIsLoadingLayout(false);
    }
  }, [projectId, layoutByFloor, connectionDraftsByFloor]);

  useEffect(() => {
    loadFloorOptions();
  }, [loadFloorOptions]);

  useEffect(() => {
    if (!projectId || !selectedLayoutFloorId) return;
    loadLayoutForFloor(selectedLayoutFloorId);
  }, [projectId, selectedLayoutFloorId, loadLayoutForFloor]);

  const selectedRunSource: RunSource = activeCase
    ? (selectedRunSourceByCase[activeCase.id] ?? (activeCase.runSource === 'openfoam' ? 'openfoam' : 'internal'))
    : 'internal';

  const selectedProjectName = useMemo(
    () => projects.find((project) => project.id === projectId)?.name
      ?? projects.find((project) => project.id === selectedProjectId)?.name
      ?? 'Simulation Project',
    [projects, projectId, selectedProjectId],
  );

  const selectedFloor = floorOptions.find((floor) => floor.id === selectedLayoutFloorId) ?? null;
  const activeConnectionDrafts = useMemo(
    () => (selectedLayoutFloorId
      ? (connectionDraftsByFloor[selectedLayoutFloorId] ?? [])
      : []),
    [selectedLayoutFloorId, connectionDraftsByFloor],
  );

  const updateConnectionDraft = useCallback((connectionId: string, updates: Partial<LayoutConnectionOverride>) => {
    if (!selectedLayoutFloorId) return;

    setConnectionDraftsByFloor((prev) => {
      const current = prev[selectedLayoutFloorId] ?? [];
      return {
        ...prev,
        [selectedLayoutFloorId]: current.map((connection) =>
          connection.id === connectionId
            ? normalizeConnectionOverride({ ...connection, ...updates })
            : connection,
        ),
      };
    });
  }, [selectedLayoutFloorId]);

  const removeConnectionDraft = useCallback((connectionId: string) => {
    if (!selectedLayoutFloorId) return;

    setConnectionDraftsByFloor((prev) => {
      const current = prev[selectedLayoutFloorId] ?? [];
      return {
        ...prev,
        [selectedLayoutFloorId]: current.filter((connection) => connection.id !== connectionId),
      };
    });
  }, [selectedLayoutFloorId]);

  const addConnectionDraft = useCallback(() => {
    if (!selectedLayoutFloorId || !selectedFloor) return;

    if (selectedFloor.rooms.length < 2) {
      showToast('warning', 'This floor needs at least 2 rooms to define a connection override');
      return;
    }

    const next: LayoutConnectionOverride = {
      id: `override-${crypto.randomUUID()}`,
      fromRoomId: selectedFloor.rooms[0].id,
      toRoomId: selectedFloor.rooms[1].id,
      type: 'door',
      openingAreaM2: 2,
      resistance: 1,
      enabled: true,
    };

    setConnectionDraftsByFloor((prev) => {
      const current = prev[selectedLayoutFloorId] ?? [];
      return {
        ...prev,
        [selectedLayoutFloorId]: [...current, next],
      };
    });
  }, [selectedLayoutFloorId, selectedFloor]);

  const saveConnectionOverrides = useCallback(async () => {
    if (!projectId || !selectedLayoutFloorId) return;

    const baseLayout = layoutByFloor[selectedLayoutFloorId] ?? DEFAULT_LAYOUT_SNAPSHOT;
    const normalizedOverrides = sanitizeConnectionOverrides(activeConnectionDrafts);

    setIsSavingOverrides(true);
    try {
      const res = await authFetch(`/api/projects/${encodeURIComponent(projectId)}/simulation-layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorId: selectedLayoutFloorId,
          hvacPlacements: baseLayout.hvacPlacements,
          tilePlacements: baseLayout.tilePlacements,
          connectionOverrides: normalizedOverrides,
          canvasScale: baseLayout.canvasScale,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === 'string' ? err.error : 'Failed to save connection overrides');
      }

      setConnectionDraftsByFloor((prev) => ({
        ...prev,
        [selectedLayoutFloorId]: normalizedOverrides,
      }));

      showToast('success', `Saved ${normalizedOverrides.length} connection override(s)`);

      if (activeCase?.simulationScope === 'building') {
        if (activeCase.status === 'running' || activeCase.status === 'queued') {
          showToast('warning', 'Overrides saved. Rebuild skipped because the active case is running/queued.');
          return;
        }

        await updateCase(activeCase.id, {
          rebuildBuildingGeometryFromProject: true,
        });
      }
    } catch (error) {
      console.error('saveConnectionOverrides error:', error);
      showToast('error', error instanceof Error ? error.message : 'Failed to save connection overrides');
    } finally {
      setIsSavingOverrides(false);
    }
  }, [
    projectId,
    selectedLayoutFloorId,
    layoutByFloor,
    activeConnectionDrafts,
    activeCase,
    updateCase,
  ]);

  const buildingVisualization = activeCase?.simulationScope === 'building'
    ? (activeRun?.buildingVisualization ?? runHistory.find((run) => run.buildingVisualization)?.buildingVisualization ?? null)
    : null;

  const metricsSourceRun = useMemo(
    () => {
      if (activeRun?.metricsSnapshot) return activeRun;
      return runHistory.find((run) => run.metricsSnapshot) ?? null;
    },
    [activeRun, runHistory],
  );

  const engineeringMetrics: SimulationMetrics | null = metricsSourceRun?.metricsSnapshot ?? null;

  const handleExportMetricsCsv = useCallback(() => {
    if (!engineeringMetrics) {
      showToast('warning', 'No metrics available. Run a simulation first.');
      return;
    }

    exportMetricsCSV(engineeringMetrics);
    showToast('success', 'Metrics CSV exported');
  }, [engineeringMetrics]);

  const handleExportEngineeringReport = useCallback(async (format: 'pdf' | 'csv' | 'json') => {
    if (!activeCase || !engineeringMetrics || !projectId) {
      showToast('warning', 'No engineering metrics available to export');
      return;
    }

    setReportExporting(format);
    try {
      const totalHeatKw = activeCase.simulationScope === 'building'
        ? (activeCase.buildingGeometry?.rooms.reduce((sum, room) => sum + room.heatLoadW, 0) ?? 0) / 1000
        : activeCase.geometry.racks.reduce((sum, rack) => sum + rack.powerKW, 0);

      const totalCoolingKw = activeCase.geometry.hvacUnits.reduce((sum, unit) => sum + unit.capacityKW, 0);
      const report = buildSimulationEngineeringReport({
        projectId,
        projectName: selectedProjectName,
        floorId: selectedLayoutFloorId || activeCase.geometry.roomId || 'unknown-floor',
        runtimeMode: metricsSourceRun?.source ?? activeCase.runSource,
        config: toEngineeringReportConfig(activeCase),
        rackCount: activeCase.geometry.racks.length,
        hvacCount: activeCase.geometry.hvacUnits.length,
        tileCount: activeCase.geometry.tiles.length,
        totalHeatKw,
        totalCoolingKw,
        result: null,
        resultMetrics: engineeringMetrics,
        resultIteration: metricsSourceRun?.currentIteration,
      });

      if (format === 'pdf') {
        await exportSimulationReportPdf(report);
      } else if (format === 'csv') {
        exportSimulationReportCsv(report);
      } else {
        exportSimulationReportJson(report);
      }

      try {
        await appendSimulationReportHistory(report, format, 'engine');
      } catch (historyError) {
        console.warn('Failed to persist simulation report history:', historyError);
      }

      showToast('success', `${format.toUpperCase()} engineering report exported`);
    } catch (error) {
      console.error('handleExportEngineeringReport error:', error);
      showToast('error', 'Failed to export engineering report');
    } finally {
      setReportExporting(null);
    }
  }, [
    activeCase,
    engineeringMetrics,
    metricsSourceRun,
    projectId,
    selectedLayoutFloorId,
    selectedProjectName,
  ]);

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
      simulationScope: newCaseScope,
      geometry,
    });
    setShowCreateForm(false);
    setNewCaseName('');
    setNewCaseScope('room');
  }, [newCaseName, newCaseScope, geometry, createCase]);

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

  const formatRunTimestamp = useCallback((value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const handleRunSourceChange = useCallback((nextSource: RunSource) => {
    if (!activeCase) return;
    setSelectedRunSourceByCase((prev) => ({ ...prev, [activeCase.id]: nextSource }));
  }, [activeCase]);

  const handleImportResultsFromFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importResults(data.fields || data, data.source);
    } catch {
      // Errors are surfaced by the store action.
    }
  }, [importResults]);

  const handleAddContourSlice = useCallback(() => {
    addContourSlice({
      id: crypto.randomUUID(),
      field: 'temperature',
      orientation: 'xy',
      position: 1.5,
      levels: 20,
      colorMap: 'jet',
      opacity: 0.5,
      showLines: false,
    });
  }, [addContourSlice]);

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
                <p className="mt-0.5 text-muted-foreground">
                  {c.simulationScope === 'building'
                    ? `${c.runSource} · building · ${c.buildingGeometry?.rooms.length ?? 0} room(s)`
                    : `${c.runSource} · ${c.geometry.lengthM}×${c.geometry.widthM}×${c.geometry.heightM}m`}
                </p>
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
              <div>
                <label className="text-[10px] text-muted-foreground">Simulation Scope</label>
                <select
                  value={newCaseScope}
                  onChange={(e) => setNewCaseScope(e.target.value as 'room' | 'building')}
                  className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                >
                  <option value="room">Room (single-domain)</option>
                  <option value="building">Building (multi-room)</option>
                </select>
              </div>
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

        {/* Connection Overrides */}
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Connection Overrides</h3>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => selectedLayoutFloorId && loadLayoutForFloor(selectedLayoutFloorId, true)}
              disabled={!projectId || !selectedLayoutFloorId || isLoadingLayout}
            >
              {isLoadingLayout ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            </Button>
          </div>

          {!projectId && (
            <p className="text-xs text-muted-foreground">Load a project to edit building connection overrides.</p>
          )}

          {projectId && (
            <>
              <div>
                <label className="text-[10px] text-muted-foreground">Floor</label>
                <select
                  value={selectedLayoutFloorId}
                  onChange={(event) => setSelectedLayoutFloorId(event.target.value)}
                  className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  disabled={isLoadingFloors || floorOptions.length === 0}
                >
                  <option value="">Select a floor...</option>
                  {floorOptions.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      L{floor.floorNumber} - {floor.name}
                    </option>
                  ))}
                </select>
              </div>

              {isLoadingFloors && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> Loading floors...
                </div>
              )}

              {!isLoadingFloors && selectedFloor && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {selectedFloor.rooms.length} room(s) on this floor. Overrides control inferred adjacency links.
                </p>
              )}

              <div className="mt-2 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={addConnectionDraft}
                  disabled={!selectedFloor || selectedFloor.rooms.length < 2}
                >
                  <Plus size={12} className="mr-1" /> Add
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={saveConnectionOverrides}
                  disabled={!selectedLayoutFloorId || isSavingOverrides}
                >
                  {isSavingOverrides ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                  Save
                </Button>
              </div>

              {selectedLayoutFloorId && activeConnectionDrafts.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">No overrides defined for this floor.</p>
              )}

              {selectedLayoutFloorId && activeConnectionDrafts.length > 0 && (
                <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {activeConnectionDrafts.map((override, index) => (
                    <div key={override.id} className="rounded-md border border-border/70 p-2 text-[10px]">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">Override {index + 1}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={() => removeConnectionDraft(override.id)}
                        >
                          <Trash2 size={10} />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-muted-foreground">From Room</label>
                          <select
                            value={override.fromRoomId}
                            onChange={(event) => updateConnectionDraft(override.id, { fromRoomId: event.target.value })}
                            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                          >
                            {selectedFloor?.rooms.map((room) => (
                              <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-muted-foreground">To Room</label>
                          <select
                            value={override.toRoomId}
                            onChange={(event) => updateConnectionDraft(override.id, { toRoomId: event.target.value })}
                            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                          >
                            {selectedFloor?.rooms.map((room) => (
                              <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-muted-foreground">Type</label>
                          <select
                            value={override.type}
                            onChange={(event) => {
                              const nextType = event.target.value as LayoutConnectionOverride['type'];
                              updateConnectionDraft(override.id, { type: nextType });
                            }}
                            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                          >
                            <option value="door">Door</option>
                            <option value="duct">Duct</option>
                            <option value="shaft">Shaft</option>
                            <option value="transfer">Transfer</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-muted-foreground">Opening Area (m2)</label>
                          <input
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={override.openingAreaM2}
                            onChange={(event) => {
                              updateConnectionDraft(override.id, {
                                openingAreaM2: Number(event.target.value) || 0.1,
                              });
                            }}
                            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] text-muted-foreground">Resistance</label>
                          <input
                            type="number"
                            min={0.01}
                            step={0.05}
                            value={override.resistance}
                            onChange={(event) => {
                              updateConnectionDraft(override.id, {
                                resistance: Number(event.target.value) || 0.01,
                              });
                            }}
                            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                          />
                        </div>

                        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={override.enabled}
                            onChange={(event) => updateConnectionDraft(override.id, { enabled: event.target.checked })}
                          />
                          Enabled
                        </label>
                      </div>

                      {override.fromRoomId === override.toRoomId && (
                        <p className="mt-1 text-destructive">From and To room must be different. This entry will be ignored on save.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeCase?.simulationScope === 'building' && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Saving overrides automatically rebuilds geometry + mesh for the active building case.
                </p>
              )}
            </>
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
                  <Badge variant="outline">
                    {activeCase.simulationScope === 'building' ? 'Building Scope' : 'Room Scope'}
                  </Badge>
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

            {activeCase.simulationScope === 'building' && activeCase.buildingGeometry ? (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Building CFD 3D View</h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={buildingOverlayMode}
                      onChange={(event) => setBuildingOverlayMode(event.target.value as 'temperature' | 'velocity' | 'flow')}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      aria-label="Building overlay mode"
                    >
                      <option value="temperature">Temperature Overlay</option>
                      <option value="velocity">Velocity Overlay</option>
                      <option value="flow">Connection Flow Overlay</option>
                    </select>
                    <span className="text-[11px] text-muted-foreground">
                      {buildingVisualization
                        ? `Iteration ${buildingVisualization.iteration}`
                        : 'Awaiting run data'}
                    </span>
                  </div>
                </div>

                <BuildingSimulationViewer3D
                  building={activeCase.buildingGeometry}
                  visualization={buildingVisualization}
                  overlayMode={buildingOverlayMode}
                />

                {!buildingVisualization && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Run an internal building simulation to populate temperature, velocity, and connection flow overlays.
                  </p>
                )}
              </Card>
            ) : (
              <MeshSlicePreview
                geometry={activeCase.geometry}
                contourSlices={contourSlices}
                cellSizeM={activeCase.mesh?.cellSizeM}
              />
            )}

            {/* Geometry Summary */}
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Layers size={14} /> Geometry & Mesh
              </h3>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">{activeCase.simulationScope === 'building' ? 'Building' : 'Room'}</span>
                  <p className="font-mono">
                    {activeCase.geometry.lengthM}×{activeCase.geometry.widthM}×{activeCase.geometry.heightM}m
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Rooms</span>
                  <p className="font-mono">
                    {activeCase.simulationScope === 'building'
                      ? (activeCase.buildingGeometry?.rooms.length ?? 0)
                      : 1}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Connections</span>
                  <p className="font-mono">
                    {activeCase.simulationScope === 'building'
                      ? (activeCase.buildingGeometry?.connections.length ?? 0)
                      : 0}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Heat Sources</span>
                  <p className="font-mono">
                    {activeCase.simulationScope === 'building'
                      ? (activeCase.buildingGeometry?.rooms.filter((room) => room.heatLoadW > 0).length ?? 0)
                      : activeCase.geometry.racks.length}
                  </p>
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
              <SimulationRunProgressCard
                title="Run Progress"
                status={activeRun.status}
                iteration={activeRun.currentIteration}
                totalIterations={activeRun.totalIterations}
                elapsedSeconds={activeRun.elapsedSeconds}
                source={activeRun.source}
                residual={activeRun.residuals.length > 0 ? {
                  continuity: activeRun.residuals[activeRun.residuals.length - 1].continuity,
                  momentumX: activeRun.residuals[activeRun.residuals.length - 1].momentumX,
                  momentumY: activeRun.residuals[activeRun.residuals.length - 1].momentumY,
                  momentumZ: activeRun.residuals[activeRun.residuals.length - 1].momentumZ,
                  energy: activeRun.residuals[activeRun.residuals.length - 1].energy,
                  k: activeRun.residuals[activeRun.residuals.length - 1].k,
                  epsilon: activeRun.residuals[activeRun.residuals.length - 1].epsilon,
                } : null}
                errorMessage={activeRun.errorMessage}
                successMessage={activeRun.status === 'completed' ? 'Run completed successfully' : undefined}
              />
            )}
          </>
        )}
      </div>

      <SimulationEngineRightPanel
        selectedRunSource={selectedRunSource}
        activeCase={activeCase}
        onRunSourceChange={handleRunSourceChange}
        onStartRun={startRun}
        isPolling={isPolling}
        runHistory={runHistory}
        activeRun={activeRun}
        isLoadingRunHistory={isLoadingRunHistory}
        onRefreshRunHistory={loadRunHistory}
        formatRunTimestamp={formatRunTimestamp}
        metricsSourceRun={metricsSourceRun}
        engineeringMetrics={engineeringMetrics}
        onExportMetricsCsv={handleExportMetricsCsv}
        onExportEngineeringReport={handleExportEngineeringReport}
        reportExporting={reportExporting}
        onExportOpenFoam={handleExport}
        isExporting={isExporting}
        onImportResultsFromFile={handleImportResultsFromFile}
        isImporting={isImporting}
        contourSlices={contourSlices}
        onAddContourSlice={handleAddContourSlice}
        onUpdateContourSlice={updateContourSlice}
        onRemoveContourSlice={removeContourSlice}
      />
    </div>
  );
}
