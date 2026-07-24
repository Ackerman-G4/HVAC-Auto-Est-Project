'use client';

import {
  Clock3,
  Download,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatMetric } from '@/lib/simulation/engine/page-helpers';
import type {
  ContourSliceConfig,
  FieldName,
  RunJob,
  RunSource,
  SimulationCase,
  SimulationMetrics,
} from '@/types/simulation';

interface SimulationEngineRightPanelProps {
  selectedRunSource: RunSource;
  activeCase: SimulationCase | null;
  onRunSourceChange: (nextSource: RunSource) => void;
  onStartRun: (source: RunSource) => void;
  isPolling: boolean;

  runHistory: RunJob[];
  activeRun: RunJob | null;
  isLoadingRunHistory: boolean;
  onRefreshRunHistory: (caseId: string) => void;
  formatRunTimestamp: (value?: string) => string;

  metricsSourceRun: RunJob | null;
  engineeringMetrics: SimulationMetrics | null;
  onExportMetricsCsv: () => void;
  onExportEngineeringReport: (format: 'pdf' | 'csv' | 'json') => void;
  reportExporting: 'pdf' | 'csv' | 'json' | null;

  onExportOpenFoam: () => void;
  isExporting: boolean;
  onImportResultsFromFile: (file: File) => Promise<void>;
  isImporting: boolean;

  contourSlices: ContourSliceConfig[];
  onAddContourSlice: () => void;
  onUpdateContourSlice: (id: string, updates: Partial<ContourSliceConfig>) => void;
  onRemoveContourSlice: (id: string) => void;
}

