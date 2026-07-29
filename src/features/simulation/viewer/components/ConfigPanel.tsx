'use client';

import React from 'react';
import { useSimulationStore } from '@/stores/simulation-store';

// ─── Simulation Config Panel ────────────────────────────────────────

export function ConfigPanel() {
  const { config, setConfig, runtimeMode, setRuntimeMode } = useSimulationStore();

  return (
    <div className="panel-glass grid grid-cols-2 gap-5 rounded-xl border border-border/70 bg-card p-6 shadow-sm md:grid-cols-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Resolution (m)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.1" value={config.gridResolution} onChange={e => setConfig({ gridResolution: +e.target.value })} aria-label="Grid Resolution" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size X</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeX} onChange={e => setConfig({ gridSizeX: +e.target.value })} aria-label="Grid Size X" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size Y</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeY} onChange={e => setConfig({ gridSizeY: +e.target.value })} aria-label="Grid Size Y" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size Z</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeZ} onChange={e => setConfig({ gridSizeZ: +e.target.value })} aria-label="Grid Size Z" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Iterations</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.iterations} onChange={e => setConfig({ iterations: +e.target.value })} aria-label="Iterations" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Convergence</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.001" value={config.convergence} onChange={e => setConfig({ convergence: +e.target.value })} aria-label="Convergence" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Time Step (s)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.01" value={config.timeStep} onChange={e => setConfig({ timeStep: +e.target.value })} aria-label="Time Step" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ambient Temp (°C)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.ambientTempC} onChange={e => setConfig({ ambientTempC: +e.target.value })} aria-label="Ambient Temperature" />
      </div>
      {/* Solver runtime controls — carried over from the retired workspace view,
          which was the only surface exposing these. dimensionMode is a real
          solver switch (cfd.worker.ts force2DFast), independent of `mode`. */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Execution Runtime</label>
        <select
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
          value={runtimeMode}
          onChange={e => setRuntimeMode(e.target.value as 'worker' | 'server' | 'openfoam')}
          aria-label="Execution Runtime"
        >
          <option value="worker">Web Worker (default)</option>
          <option value="server">Server API fallback</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Solver Dimensionality</label>
        <select
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
          value={config.dimensionMode ?? '3d'}
          onChange={e => setConfig({ dimensionMode: e.target.value as '3d' | '2d-fast' })}
          aria-label="Solver Dimensionality"
        >
          <option value="3d">3D engineering mode</option>
          <option value="2d-fast">2D fast approximation</option>
        </select>
      </div>
    </div>
  );
}
