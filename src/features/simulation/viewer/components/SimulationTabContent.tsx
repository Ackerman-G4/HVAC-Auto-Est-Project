'use client';

import type { useSimulationViewer } from '../useSimulationViewer';
import { Gauge, Play, RotateCcw, Sliders } from 'lucide-react';

type SimulationTabContentProps = Pick<
  ReturnType<typeof useSimulationViewer>,
  | 'racks'
  | 'isRunning'
  | 'result'
  | 'runSimulation'
  | 'setConfig'
  | 'setMode'
  | 'config'
  | 'selectedProjectId'
  | 'selectedFloorId'
>;

export function SimulationTabContent({
  racks,
  isRunning,
  result,
  runSimulation,
  setConfig,
  setMode,
  config,
  selectedProjectId,
  selectedFloorId,
}: SimulationTabContentProps) {
  return (
    <>
          <div className="space-y-5">
            {/* Run Simulation */}
            <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Run Simulation</h3>
              <button
                onClick={() => runSimulation(selectedProjectId || '', selectedFloorId || '')}
                disabled={racks.length === 0 || isRunning}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {isRunning ? <><RotateCcw size={18} className="animate-spin" /> Running Simulation...</> : <><Play size={18} /> Run CFD Simulation</>}
              </button>
              {racks.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Add equipment in the Equipment tab or auto-detect from project to enable simulation.</p>
              )}
            </div>

            {/* Mesh Density */}
            <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Sliders size={14} /> Mesh Density
              </h3>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Coarse</span>
                <input
                  type="range"
                  min={0.25}
                  max={2.0}
                  step={0.25}
                  value={config.gridResolution}
                  onChange={(e) => setConfig({ gridResolution: Number(e.target.value) })}
                  className="w-full"
                  aria-label="Grid resolution"
                />
                <span className="text-xs text-muted-foreground">Fine</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{config.gridResolution} m/cell</span>
                <span className="text-xs text-muted-foreground">
                  Grid: {config.gridSizeX}×{config.gridSizeY}×{config.gridSizeZ}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                {(['fast', 'balanced', 'engineering'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                      config.mode === m
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border bg-background text-muted-foreground hover:border-border'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Accuracy Indicator */}
            <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Gauge size={14} /> Accuracy Indicator
              </h3>
              {result ? (() => {
                const converged = result.metrics.converged;
                const residual = result.metrics.energyResidual;
                const iterPct = Math.min(100, Math.round((result.iteration / result.config.iterations) * 100));
                const qualityLabel = converged ? 'Converged' : residual < 0.01 ? 'Near-converged' : 'Not converged';
                const qualityColor = converged ? 'text-green-500' : residual < 0.01 ? 'text-yellow-500' : 'text-red-500';
                const barColor = converged ? 'bg-green-500' : residual < 0.01 ? 'bg-yellow-500' : 'bg-red-500';
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${qualityColor}`}>{qualityLabel}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{result.iteration}/{result.config.iterations} iters</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${iterPct}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Energy Residual</span>
                        <p className="font-semibold tabular-nums text-foreground">{residual.toExponential(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Momentum Residual</span>
                        <p className="font-semibold tabular-nums text-foreground">{result.metrics.momentumResidual.toExponential(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Max Divergence</span>
                        <p className="font-semibold tabular-nums text-foreground">{result.metrics.maxDivergence.toExponential(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Effective Δt</span>
                        <p className="font-semibold tabular-nums text-foreground">{result.effectiveTimeStep.toFixed(4)} s</p>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="flex flex-col items-center py-6 text-center">
                  <Gauge size={32} className="mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Run a simulation to see convergence data</p>
                </div>
              )}
            </div>
          </div>
    </>
  );
}
