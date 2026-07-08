/**
 * Jet seeding for airflow particles (Wave 8).
 *
 * Supply air leaves the diffusers as coherent high-velocity jets. Seeding
 * particles uniformly across the room (the old Math.random() behaviour) scatters
 * them where no air actually moves; seeding them at the jets makes the overlay
 * read as air leaving the grilles — physically meaningful, and the single
 * biggest visual-credibility upgrade for the viewer.
 *
 * Pure and framework-free so it is unit-testable. When the field is still or
 * degenerate (no coherent jet), {@link computeJetSeeds} returns no seeds and the
 * caller falls back to exactly the old uniform behaviour.
 */

import type { Vec3 } from '@/types/simulation';

export interface JetSeed {
  /** World position of the seed cell centre (m), in (sizeX, sizeY, sizeZ) axes. */
  x: number;
  y: number;
  z: number;
  /** Sampling weight (∝ local speed). */
  weight: number;
}

export interface JetSeedField {
  seeds: JetSeed[];
  totalWeight: number;
  cellSize: number;
}

export interface JetSamplingSpec {
  resolution: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

export interface JetSeedOptions {
  /** Below this speed (m/s) a field is considered still — no jets. */
  minSpeed?: number;
  /** Cells faster than this fraction of the peak speed are jet cells. */
  peakFraction?: number;
  /** Cap the number of retained seeds (highest-weight kept). */
  maxSeeds?: number;
}

const DEFAULT_MIN_SPEED = 0.15;
const DEFAULT_PEAK_FRACTION = 0.5;
const DEFAULT_MAX_SEEDS = 256;

function speedOf(v: Vec3 | undefined): number {
  if (!v) return 0;
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Find the coherent high-|U| cells of a solved velocity field and return them as
 * weighted seed points at cell centres. Empty when the field is still.
 */
export function computeJetSeeds(
  velocityField: Vec3[][][] | undefined | null,
  spec: JetSamplingSpec,
  opts: JetSeedOptions = {},
): JetSeedField {
  const cellSize = spec.resolution;
  const empty: JetSeedField = { seeds: [], totalWeight: 0, cellSize };
  if (!velocityField || velocityField.length === 0) return empty;

  const minSpeed = opts.minSpeed ?? DEFAULT_MIN_SPEED;
  const peakFraction = opts.peakFraction ?? DEFAULT_PEAK_FRACTION;
  const maxSeeds = opts.maxSeeds ?? DEFAULT_MAX_SEEDS;

  // First pass: peak speed.
  let peak = 0;
  for (let i = 0; i < spec.sizeX; i++) {
    for (let j = 0; j < spec.sizeY; j++) {
      for (let k = 0; k < spec.sizeZ; k++) {
        const s = speedOf(velocityField[i]?.[j]?.[k]);
        if (s > peak) peak = s;
      }
    }
  }
  if (peak < minSpeed) return empty;

  const threshold = Math.max(minSpeed, peak * peakFraction);

  // Second pass: collect jet cells.
  const seeds: JetSeed[] = [];
  for (let i = 0; i < spec.sizeX; i++) {
    for (let j = 0; j < spec.sizeY; j++) {
      for (let k = 0; k < spec.sizeZ; k++) {
        const s = speedOf(velocityField[i]?.[j]?.[k]);
        if (s < threshold) continue;
        seeds.push({
          x: (i + 0.5) * cellSize,
          y: (j + 0.5) * cellSize,
          z: (k + 0.5) * cellSize,
          weight: s,
        });
      }
    }
  }
  if (seeds.length === 0) return empty;

  // Keep the strongest jets if there are too many.
  seeds.sort((a, b) => b.weight - a.weight);
  const kept = seeds.length > maxSeeds ? seeds.slice(0, maxSeeds) : seeds;
  const totalWeight = kept.reduce((sum, seed) => sum + seed.weight, 0);

  return { seeds: kept, totalWeight, cellSize };
}

/**
 * Weighted-sample a seed and add sub-cell jitter so particles fan out within the
 * diffuser face rather than stacking on cell centres. `rng` returns [0,1).
 * Returns null when there are no jets (caller falls back to uniform seeding).
 */
export function sampleJetSeed(field: JetSeedField, rng: () => number): Vec3 | null {
  if (field.seeds.length === 0 || field.totalWeight <= 0) return null;

  let r = rng() * field.totalWeight;
  let chosen = field.seeds[field.seeds.length - 1];
  for (const seed of field.seeds) {
    r -= seed.weight;
    if (r <= 0) {
      chosen = seed;
      break;
    }
  }

  const jitter = field.cellSize * 0.5;
  return {
    x: chosen.x + (rng() - 0.5) * jitter,
    y: chosen.y + (rng() - 0.5) * jitter,
    z: chosen.z + (rng() - 0.5) * jitter,
  };
}
