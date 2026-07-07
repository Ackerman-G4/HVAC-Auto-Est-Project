/**
 * View-model derivation for the R3F <SimulationCanvas> (plan §5).
 *
 * Every layer takes plain, solver-agnostic props derived here from a
 * SimulationResult — the same snapshot shape produced by both the Preview
 * (internal) and Engineering (OpenFOAM) tiers. Nothing below knows which solver
 * ran; that is the whole point of the results contract (plan §5.1).
 */

import type { SimulationResult, Vec3 } from '@/types/simulation';

export interface TemperatureVoxel {
  /** Cell-centre position in render space (metres). */
  position: [number, number, number];
  /** Temperature in °C. */
  value: number;
  /** 0..1 normalized within [min,max]. */
  t: number;
}

export interface VelocitySample {
  position: [number, number, number];
  /** Unit direction. */
  direction: [number, number, number];
  /** Magnitude |U| in m/s. */
  magnitude: number;
  /** Local temperature (for optional colouring). */
  temperature: number;
}

export interface ViewerModel {
  dims: { nx: number; ny: number; nz: number };
  cellSize: number;
  extents: [number, number, number];
  temperatureRange: { min: number; max: number };
  velocityMax: number;
  temperatureVoxels: TemperatureVoxel[];
  velocitySamples: VelocitySample[];
}

/** Map render axes: sim (x,y,z) → three (x, z, y) per the field envelope. */
function toRenderPos(i: number, j: number, k: number, cs: number): [number, number, number] {
  return [(i + 0.5) * cs, (k + 0.5) * cs, (j + 0.5) * cs];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The plan's transfer function: blue → jade → copper → red across the field's
 * min/max. Returned as an [r,g,b] triple in 0..1.
 */
export function temperatureColor(t: number): [number, number, number] {
  const x = clamp01(t);
  // stops: 0 blue, 0.4 jade, 0.7 copper, 1 red
  const stops: Array<{ at: number; c: [number, number, number] }> = [
    { at: 0.0, c: [0.20, 0.45, 0.95] }, // blue
    { at: 0.4, c: [0.15, 0.75, 0.60] }, // jade
    { at: 0.7, c: [0.80, 0.50, 0.25] }, // copper
    { at: 1.0, c: [0.90, 0.25, 0.20] }, // red
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let s = 0; s < stops.length - 1; s++) {
    if (x >= stops[s].at && x <= stops[s + 1].at) {
      lo = stops[s];
      hi = stops[s + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const f = clamp01((x - lo.at) / span);
  return [
    lo.c[0] + (hi.c[0] - lo.c[0]) * f,
    lo.c[1] + (hi.c[1] - lo.c[1]) * f,
    lo.c[2] + (hi.c[2] - lo.c[2]) * f,
  ];
}

function vecLen(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Derive a view-model from a SimulationResult, downsampling to keep the voxel
 * and glyph counts within the performance budget (plan §5.3).
 */
export function deriveViewerModel(
  result: SimulationResult,
  opts?: { maxVoxels?: number; maxGlyphs?: number },
): ViewerModel {
  const nx = result.config.gridSizeX;
  const ny = result.config.gridSizeY;
  const nz = result.config.gridSizeZ;
  const cs = result.config.gridResolution || 0.25;
  const maxVoxels = opts?.maxVoxels ?? 20_000;
  const maxGlyphs = opts?.maxGlyphs ?? 4_000;

  const temp = result.temperatureField;
  const vel = result.velocityField;

  // Temperature range.
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const v = temp[i]?.[j]?.[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (v < tMin) tMin = v;
        if (v > tMax) tMax = v;
      }
    }
  }
  if (!Number.isFinite(tMin)) { tMin = 20; tMax = 30; }
  const tSpan = tMax - tMin || 1;

  const voxelStride = strideFor(nx, ny, nz, maxVoxels);
  const glyphStride = strideFor(nx, ny, nz, maxGlyphs);

  const temperatureVoxels: TemperatureVoxel[] = [];
  const velocitySamples: VelocitySample[] = [];
  let velocityMax = 0;

  for (let i = 0; i < nx; i += voxelStride) {
    for (let j = 0; j < ny; j += voxelStride) {
      for (let k = 0; k < nz; k += voxelStride) {
        const v = temp[i]?.[j]?.[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        temperatureVoxels.push({
          position: toRenderPos(i, j, k, cs),
          value: v,
          t: clamp01((v - tMin) / tSpan),
        });
      }
    }
  }

  for (let i = 0; i < nx; i += glyphStride) {
    for (let j = 0; j < ny; j += glyphStride) {
      for (let k = 0; k < nz; k += glyphStride) {
        const u = vel[i]?.[j]?.[k];
        if (!u) continue;
        const mag = vecLen(u);
        if (mag > velocityMax) velocityMax = mag;
        const dir: [number, number, number] = mag > 1e-6
          ? [u.x / mag, u.z / mag, u.y / mag]
          : [0, 1, 0];
        velocitySamples.push({
          position: toRenderPos(i, j, k, cs),
          direction: dir,
          magnitude: mag,
          temperature: temp[i]?.[j]?.[k] ?? tMin,
        });
      }
    }
  }

  return {
    dims: { nx, ny, nz },
    cellSize: cs,
    extents: [nx * cs, nz * cs, ny * cs],
    temperatureRange: { min: tMin, max: tMax },
    velocityMax,
    temperatureVoxels,
    velocitySamples,
  };
}

function strideFor(nx: number, ny: number, nz: number, budget: number): number {
  let stride = 1;
  const count = () => Math.ceil(nx / stride) * Math.ceil(ny / stride) * Math.ceil(nz / stride);
  while (count() > budget) stride += 1;
  return stride;
}
