'use client';

import { Card } from '@/components/ui/card';
import { clamp, fieldColor } from '@/lib/simulation/engine/page-helpers';
import type { ContourSliceConfig, GeometryInput } from '@/types/simulation';

interface MeshSlicePreviewProps {
  geometry: GeometryInput;
  contourSlices: ContourSliceConfig[];
  cellSizeM?: number;
}

export default function MeshSlicePreview({ geometry, contourSlices, cellSizeM }: MeshSlicePreviewProps) {
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
          {gridX}x{gridY} preview grid
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
          <span>Room: {lengthM.toFixed(1)}m x {widthM.toFixed(1)}m x {heightM.toFixed(1)}m</span>
          <span>Slices: {contourSlices.length}</span>
          <span>XY: {xySlices.length}</span>
          <span>YZ: {yzSlices.length}</span>
          <span>XZ: {xzSlices.length}</span>
        </div>
      </div>
    </Card>
  );
}