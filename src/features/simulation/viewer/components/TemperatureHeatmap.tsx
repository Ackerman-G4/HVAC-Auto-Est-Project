'use client';

import React from 'react';
import { useSimulationStore } from '@/stores/simulation-store';

// ─── Temperature Heatmap Component ──────────────────────────────────

export function TemperatureHeatmap() {
  const { result, selectedSliceZ, setSelectedSliceZ, config } = useSimulationStore();

  if (!result) {
    return (
      <div className="panel-glass flex h-64 items-center justify-center rounded-md border border-border/70 bg-card shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Run a simulation to see temperature distribution</p>
      </div>
    );
  }

  const slice = result.temperatureField.map(row =>
    row.map(col => col[selectedSliceZ] ?? 24)
  );

  const minT = Math.min(...slice.flat());
  const maxT = Math.max(...slice.flat());
  const range = maxT - minT || 1;

  function tempToColor(t: number): string {
    const ratio = (t - minT) / range;
    if (ratio < 0.25) return `rgb(${Math.round(ratio * 4 * 255)}, ${Math.round(ratio * 4 * 200)}, 255)`;
    if (ratio < 0.5) return `rgb(255, 255, ${Math.round((1 - (ratio - 0.25) * 4) * 255)})`;
    if (ratio < 0.75) return `rgb(255, ${Math.round((1 - (ratio - 0.5) * 4) * 200)}, 0)`;
    return `rgb(${Math.round((1 - (ratio - 0.75) * 4) * 255)}, 0, 0)`;
  }

  const cellSize = Math.min(24, Math.floor(600 / Math.max(config.gridSizeX, config.gridSizeY)));
  const gridPixelWidth = config.gridSizeX * cellSize;
  const gridPixelHeight = config.gridSizeY * cellSize;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">Temperature Distribution (Z = {selectedSliceZ})</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Height Layer:</label>
          <input
            type="range"
            min={0}
            max={config.gridSizeZ - 1}
            value={selectedSliceZ}
            onChange={e => setSelectedSliceZ(Number(e.target.value))}
            className="w-32"
            aria-label="Height Layer"
          />
          <span className="w-20 text-sm font-semibold tabular-nums text-foreground">
            {(selectedSliceZ * config.gridResolution).toFixed(1)}m
          </span>
        </div>
      </div>

      <div className="overflow-auto rounded-md border border-border bg-slate-900 p-4 shadow-sm">
        <svg
          width={gridPixelWidth}
          height={gridPixelHeight}
          viewBox={`0 0 ${gridPixelWidth} ${gridPixelHeight}`}
          role="img"
          aria-label="Temperature heatmap"
        >
          {slice.map((row, x) =>
            row.map((temp, y) => (
              <g key={`${x}-${y}`}>
                <title>{`(${x},${y}) ${temp.toFixed(1)}°C`}</title>
                <rect
                  x={x * cellSize}
                  y={y * cellSize}
                  width={Math.max(1, cellSize - 1)}
                  height={Math.max(1, cellSize - 1)}
                  rx={2}
                  ry={2}
                  fill={tempToColor(temp)}
                  fillOpacity={0.85}
                />
              </g>
            ))
          )}
        </svg>
      </div>

      {/* Color legend */}
      <div className="panel-glass mt-4 flex items-center gap-3 rounded-md border border-border/70 bg-card px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">{minT.toFixed(1)}°C</span>
        <div className="flex-1 h-3 rounded-full cfd-heatmap-legend" />
        <span className="text-sm font-medium text-muted-foreground">{maxT.toFixed(1)}°C</span>
      </div>
    </div>
  );
}
