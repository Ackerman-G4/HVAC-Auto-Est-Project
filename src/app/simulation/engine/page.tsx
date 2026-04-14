'use client';

/**
 * Simulation Engine Workspace — Case Management & CFD Execution
 *
 * Left:   Case list + geometry builder + physics/solver config
 * Center: 3D mesh preview + contour slice viewer
 * Right:  Run control, residual convergence, export/import
 */
import React, { useState, useCallback } from 'react';
import {
  Plus, Play, Download, Upload, Trash2, RefreshCw,
  Box, Settings2, Layers, BarChart3,
  AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSimulationEngineStore } from '@/stores/simulation-engine-store';
import type {
  GeometryInput,
  CaseStatus,
  ContourSliceConfig,
} from '@/types/simulation';

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
    activeRun, startRun, isPolling,
    exportOpenFOAM, importResults, isExporting, isImporting,
    contourSlices, addContourSlice, removeContourSlice, updateContourSlice,
  } = useSimulationEngineStore();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');

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
          <label className="text-xs font-medium text-muted-foreground">Project ID</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              placeholder="Enter project ID..."
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
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
