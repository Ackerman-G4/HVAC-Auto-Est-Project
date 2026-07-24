import { describe, it, expect } from 'vitest';
import { createGrid, computeMetrics } from '@/lib/functions/cfd-simulation';
import type { SimulationConfig, HVACUnit } from '@/types/simulation';

const config = {
  gridSizeX: 10,
  gridSizeY: 10,
  gridSizeZ: 4,
  gridResolution: 0.5,
  ambientTempC: 24,
  ambientHumidityRatio: 0.01,
  airViscosity: 1.5e-5,
} as unknown as SimulationConfig;

function hvacAt(x: number, y: number): HVACUnit {
  return {
    id: `h-${x}-${y}`, type: 'crac', name: `H ${x},${y}`,
    position: { x, y, z: 0 }, width: 1, depth: 1, height: 2,
    capacityKW: 30, capacityTR: 8.5, airflowCFM: 5000,
    supplyTempC: 14, returnTempC: 24, orientation: 0,
    powerInputKW: 10, status: 'active',
  };
}

describe('computeMetrics hotspots', () => {
  it('reports zero hotspots when the field is at ambient (trivial spread)', () => {
    const grid = createGrid(config);
    const metrics = computeMetrics(grid, [], [], config);
    expect(metrics.hotspots).toHaveLength(0);
  });

  it('reports a hot cell that is out in the open', () => {
    const grid = createGrid(config);
    grid.cells[5][5][1].temperature = 42;
    const metrics = computeMetrics(grid, [], [], config);
    expect(metrics.hotspots.length).toBeGreaterThan(0);
    // position is cell centre in metres
    const hs = metrics.hotspots[0];
    expect(hs.position.x).toBeCloseTo(5 * config.gridResolution, 5);
    expect(hs.position.y).toBeCloseTo(5 * config.gridResolution, 5);
    expect(hs.severity).toBe('emergency');
  });

  it('excludes a hot cell inside an HVAC unit footprint', () => {
    const grid = createGrid(config);
    // hot cell that sits under an HVAC unit occupying grid cols (2..3, 2..3)
    grid.cells[2][2][1].temperature = 42;
    // an equally hot cell out in the open
    grid.cells[7][7][1].temperature = 42;

    const unit = hvacAt(2 * config.gridResolution, 2 * config.gridResolution); // → posToGrid = (2,2)
    const metrics = computeMetrics(grid, [], [unit], config);

    const near = (hx: number, hy: number) =>
      metrics.hotspots.some(
        (h) => Math.abs(h.position.x - hx * config.gridResolution) < 1e-6
            && Math.abs(h.position.y - hy * config.gridResolution) < 1e-6,
      );

    expect(near(7, 7)).toBe(true);   // open hotspot reported
    expect(near(2, 2)).toBe(false);  // HVAC-occupied hotspot excluded
  });
});
