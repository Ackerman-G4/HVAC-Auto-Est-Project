import { describe, expect, it } from 'vitest';
import {
  createSimulationCaseSchema,
  updateSimulationCaseSchema,
  geometryInputSchema,
} from '../simulation-cases';

/**
 * The simulation case contracts.
 *
 * The create handler assigned `const geometry: GeometryInput = body.geometry`
 * straight off an unparsed body — an unchecked `any` wearing a type
 * annotation. Those dimensions then reach `buildStructuredGrid`, which sizes
 * each axis as `Math.ceil(lengthM / cellSize)`.
 */

const geometry = {
  roomId: 'room-1',
  lengthM: 10,
  widthM: 8,
  heightM: 3,
};

const minimalCase = { name: 'Server room study', geometry };

describe('grid sizing inputs', () => {
  it('rejects a zero cell size, the divisor on every axis', () => {
    // Math.ceil(10 / 0) is Infinity, and the grid allocation follows.
    expect(createSimulationCaseSchema.safeParse({ ...minimalCase, cellSize: 0 }).success).toBe(false);
  });

  it('rejects a negative cell size', () => {
    expect(createSimulationCaseSchema.safeParse({ ...minimalCase, cellSize: -0.1 }).success).toBe(false);
  });

  it('rejects a cell size small enough to request an enormous grid', () => {
    // 10m / 0.0001m is 100,000 cells on one axis alone.
    expect(createSimulationCaseSchema.safeParse({ ...minimalCase, cellSize: 0.0001 }).success).toBe(false);
  });

  it('rejects a zero room dimension, which collapses the grid', () => {
    expect(
      createSimulationCaseSchema.safeParse({ ...minimalCase, geometry: { ...geometry, heightM: 0 } }).success,
    ).toBe(false);
  });

  it('rejects a non-finite room dimension', () => {
    expect(
      createSimulationCaseSchema.safeParse({ ...minimalCase, geometry: { ...geometry, lengthM: Infinity } }).success,
    ).toBe(false);
  });

  it('allows a zero raised floor and plenum, which most rooms have', () => {
    const parsed = geometryInputSchema.parse(geometry);
    expect(parsed.raisedFloorHeightM).toBe(0);
    expect(parsed.ceilingPlenumHeightM).toBe(0);
  });
});

describe('geometry collections are described, not waved through', () => {
  it('rejects a wall with an unknown thermal boundary condition', () => {
    expect(
      geometryInputSchema.safeParse({
        ...geometry,
        walls: [{ start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, height: 3, thermalBC: 'magic' }],
      }).success,
    ).toBe(false);
  });

  it('accepts a well-formed wall', () => {
    expect(
      geometryInputSchema.safeParse({
        ...geometry,
        walls: [{ start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, height: 3, thermalBC: 'adiabatic' }],
      }).success,
    ).toBe(true);
  });

  it('rejects a rack with a non-finite power, which poisons the heat balance', () => {
    expect(
      geometryInputSchema.safeParse({
        ...geometry,
        racks: [{
          id: 'r1', name: 'Rack 1', position: { x: 1, y: 1, z: 0 },
          width: 0.6, depth: 1, height: 2, powerDensity: 'medium',
          powerKW: NaN, airflowCFM: 500, orientation: 0, rackUnits: 42, filledUnits: 20,
        }],
      }).success,
    ).toBe(false);
  });

  it('rejects an HVAC unit with an unknown type', () => {
    expect(
      geometryInputSchema.safeParse({
        ...geometry,
        hvacUnits: [{
          id: 'h1', type: 'heat_pump', name: 'CRAC-1', position: { x: 0, y: 0, z: 0 },
          width: 1, depth: 1, height: 2, capacityKW: 50, capacityTR: 14,
          airflowCFM: 8000, supplyTempC: 15, returnTempC: 25, orientation: 0,
          powerInputKW: 15, status: 'active',
        }],
      }).success,
    ).toBe(false);
  });

  it('rejects a tile open area outside 0-1, since it is a fraction', () => {
    expect(
      geometryInputSchema.safeParse({
        ...geometry,
        tiles: [{ x: 1, y: 1, openArea: 25, tileSize: 0.6 }],
      }).success,
    ).toBe(false);
  });

  it('bounds collection length so a payload cannot become unbounded meshing work', () => {
    const tiles = Array.from({ length: 50_001 }, () => ({ x: 0, y: 0, openArea: 0.25, tileSize: 0.6 }));
    expect(geometryInputSchema.safeParse({ ...geometry, tiles }).success).toBe(false);
  });
});

describe('solver settings that would never converge', () => {
  const solver = {
    algorithm: 'SIMPLE' as const,
    maxIterations: 500,
    convergenceTarget: 1e-4,
    relaxation: { pressure: 0.3, velocity: 0.7, temperature: 0.9, turbulence: 0.7 },
    timeStepS: 0.5,
    maxCFL: 1,
    adaptiveTimeStep: true,
  };

  it('accepts a realistic profile', () => {
    expect(createSimulationCaseSchema.safeParse({ ...minimalCase, solver }).success).toBe(true);
  });

  it('rejects a zero convergence target, which can never be met', () => {
    expect(
      createSimulationCaseSchema.safeParse({ ...minimalCase, solver: { ...solver, convergenceTarget: 0 } }).success,
    ).toBe(false);
  });

  it('rejects a zero time step, which advances nothing', () => {
    expect(
      createSimulationCaseSchema.safeParse({ ...minimalCase, solver: { ...solver, timeStepS: 0 } }).success,
    ).toBe(false);
  });

  it('rejects a zero iteration budget', () => {
    expect(
      createSimulationCaseSchema.safeParse({ ...minimalCase, solver: { ...solver, maxIterations: 0 } }).success,
    ).toBe(false);
  });
});

describe('scope determines whether geometry is required', () => {
  it('requires geometry for a room-scope case', () => {
    expect(createSimulationCaseSchema.safeParse({ name: 'Study' }).success).toBe(false);
  });

  it('allows a building-scope case without geometry, which it derives from the project', () => {
    expect(
      createSimulationCaseSchema.safeParse({ name: 'Tower', simulationScope: 'building' }).success,
    ).toBe(true);
  });

  it('rejects an unknown run source', () => {
    expect(createSimulationCaseSchema.safeParse({ ...minimalCase, runSource: 'ansys' }).success).toBe(false);
  });
});

describe('update', () => {
  it('rejects an empty patch', () => {
    expect(updateSimulationCaseSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a rebuild flag on its own', () => {
    expect(updateSimulationCaseSchema.parse({ rebuildGeometry: true }).rebuildGeometry).toBe(true);
  });
});
