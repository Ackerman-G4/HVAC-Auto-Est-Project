import { describe, it, expect } from 'vitest';
import { createGrid, placeRacks } from '@/lib/functions/cfd-simulation';
import { DEFAULT_CALIBRATION_COEFFICIENTS } from '@/types/simulation';
import type { SimulationConfig, ServerRack } from '@/types/simulation';

/**
 * The renderer treats `rack.position.z` as height above the floor, but the
 * solver used to hard-code every rack to grid layer 1 — so an elevated rack
 * drew in the air while its heat load stayed on the floor. These lock in both
 * halves of the fix: floor-standing racks must keep their exact previous
 * placement (no golden-field drift), and an elevated rack must actually move up.
 */

const config = {
  gridSizeX: 12,
  gridSizeY: 12,
  gridSizeZ: 10,
  gridResolution: 0.5,
  ambientTempC: 24,
  ambientHumidityRatio: 0.01,
  airViscosity: 1.5e-5,
} as unknown as SimulationConfig;

function rackAt(z: number): ServerRack {
  return {
    id: 'r1',
    name: 'Rack 1',
    position: { x: 1, y: 1, z },
    width: 0.6,
    depth: 1.0,
    height: 1.0,
    powerDensity: 'medium',
    powerKW: 5,
    airflowCFM: 500,
    orientation: 0,
    rackUnits: 42,
    filledUnits: 20,
  };
}

/** Grid layers (z indices) that ended up holding rack cells. */
function occupiedLayers(grid: ReturnType<typeof createGrid>): number[] {
  const layers = new Set<number>();
  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        if (grid.cells[x][y][z].isObstacle) layers.add(z);
      }
    }
  }
  return [...layers].sort((a, b) => a - b);
}

describe('placeRacks elevation', () => {
  it('places a floor-standing rack (z=0) from layer 1 upward', () => {
    const grid = createGrid(config);
    placeRacks(grid, [rackAt(0)], config, DEFAULT_CALIBRATION_COEFFICIENTS);
    // height 1.0m / 0.5m resolution = 2 cells, starting one layer above the floor
    expect(occupiedLayers(grid)).toEqual([1, 2]);
  });

  it('lifts an elevated rack by its position.z', () => {
    const grid = createGrid(config);
    // z = 1.0m at 0.5m resolution = 2 layers up
    placeRacks(grid, [rackAt(1.0)], config, DEFAULT_CALIBRATION_COEFFICIENTS);
    expect(occupiedLayers(grid)).toEqual([3, 4]);
  });

  it('puts the heat load in the same cells as the obstacle, not on the floor', () => {
    const grid = createGrid(config);
    placeRacks(grid, [rackAt(1.0)], config, DEFAULT_CALIBRATION_COEFFICIENTS);

    let floorHeat = 0;
    let elevatedHeat = 0;
    for (let x = 0; x < grid.sizeX; x++) {
      for (let y = 0; y < grid.sizeY; y++) {
        floorHeat += grid.cells[x][y][1].heatSource;
        elevatedHeat += grid.cells[x][y][3].heatSource + grid.cells[x][y][4].heatSource;
      }
    }
    expect(floorHeat).toBe(0);
    expect(elevatedHeat).toBeGreaterThan(0);
  });

  it('keeps total heat conserved regardless of elevation', () => {
    const total = (z: number) => {
      const grid = createGrid(config);
      placeRacks(grid, [rackAt(z)], config, DEFAULT_CALIBRATION_COEFFICIENTS);
      let sum = 0;
      for (let x = 0; x < grid.sizeX; x++)
        for (let y = 0; y < grid.sizeY; y++)
          for (let zz = 0; zz < grid.sizeZ; zz++) sum += grid.cells[x][y][zz].heatSource;
      return sum;
    };
    expect(total(1.0)).toBeCloseTo(total(0), 6);
  });

  it('drops rack cells that would sit above the grid ceiling', () => {
    const grid = createGrid(config);
    // z far above the 10-layer domain — must not throw or wrap around
    expect(() => placeRacks(grid, [rackAt(50)], config, DEFAULT_CALIBRATION_COEFFICIENTS)).not.toThrow();
    expect(occupiedLayers(grid)).toEqual([]);
  });
});
