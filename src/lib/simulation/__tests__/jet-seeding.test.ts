import { describe, it, expect } from 'vitest';
import { computeJetSeeds, sampleJetSeed, type JetSamplingSpec } from '@/lib/simulation/jet-seeding';
import type { Vec3 } from '@/types/simulation';

const spec: JetSamplingSpec = { resolution: 0.5, sizeX: 6, sizeY: 6, sizeZ: 4 };

function field(fill: (i: number, j: number, k: number) => Vec3): Vec3[][][] {
  return Array.from({ length: spec.sizeX }, (_, i) =>
    Array.from({ length: spec.sizeY }, (_, j) =>
      Array.from({ length: spec.sizeZ }, (_, k) => fill(i, j, k)),
    ),
  );
}

// Deterministic RNG for weighted-sampling assertions.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('computeJetSeeds', () => {
  it('returns no seeds for a dead (all-zero) field', () => {
    const f = computeJetSeeds(field(() => ({ x: 0, y: 0, z: 0 })), spec);
    expect(f.seeds).toHaveLength(0);
    expect(f.totalWeight).toBe(0);
  });

  it('returns no seeds for a uniformly slow field (below minSpeed)', () => {
    const f = computeJetSeeds(field(() => ({ x: 0.01, y: 0, z: 0 })), spec);
    expect(f.seeds).toHaveLength(0);
  });

  it('finds a single supply jet as the coherent high-|U| cell', () => {
    // One fast cell at (1,1,3); everything else near-still.
    const f = computeJetSeeds(
      field((i, j, k) => (i === 1 && j === 1 && k === 3 ? { x: 0, y: 0, z: -2.5 } : { x: 0.02, y: 0, z: 0 })),
      spec,
    );
    expect(f.seeds.length).toBeGreaterThan(0);
    // Seed sits at the cell centre (1.5*.5, 1.5*.5, 3.5*.5) = (0.75, 0.75, 1.75).
    const top = f.seeds[0];
    expect(top.x).toBeCloseTo(0.75, 2);
    expect(top.y).toBeCloseTo(0.75, 2);
    expect(top.z).toBeCloseTo(1.75, 2);
  });

  it('weighted sampling favours the stronger of two jets', () => {
    const strong = { i: 0, j: 0, k: 0, v: { x: 0, y: 0, z: -3 } };
    const weak = { i: 5, j: 5, k: 3, v: { x: 0, y: 0, z: -1.6 } };
    const f = computeJetSeeds(
      field((i, j, k) => {
        if (i === strong.i && j === strong.j && k === strong.k) return strong.v;
        if (i === weak.i && j === weak.j && k === weak.k) return weak.v;
        return { x: 0, y: 0, z: 0 };
      }),
      spec,
      { peakFraction: 0.4 },
    );
    expect(f.seeds).toHaveLength(2);

    const rng = mulberry32(42);
    let nearStrong = 0;
    for (let n = 0; n < 400; n++) {
      const s = sampleJetSeed(f, rng)!;
      // strong jet centre x ≈ 0.25, weak jet centre x ≈ 2.75
      if (Math.abs(s.x - 0.25) < Math.abs(s.x - 2.75)) nearStrong++;
    }
    expect(nearStrong).toBeGreaterThan(200); // majority near the stronger jet
  });
});

describe('sampleJetSeed', () => {
  it('returns null for an empty field (caller falls back to uniform)', () => {
    const empty = computeJetSeeds(field(() => ({ x: 0, y: 0, z: 0 })), spec);
    expect(sampleJetSeed(empty, Math.random)).toBeNull();
  });
});
