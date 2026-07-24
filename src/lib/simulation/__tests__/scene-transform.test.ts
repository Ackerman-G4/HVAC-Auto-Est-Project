import { describe, it, expect } from 'vitest';
import {
  getDomainCenter,
  getDomainBBox,
  computeCameraFit,
  worldToScene,
} from '@/lib/simulation/scene-transform';

describe('getDomainCenter / worldToScene', () => {
  it('centres the domain and maps world (x,y,z) → scene (x, z, y)', () => {
    const config = { gridSizeX: 20, gridSizeY: 20, gridSizeZ: 6, gridResolution: 0.5 };
    expect(getDomainCenter(config)).toEqual({ centerX: 5, centerZ: 5 });
    // world floor point (5,5) at elevation 0 → scene origin, Y-up
    expect(worldToScene({ x: 5, y: 5, z: 0 }, config)).toEqual([0, 0, 0]);
    // elevation goes to scene Y
    expect(worldToScene({ x: 5, y: 5, z: 2 }, config)).toEqual([0, 2, 0]);
  });
});

describe('computeCameraFit', () => {
  const fitFor = (gx: number, gy: number, gz: number, res: number) =>
    computeCameraFit(getDomainBBox({ gridSizeX: gx, gridSizeY: gy, gridSizeZ: gz, gridResolution: res }));

  it('targets the domain centre for a small room, a mid floor, and a large floor', () => {
    // 6 m room (12 cells @0.5), 25 m floor (50 cells), 40 m floor (80 cells @0.5)
    for (const [gx, gy] of [[12, 12], [50, 50], [80, 80]] as const) {
      const fit = fitFor(gx, gy, 6, 0.5);
      // centred domain → target X/Z at 0
      expect(fit.target[0]).toBeCloseTo(0, 6);
      expect(fit.target[2]).toBeCloseTo(0, 6);
    }
  });

  it('scales camera distance with domain size (no fixed constant)', () => {
    const small = fitFor(12, 12, 6, 0.5); // 6 m
    const large = fitFor(80, 80, 6, 0.5); // 40 m
    const dist = (p: [number, number, number]) => Math.hypot(p[0] - 0, p[2] - 0);
    expect(dist(large.position)).toBeGreaterThan(dist(small.position) * 3);
    expect(large.maxDistance).toBeGreaterThan(small.maxDistance);
  });

  it('produces sane, finite orbit limits', () => {
    const fit = fitFor(20, 20, 6, 0.5);
    expect(fit.minDistance).toBeGreaterThan(0);
    expect(fit.maxDistance).toBeGreaterThan(fit.minDistance);
    fit.position.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
