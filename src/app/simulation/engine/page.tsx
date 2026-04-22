'use client';

/**
 * Simulation Engine Workspace — Case Management & CFD Execution
 *
 * Left:   Case list + geometry builder + physics/solver config
 * Center: 3D mesh preview + contour slice viewer
 * Right:  Run control, residual convergence, export/import
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Plus, Play, Download, Upload, Trash2, RefreshCw,
  Box, Settings2, Layers, Loader2, Clock3,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SimulationRunProgressCard from '@/components/building/SimulationRunProgressCard';
import { useSimulationEngineStore } from '@/stores/simulation-engine-store';
import { useProjectStore } from '@/stores/project-store';
import type {
  FieldName,
  GeometryInput,
  CaseStatus,
  ContourSliceConfig,
  RunSource,
} from '@/types/simulation';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SLICE_FIELD_COLORS: Record<FieldName, string> = {
  temperature: '#ef4444',
  velocity: '#3b82f6',
  pressure: '#f59e0b',
  humidity: '#10b981',
  turbulentViscosity: '#8b5cf6',
};

function fieldColor(field: FieldName): string {
  return SLICE_FIELD_COLORS[field] ?? '#94a3b8';
}

function MeshSlicePreview({
  geometry,
  contourSlices,
  cellSizeM,
}: {
  geometry: GeometryInput;
  contourSlices: ContourSliceConfig[];
  cellSizeM?: number;
}) {
  const lengthM = Math.max(0.1, geometry.lengthM);
  const widthM = Math.max(0.1, geometry.widthM);
  const heightM = Math.max(0.1, geometry.heightM);

  const xySlices = contourSlices.filter((slice) => slice.orientation === 'xy');
  const yzSlices = contourSlices.filter((slice) => slice.orientation === 'yz');
  const xzSlices = contourSlices.filter((slice) => slice.orientation === 'xz');

  const gridX = Math.max(2, Math.round(lengthM / Math.max(0.05, cellSizeM ?? 0.5)));
  const gridY = Math.max(2, Math.round(widthM / Math.max(0.05, cellSizeM ?? 0.5)));

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Mesh & Slice Visualization</h3>
        <span className="text-[11px] text-muted-foreground">
          {gridX}×{gridY} preview grid
        </span>
      </div>

      <div className="rounded-md border border-border bg-slate-950/70 p-2">
        <div
          className="relative h-56 w-full overflow-hidden rounded border border-slate-700/80"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(148,163,184,0.20) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(148,163,184,0.20) 1px, transparent 1px)
            `,
            backgroundSize: `${100 / gridX}% ${100 / gridY}%`,
          }}
        >
          {/* XY slices (horizontal planes) shown as tinted overlays. */}
          {xySlices.map((slice) => {
            const normalized = clamp(slice.position / heightM, 0, 1);
            const alpha = clamp((slice.opacity ?? 0.5) * (0.25 + normalized * 0.75), 0.08, 0.75);
            return (
              <div
                key={slice.id}
                className="absolute inset-0"
                style={{
                  backgroundColor: fieldColor(slice.field),
                  opacity: alpha,
                  border: slice.showLines ? `1px dashed ${fieldColor(slice.field)}` : undefined,
                }}
                title={`${slice.field} @ z=${slice.position.toFixed(2)}m`}
              />
            );
          })}

          {/* YZ slices (constant X) shown as vertical lines. */}
          {yzSlices.map((slice) => {
            const xPct = clamp((slice.position / lengthM) * 100, 0, 100);
            return (
              <div
                key={slice.id}
                className="absolute inset-y-0"
                style={{
                  left: `${xPct}%`,
                  width: 0,
                  borderLeft: `2px ${slice.showLines ? 'dashed' : 'solid'} ${fieldColor(slice.field)}`,
                  opacity: clamp(slice.opacity ?? 0.5, 0.2, 1),
                }}
                title={`${slice.field} @ x=${slice.position.toFixed(2)}m`}
              />
            );
          })}

          {/* XZ slices (constant Y) shown as horizontal lines. */}
          {xzSlices.map((slice) => {
            const yPct = clamp((slice.position / widthM) * 100, 0, 100);
            return (
              <div
                key={slice.id}
                className="absolute inset-x-0"
                style={{
                  top: `${yPct}%`,
                  height: 0,
                  borderTop: `2px ${slice.showLines ? 'dashed' : 'solid'} ${fieldColor(slice.field)}`,
                  opacity: clamp(slice.opacity ?? 0.5, 0.2, 1),
                }}
                title={`${slice.field} @ y=${slice.position.toFixed(2)}m`}
              />
            );
          })}

          {/* HVAC units */}
          {geometry.hvacUnits.map((unit) => {
            const left = clamp((unit.position.x / lengthM) * 100, 0, 100);
            const top = clamp((unit.position.y / widthM) * 100, 0, 100);
            const w = clamp((unit.width / lengthM) * 100, 1, 100);
            const h = clamp((unit.depth / widthM) * 100, 1, 100);
            return (
              <div
                key={unit.id}
                className="absolute rounded border border-emerald-200/70 bg-emerald-500/40"
                style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%` }}
                title={`HVAC: ${unit.name}`}
              />
            );
          })}

          {/* Racks */}
          {geometry.racks.map((rack) => {
            const left = clamp((rack.position.x / lengthM) * 100, 0, 100);
            const top = clamp((rack.position.y / widthM) * 100, 0, 100);
            const w = clamp((rack.width / lengthM) * 100, 1, 100);
            const h = clamp((rack.depth / widthM) * 100, 1, 100);
            return (
              <div
                key={rack.id}
                className="absolute rounded border border-indigo-200/70 bg-indigo-500/45"
                style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%` }}
                title={`Rack: ${rack.name}`}
              />
            );
          })}

          {/* Perforated tiles */}
          {geometry.tiles.map((tile, idx) => {
            const tileSize = Math.max(0.2, tile.tileSize || 0.6);
            const left = clamp(((tile.x * tileSize) / lengthM) * 100, 0, 100);
            const top = clamp(((tile.y * tileSize) / widthM) * 100, 0, 100);
            const sizeW = clamp((tileSize / lengthM) * 100, 0.4, 100);
            const sizeH = clamp((tileSize / widthM) * 100, 0.4, 100);

            return (
              <div
                key={`${tile.x}-${tile.y}-${idx}`}
                className="absolute rounded-[2px] border border-sky-100/75 bg-sky-400/45"
                style={{ left: `${left}%`, top: `${top}%`, width: `${sizeW}%`, height: `${sizeH}%` }}
                title={`Tile (${tile.x}, ${tile.y}) open=${Math.round(tile.openArea * 100)}%`}
              />
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>Room: {lengthM.toFixed(1)}m × {widthM.toFixed(1)}m × {heightM.toFixed(1)}m</span>
          <span>Slices: {contourSlices.length}</span>
          <span>XY: {xySlices.length}</span>
          <span>YZ: {yzSlices.length}</span>
          <span>XZ: {xzSlices.length}</span>
        </div>
      </div>
    </Card>
  );
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

// ─── Main Page ──────────────────────────────────────────────────────

export default function SimulationEnginePage() {
  const {
    projectId, setProjectId,
    cases, isLoadingCases, loadCases,
    activeCase, selectCase, createCase, deleteCase,
    activeRun, runHistory, isLoadingRunHistory, loadRunHistory, startRun, isPolling,
    exportOpenFOAM, importResults, isExporting, isImporting,
    contourSlices, addContourSlice, removeContourSlice, updateContourSlice,
  } = useSimulationEngineStore();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [selectedRunSource, setSelectedRunSource] = useState<RunSource>('internal');

  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (activeCase?.runSource === 'openfoam') {
      setSelectedRunSource('openfoam');
      return;
    }
    setSelectedRunSource('internal');
  }, [activeCase?.runSource]);

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

            <MeshSlicePreview
              geometry={activeCase.geometry}
              contourSlices={contourSlices}
              cellSizeM={activeCase.mesh?.cellSizeM}
            />

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

      {/* ── Right Panel: Actions & Export/Import ───────────── */}
      <div className="flex w-64 shrink-0 flex-col gap-3">
        {/* Run Controls */}
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-semibold">Run Controls</h3>
          <div className="space-y-1.5">
            <select
              value={selectedRunSource}
              onChange={(event) => setSelectedRunSource(event.target.value as RunSource)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              aria-label="Run Source"
              disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
            >
              <option value="internal">Internal Solver</option>
              <option value="openfoam">OpenFOAM</option>
            </select>
            <Button
              size="sm"
              className="w-full"
              onClick={() => startRun(selectedRunSource)}
              disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
            >
              {isPolling ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Play size={12} className="mr-1.5" />}
              Run Selected Solver
            </Button>
          </div>
        </Card>

        {/* Run Timeline */}
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock3 size={12} /> Run Timeline
            </h3>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={() => activeCase && loadRunHistory(activeCase.id)}
              disabled={!activeCase || isLoadingRunHistory}
            >
              {isLoadingRunHistory ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            </Button>
          </div>

          {!activeCase && (
            <p className="text-xs text-muted-foreground">Select a case to inspect run history.</p>
          )}

          {activeCase && isLoadingRunHistory && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Loading run timeline...
            </div>
          )}

          {activeCase && !isLoadingRunHistory && runHistory.length === 0 && (
            <p className="text-xs text-muted-foreground">No recorded runs for this case yet.</p>
          )}

          {runHistory.length > 0 && (
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {runHistory.map((run) => {
                const latestResidual = run.residuals.length > 0
                  ? run.residuals[run.residuals.length - 1]
                  : null;
                return (
                  <div
                    key={run.id}
                    className={`rounded-md border p-2 text-[10px] ${
                      activeRun?.id === run.id
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-border/70 bg-background/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold uppercase">{run.source}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                          run.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : run.status === 'failed'
                              ? 'bg-destructive/10 text-destructive'
                              : run.status === 'cancelled'
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-accent/10 text-accent'
                        }`}
                      >
                        {run.status}
                      </span>
                    </div>

                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
                      <span>Iter {run.currentIteration}/{run.totalIterations}</span>
                      <span>{run.elapsedSeconds.toFixed(1)}s</span>
                      <span className="col-span-2">{formatRunTimestamp(run.startedAt ?? run.createdAt)}</span>
                    </div>

                    {latestResidual && (
                      <p className="mt-1 font-mono text-muted-foreground">
                        Cont {latestResidual.continuity.toExponential(1)} · Mom {latestResidual.momentumX.toExponential(1)} · E {latestResidual.energy.toExponential(1)}
                      </p>
                    )}

                    {run.errorMessage && (
                      <p className="mt-1 text-destructive">{run.errorMessage}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                    value={slice.field}
                    onChange={(e) => updateContourSlice(slice.id, { field: e.target.value as FieldName })}
                    className="rounded border border-border bg-background px-1 text-[10px]"
                  >
                    <option value="temperature">temperature</option>
                    <option value="velocity">velocity</option>
                    <option value="pressure">pressure</option>
                    <option value="humidity">humidity</option>
                    <option value="turbulentViscosity">turbulentViscosity</option>
                  </select>
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
                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <label htmlFor={`opacity-${slice.id}`}>Opacity</label>
                  <input
                    id={`opacity-${slice.id}`}
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={slice.opacity}
                    onChange={(e) => updateContourSlice(slice.id, { opacity: Number(e.target.value) })}
                    className="w-full"
                  />
                  <span>{slice.opacity.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
