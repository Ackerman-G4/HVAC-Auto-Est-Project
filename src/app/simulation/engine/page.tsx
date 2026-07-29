'use client';

/**
 * Simulation Engine Workspace — Case Management & CFD Execution
 *
 * Left:   Case list + geometry builder + physics/solver config
 * Center: 3D mesh preview + contour slice viewer
 * Right:  Run control, residual convergence, export/import
 */
import dynamic from 'next/dynamic';
import {
  Plus, Play, Download, Upload, Trash2, RefreshCw,
  Settings2, Layers, BarChart3,
  AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Stagger, StaggerItem } from '@/components/ui/reveal';
import { SectionLabel } from '@/components/ui/section-label';
import AirflowViewer3D from '@/components/building/AirflowViewer3D';

// Strangler-pattern R3F viewer (plan §5.1): loaded client-only, mounted behind a
// toggle alongside the legacy viewer. Retire the old one only at parity.
const SimulationCanvas = dynamic(() => import('@/components/simulation/r3f/SimulationCanvas'), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[320px] place-items-center text-xs text-muted-foreground">Loading 3D viewer…</div>
  ),
});

// Ambient wireframe for the zero state — client-only (WebGL), no data.
const AmbientWireframe = dynamic(() => import('@/components/simulation/r3f/AmbientWireframe'), {
  ssr: false,
});
import type {
  ContourSliceConfig,
} from '@/types/simulation';

import {
  SNAPSHOT_FIELD_OPTIONS,
  SNAPSHOT_PREVIEW_MODES,
} from '@/features/simulation/engine/constants';
import { CaseStatusBadge } from '@/features/simulation/engine/components/CaseStatusBadge';
import { useSimulationEngine } from '@/features/simulation/engine/useSimulationEngine';


// ─── Main Page ──────────────────────────────────────────────────────


export default function SimulationEnginePage() {
  const {
    projectId,
    cases,
    isLoadingCases,
    loadCases,
    activeCase,
    selectCase,
    deleteCase,
    activeRun,
    runHistory,
    startRun,
    loadRunHistory,
    loadRunSnapshots,
    runSnapshots,
    selectedSnapshotIteration,
    activeSnapshot,
    isPolling,
    isLoadingSnapshots,
    isLoadingSnapshotDetail,
    loadSnapshotIteration,
    importResults,
    isExporting,
    isImporting,
    contourSlices,
    addContourSlice,
    removeContourSlice,
    updateContourSlice,
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
    showSnapshotTimelineHelpNote,
    setShowSnapshotTimelineHelpNote,
    snapshotPrefsSaveStatus,
    snapshotFieldLoadingMap,
    snapshotFieldErrorMap,
    hasInteractedWithSnapshotPrefsRef,
    projects,
    selectedSnapshotSeeds,
    snapshotRun,
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
  } = useSimulationEngine();

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
            <div className="space-y-1.5 py-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-md" />
              ))}
            </div>
          )}

          {!isLoadingCases && cases.length === 0 && projectId && (
            <p className="py-4 text-center text-xs text-muted-foreground">No simulation cases yet</p>
          )}

          {!isLoadingCases && cases.length > 0 && (
            <Stagger className="space-y-1.5">
              {cases.map((c) => (
                <StaggerItem key={c.id}>
                  <button
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
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="mt-3 space-y-2 rounded-md border border-border p-2">
              <input
                ref={newCaseInputRef}
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
          <EmptyState
            className="flex-1 border-none bg-transparent py-10"
            ghostPreview
            illustration={<AmbientWireframe className="h-full w-full" />}
            title={cases.length === 0 ? 'No simulation cases yet' : 'Select a simulation case'}
            description={
              cases.length === 0
                ? 'Define a room, pick a solver tier, and run airflow + thermal comfort in the browser.'
                : 'Choose a case from the list, or spin up a new one to preview the field here.'
            }
            action={
              <Button
                onClick={() => {
                  setShowCreateForm(true);
                  requestAnimationFrame(() => newCaseInputRef.current?.focus());
                }}
                disabled={!projectId}
              >
                <Plus size={14} /> Create your first simulation case
              </Button>
            }
          />
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
                        hasInteractedWithSnapshotPrefsRef.current = true;
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
                        hasInteractedWithSnapshotPrefsRef.current = true;
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
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Preview the new React Three Fiber viewer (plan §5)">
                      <input
                        type="checkbox"
                        checked={useR3FViewer}
                        onChange={(event) => setUseR3FViewer(event.target.checked)}
                        aria-label="Use new R3F viewer (beta)"
                      />
                      R3F viewer (beta)
                    </label>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      Iter {snapshotPreviewResult.iteration}
                    </Badge>
                  </div>
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
                      hasInteractedWithSnapshotPrefsRef.current = true;
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
                        hasInteractedWithSnapshotPrefsRef.current = true;
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
                <div className="canvas-ambient relative h-[360px] overflow-hidden rounded-md border border-border/60">
                  {/* Floating glass toolbar — view context stays next to what you're
                      looking at, not only in the far sidebar (plan §Phase 4). */}
                  <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
                    <span className="panel-glass rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-medium capitalize text-foreground shadow-sm">
                      {snapshotPreviewMode} field
                    </span>
                    <span className="panel-glass rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                      {useR3FViewer ? 'R3F viewer' : 'Legacy viewer'}
                    </span>
                  </div>
                  {useR3FViewer ? (
                    <SimulationCanvas
                      result={snapshotPreviewResult}
                      showTemperature={snapshotPreviewMode === 'temperature'}
                      showVelocity
                    />
                  ) : (
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
                  )}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Right Panel: Actions & Export/Import ───────────── */}
      <div className="flex w-64 shrink-0 flex-col gap-3">
        {/* Run Controls — solver tier split (plan §D2, §4.3) */}
        <Card className="elev-raised p-3">
          <SectionLabel icon={<Play size={12} />}>Run Controls</SectionLabel>
          <div className="space-y-2">
            <div className="rounded-md border border-accent/30 bg-accent/5 p-2">
              <Button
                size="sm"
                variant="accent"
                className="cta-glow w-full"
                onClick={() => startRun('internal')}
                disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
              >
                {isPolling ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Play size={12} className="mr-1.5" />}
                Run Preview
              </Button>
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                Instant, in-browser. Temperature, velocity, pressure &amp; humidity. Free tier.
              </p>
            </div>
            <div className="rounded-md border border-[color:color-mix(in_oklab,var(--copper)_45%,var(--border))] p-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full border-[color:color-mix(in_oklab,var(--copper)_55%,var(--border))] text-[color:var(--copper)] hover:bg-[color:color-mix(in_oklab,var(--copper)_12%,transparent)]"
                onClick={() => startRun('openfoam')}
                disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
              >
                <Play size={12} className="mr-1.5" />
                Run Engineering
              </Button>
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                OpenFOAM cloud solve (minutes). Defensible numbers. No humidity field.
              </p>
            </div>
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
        <Card className="elev-raised p-3">
          <SectionLabel icon={<Download size={12} />}>Export / Import</SectionLabel>
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
        <Card className="elev-raised flex-1 p-3">
          <SectionLabel icon={<Layers size={12} />}>Contour Slices</SectionLabel>
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
