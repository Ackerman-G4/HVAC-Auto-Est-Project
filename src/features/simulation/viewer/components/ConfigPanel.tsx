'use client';

import React from 'react';
import { Field } from '@/components/ui/field';
import { useSimulationStore } from '@/stores/simulation-store';

// ─── Simulation Config Panel ────────────────────────────────────────

/**
 * Every control here had a visible `<label>` with no `htmlFor` plus an
 * `aria-label` repeating the same text. Screen readers announced the field, but
 * clicking the label did not focus it and the visible text was tied to nothing.
 * `Field` wires the pair once, so the duplicate aria-label is gone too.
 */

const CONTROL_CLASS =
  'w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm';

export function ConfigPanel() {
  const { config, setConfig, runtimeMode, setRuntimeMode } = useSimulationStore();

  return (
    <div className="panel-glass grid grid-cols-2 gap-5 rounded-md border border-border/70 bg-card p-6 shadow-sm md:grid-cols-4">
      <Field label="Grid resolution" unit="m">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            step="0.1"
            value={config.gridResolution}
            onChange={(e) => setConfig({ gridResolution: +e.target.value })}
          />
        )}
      </Field>

      <Field label="Grid size X">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            value={config.gridSizeX}
            onChange={(e) => setConfig({ gridSizeX: +e.target.value })}
          />
        )}
      </Field>

      <Field label="Grid size Y">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            value={config.gridSizeY}
            onChange={(e) => setConfig({ gridSizeY: +e.target.value })}
          />
        )}
      </Field>

      <Field label="Grid size Z">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            value={config.gridSizeZ}
            onChange={(e) => setConfig({ gridSizeZ: +e.target.value })}
          />
        )}
      </Field>

      <Field label="Iterations">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            value={config.iterations}
            onChange={(e) => setConfig({ iterations: +e.target.value })}
          />
        )}
      </Field>

      <Field label="Convergence">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            step="0.001"
            value={config.convergence}
            onChange={(e) => setConfig({ convergence: +e.target.value })}
          />
        )}
      </Field>

      <Field label="Time step" unit="s">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            step="0.01"
            value={config.timeStep}
            onChange={(e) => setConfig({ timeStep: +e.target.value })}
          />
        )}
      </Field>

      <Field label="Ambient temp" unit="°C">
        {(f) => (
          <input
            {...f}
            className={CONTROL_CLASS}
            type="number"
            value={config.ambientTempC}
            onChange={(e) => setConfig({ ambientTempC: +e.target.value })}
          />
        )}
      </Field>

      {/* Solver runtime controls — carried over from the retired workspace view,
          which was the only surface exposing these. dimensionMode is a real
          solver switch (cfd.worker.ts force2DFast), independent of `mode`. */}
      <Field label="Execution runtime">
        {(f) => (
          <select
            {...f}
            className={CONTROL_CLASS}
            value={runtimeMode}
            onChange={(e) => setRuntimeMode(e.target.value as 'worker' | 'server' | 'openfoam')}
          >
            <option value="worker">Web Worker (default)</option>
            <option value="server">Server API fallback</option>
          </select>
        )}
      </Field>

      <Field label="Solver dimensionality">
        {(f) => (
          <select
            {...f}
            className={CONTROL_CLASS}
            value={config.dimensionMode ?? '3d'}
            onChange={(e) => setConfig({ dimensionMode: e.target.value as '3d' | '2d-fast' })}
          >
            <option value="3d">3D engineering mode</option>
            <option value="2d-fast">2D fast approximation</option>
          </select>
        )}
      </Field>
    </div>
  );
}