export default function SimulationEngineRightPanel({
  selectedRunSource,
  activeCase,
  onRunSourceChange,
  onStartRun,
  isPolling,

  runHistory,
  activeRun,
  isLoadingRunHistory,
  onRefreshRunHistory,
  formatRunTimestamp,

  metricsSourceRun,
  engineeringMetrics,
  onExportMetricsCsv,
  onExportEngineeringReport,
  reportExporting,

  onExportOpenFoam,
  isExporting,
  onImportResultsFromFile,
  isImporting,

  contourSlices,
  onAddContourSlice,
  onUpdateContourSlice,
  onRemoveContourSlice,
}: SimulationEngineRightPanelProps) {
  return (
    <div className="flex w-64 shrink-0 flex-col gap-3">
      {/* Run Controls */}
      <Card className="p-3">
        <h3 className="mb-2 text-sm font-semibold">Run Controls</h3>
        <div className="space-y-1.5">
          <select
            value={selectedRunSource}
            onChange={(event) => onRunSourceChange(event.target.value as RunSource)}
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
            onClick={() => onStartRun(selectedRunSource)}
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
            onClick={() => activeCase && onRefreshRunHistory(activeCase.id)}
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
                      Cont {latestResidual.continuity.toExponential(1)} - Mom {latestResidual.momentumX.toExponential(1)} - E {latestResidual.energy.toExponential(1)}
                    </p>
                  )}

                  {run.buildingVisualization && (
                    <p className="mt-1 text-emerald-600">Building overlay payload available</p>
                  )}

                  {run.metricsSnapshot && (
                    <p className="mt-1 text-sky-600">Engineering metrics available</p>
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

      {/* Engineering Results */}
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Engineering Results</h3>
          <span className="text-[10px] text-muted-foreground">
            {metricsSourceRun ? `Iter ${metricsSourceRun.currentIteration}` : 'No run data'}
          </span>
        </div>

        {!engineeringMetrics && (
          <p className="text-xs text-muted-foreground">Run a solver to populate engineering metrics.</p>
        )}

        {engineeringMetrics && (
          <>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">Max Temp</p>
                <p className="font-mono">{formatMetric(engineeringMetrics.maxTemperature, 2)} C</p>
              </div>
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">Avg Temp</p>
                <p className="font-mono">{formatMetric(engineeringMetrics.avgTemperature, 2)} C</p>
              </div>
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">Max Velocity</p>
                <p className="font-mono">{formatMetric(engineeringMetrics.maxVelocity, 3)} m/s</p>
              </div>
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">PUE</p>
                <p className="font-mono">{formatMetric(engineeringMetrics.pue, 3)}</p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">Airflow Balance</p>
                <p className="font-mono">{formatMetric(engineeringMetrics.airflowBalanceM3s, 4)} m3/s</p>
              </div>
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">Pressure Imbalance</p>
                <p className="font-mono">{formatMetric(engineeringMetrics.pressureImbalancePa, 4)} Pa</p>
              </div>
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">Ventilation Effectiveness</p>
                <p className="font-mono">{formatMetric((engineeringMetrics.ventilationEffectiveness ?? 0) * 100, 1)}%</p>
              </div>
              <div className="rounded border border-border/70 p-1.5">
                <p className="text-muted-foreground">Dead Zone Ratio</p>
                <p className="font-mono">{formatMetric((engineeringMetrics.deadZoneRatio ?? 0) * 100, 1)}%</p>
              </div>
            </div>

            {(engineeringMetrics.roomMetrics ?? []).length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[10px] text-muted-foreground">Per-Room Metrics</p>
                <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {engineeringMetrics.roomMetrics?.map((room) => (
                    <div key={room.roomId} className="rounded border border-border/60 p-1.5 text-[9px]">
                      <p className="font-medium">{room.roomId}</p>
                      <p className="text-muted-foreground">
                        T {formatMetric(room.avgTemperature, 2)} C - v {formatMetric(room.meanVelocity, 3)} m/s - p {formatMetric(room.pressure, 2)} Pa
                      </p>
                      <p className="text-muted-foreground">
                        In {formatMetric(room.inflowM3s, 3)} / Out {formatMetric(room.outflowM3s, 3)} m3/s - Stag {(room.stagnationRatio * 100).toFixed(1)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 space-y-1.5">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={onExportMetricsCsv}
              >
                Export Metrics CSV
              </Button>

              <div className="grid grid-cols-3 gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px]"
                  onClick={() => onExportEngineeringReport('json')}
                  disabled={reportExporting !== null}
                >
                  {reportExporting === 'json' ? <Loader2 size={11} className="animate-spin" /> : 'JSON'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px]"
                  onClick={() => onExportEngineeringReport('csv')}
                  disabled={reportExporting !== null}
                >
                  {reportExporting === 'csv' ? <Loader2 size={11} className="animate-spin" /> : 'CSV'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px]"
                  onClick={() => onExportEngineeringReport('pdf')}
                  disabled={reportExporting !== null}
                >
                  {reportExporting === 'pdf' ? <Loader2 size={11} className="animate-spin" /> : 'PDF'}
                </Button>
              </div>
            </div>
          </>
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
            onClick={onExportOpenFoam}
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
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                await onImportResultsFromFile(file);
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
          onClick={onAddContourSlice}
        >
          <Plus size={12} className="mr-1" /> Add Slice
        </Button>

        <div className="space-y-2">
          {contourSlices.map((slice) => (
            <div key={slice.id} className="rounded border border-border p-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{slice.field} - {slice.orientation}</span>
                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onRemoveContourSlice(slice.id)}>
                  <Trash2 size={10} />
                </Button>
              </div>
              <div className="mt-1 flex gap-1">
                <select
                  value={slice.field}
                  onChange={(e) => onUpdateContourSlice(slice.id, { field: e.target.value as FieldName })}
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
                  onChange={(e) => onUpdateContourSlice(slice.id, { orientation: e.target.value as ContourSliceConfig['orientation'] })}
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
                  onChange={(e) => onUpdateContourSlice(slice.id, { position: Number(e.target.value) })}
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
                  onChange={(e) => onUpdateContourSlice(slice.id, { opacity: Number(e.target.value) })}
                  className="w-full"
                />
                <span>{slice.opacity.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}