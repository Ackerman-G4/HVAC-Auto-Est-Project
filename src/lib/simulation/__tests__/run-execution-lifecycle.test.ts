import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The lifecycle the two internal executors drive around a solver call.
 *
 * Extracted from the run route (TASK 3.1), where they were unreachable from a
 * test: exercising them meant an authenticated HTTP request against a live
 * Firestore. The failure paths in particular — what a polling client sees when
 * the solver throws — had never been asserted.
 *
 * The solvers are mocked. What is under test is the status transitions, what is
 * persisted, and that a thrown solver is recorded rather than propagated. The
 * guarded division these share is covered in `run-execution.test.ts`.
 */

const runCFDSimulation = vi.hoisted(() => vi.fn());
const runBuildingCFDSimulation = vi.hoisted(() => vi.fn());
const buildRunFieldSnapshotFromResult = vi.hoisted(() => vi.fn(() => ({ snapshot: true })));

vi.mock('@/lib/functions/cfd-simulation', () => ({ runCFDSimulation }));
vi.mock('@/lib/functions/building-cfd-simulation', () => ({ runBuildingCFDSimulation }));
vi.mock('@/lib/simulation/field-snapshot', () => ({ buildRunFieldSnapshotFromResult }));

const { executeInternalRun, executeInternalBuildingRun } = await import('../run-execution');

import type { RunExecutionDeps, MeshedCase, BuildingCase } from '../run-execution';
import { DEFAULT_PHYSICS_SETUP, DEFAULT_SOLVER_PROFILE } from '@/types/simulation';

// ─── Fixtures ────────────────────────────────────────────────────

/** A converged result carrying the fields the executors read. */
const metrics = {
  maxTemperature: 27,
  minTemperature: 18,
  avgTemperature: 22,
  maxHumidityRatio: 0.011,
  minHumidityRatio: 0.008,
  avgHumidityRatio: 0.0093,
  maxVelocity: 2.4,
  avgVelocity: 0.6,
  totalHeatLoad: 5000,
  totalCoolingCapacity: 6000,
  coolingDeficit: 0,
  hotspots: [],
  pue: 1.5,
  supplyHeatIndex: 0.2,
  returnHeatIndex: 0.8,
  rackInletTemps: [],
  continuityResidual: 1e-4,
  momentumResidual: 2e-4,
  energyResidual: 3e-4,
  turbulenceResidual: 4e-4,
  maxDivergence: 1e-6,
  converged: true,
  avgTurbulentViscosity: 0.01,
  maxTurbulentIntensity: 0.05,
};

const roomResult = { iteration: 120, metrics, convergenceHistory: [1, 0.1, 0.01] };

const buildingResult = {
  iteration: 80,
  converged: true,
  metrics,
  roomStates: [
    {
      roomId: 'room-1',
      avgTemperature: 22,
      meanVelocity: 0.4,
      grid: [[{ u: 0.1, v: 0.2, temp: 22 }]],
    },
  ],
  connectionFlows: [],
  convergenceHistory: [1, 0.1],
};

const mesh = {
  nx: 4,
  ny: 4,
  nz: 4,
  cellSizeM: 0.5,
  extents: { x: 2, y: 2, z: 2 },
  zones: [],
  patches: [],
  fluidCellCount: 64,
  solidCellCount: 0,
};

const baseCase = {
  id: 'case-1',
  projectId: 'project-1',
  ownerId: 'user-1',
  name: 'Baseline',
  description: '',
  status: 'meshed' as const,
  runSource: 'internal' as const,
  geometry: {
    roomId: 'room-1',
    lengthM: 6,
    widthM: 4,
    heightM: 3,
    raisedFloorHeightM: 0.6,
    ceilingPlenumHeightM: 0,
    walls: [],
    hvacUnits: [],
    racks: [],
    tiles: [],
    obstructions: [],
  },
  physics: DEFAULT_PHYSICS_SETUP,
  solver: DEFAULT_SOLVER_PROFILE,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const meshedCase: MeshedCase = { ...baseCase, mesh };

const buildingCase: BuildingCase = {
  ...baseCase,
  simulationScope: 'building',
  buildingGeometry: {
    buildingId: 'building-1',
    rooms: [
      {
        id: 'room-1',
        floorId: 'floor-1',
        floorNumber: 1,
        name: 'Server Room',
        origin: { x: 0, y: 0, z: 0 },
        dimensions: { width: 4, length: 6, height: 3 },
        vents: [],
        heatLoadW: 5000,
      },
    ],
    connections: [],
  },
};

interface Recorded {
  jobStatuses: { status: string; patch: Record<string, unknown> }[];
  caseStatuses: string[];
  caseUpdates: Record<string, unknown>[];
  residuals: number;
  manifests: number;
  snapshots: number;
}

function makeDeps(overrides: Partial<RunExecutionDeps> = {}) {
  const recorded: Recorded = {
    jobStatuses: [],
    caseStatuses: [],
    caseUpdates: [],
    residuals: 0,
    manifests: 0,
    snapshots: 0,
  };

  const deps: RunExecutionDeps = {
    updateRunJobStatus: async (_projectId, _caseId, _jobId, status, patch) => {
      recorded.jobStatuses.push({ status, patch });
    },
    updateCaseStatus: async (_projectId, _caseId, status) => {
      recorded.caseStatuses.push(status);
    },
    updateSimulationCase: async (_projectId, _caseId, patch) => {
      recorded.caseUpdates.push(patch);
    },
    appendResiduals: async () => {
      recorded.residuals += 1;
    },
    saveArtifactManifest: async () => {
      recorded.manifests += 1;
    },
    saveRunFieldSnapshot: async () => {
      recorded.snapshots += 1;
    },
    now: () => 1_700_000_000_000,
    ...overrides,
  };

  return { deps, recorded };
}

const statusesOf = (recorded: Recorded) => recorded.jobStatuses.map((entry) => entry.status);
const failedPatch = (recorded: Recorded) =>
  recorded.jobStatuses.find((entry) => entry.status === 'failed')?.patch;
const completedPatch = (recorded: Recorded) =>
  recorded.jobStatuses.find((entry) => entry.status === 'completed')?.patch;

beforeEach(() => {
  runCFDSimulation.mockReset().mockReturnValue(roomResult);
  runBuildingCFDSimulation.mockReset().mockReturnValue(buildingResult);
  buildRunFieldSnapshotFromResult.mockReset().mockReturnValue({ snapshot: true });
});

// ─── Room-scope executor ─────────────────────────────────────────

describe('a room-scope run that succeeds', () => {
  it('moves the job through running and then completed', async () => {
    const { deps, recorded } = makeDeps();
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    expect(statusesOf(recorded)).toEqual(['running', 'completed']);
  });

  it('marks the case completed with the run recorded as its result', async () => {
    const { deps, recorded } = makeDeps();
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    expect(recorded.caseStatuses).toEqual(['running']);
    expect(recorded.caseUpdates).toEqual([{ status: 'completed', resultId: 'job-1' }]);
  });

  it('persists a residual history, a manifest and a field snapshot', async () => {
    const { deps, recorded } = makeDeps();
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    expect(recorded.residuals).toBe(1);
    expect(recorded.manifests).toBe(1);
    expect(recorded.snapshots).toBe(1);
  });

  it('reports the iteration the solver actually reached', async () => {
    const { deps, recorded } = makeDeps();
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    expect(completedPatch(recorded)?.currentIteration).toBe(120);
  });

  it('drives the solver from the stored mesh rather than a default grid', async () => {
    const { deps } = makeDeps();
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    const input = runCFDSimulation.mock.calls[0]?.[0];
    expect(input.config.gridSizeX).toBe(4);
    expect(input.config.gridResolution).toBe(0.5);
  });
});

describe('a room-scope run that fails', () => {
  it('records the failure instead of propagating it', async () => {
    // The run job is the record the client polls. An exception escaping here
    // would leave the case stuck in `running` with nothing to explain why.
    runCFDSimulation.mockImplementation(() => {
      throw new Error('solver diverged');
    });
    const { deps, recorded } = makeDeps();

    await expect(
      executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase),
    ).resolves.toBeUndefined();

    expect(statusesOf(recorded)).toEqual(['running', 'failed']);
    expect(recorded.caseStatuses).toEqual(['running', 'failed']);
  });

  it('surfaces the solver message so the failure can be diagnosed', async () => {
    runCFDSimulation.mockImplementation(() => {
      throw new Error('solver diverged');
    });
    const { deps, recorded } = makeDeps();
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    expect(failedPatch(recorded)?.errorMessage).toBe('solver diverged');
  });

  it('falls back to a generic message when a non-Error is thrown', async () => {
    runCFDSimulation.mockImplementation(() => {
      throw 'string thrown';
    });
    const { deps, recorded } = makeDeps();
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    expect(failedPatch(recorded)?.errorMessage).toBe('Unknown solver error');
  });

  it('still completes a run whose field snapshot could not be stored', async () => {
    // The snapshot is a viewer convenience derived from data already in the
    // manifest, so losing it must not fail an otherwise good run.
    const { deps, recorded } = makeDeps({
      saveRunFieldSnapshot: async () => {
        throw new Error('storage unavailable');
      },
    });
    await executeInternalRun(deps, 'project-1', 'case-1', 'job-1', meshedCase);

    expect(statusesOf(recorded)).toEqual(['running', 'completed']);
    expect(recorded.manifests).toBe(1);
  });
});

// ─── Building-scope executor ─────────────────────────────────────

describe('a building-scope run', () => {
  it('completes through the network solver', async () => {
    const { deps, recorded } = makeDeps();
    await executeInternalBuildingRun(deps, 'project-1', 'case-1', 'job-1', buildingCase);

    expect(statusesOf(recorded)).toEqual(['running', 'completed']);
    expect(recorded.caseUpdates).toEqual([{ status: 'completed', resultId: 'job-1' }]);
  });

  it('records a residual even when the solver emitted no progress', async () => {
    // A run that converges before the first progress emit would otherwise
    // complete with an empty residual history and draw no convergence chart.
    const { deps, recorded } = makeDeps();
    await executeInternalBuildingRun(deps, 'project-1', 'case-1', 'job-1', buildingCase);

    expect(recorded.residuals).toBe(1);
  });

  it('records one residual per progress emit when the solver reports them', async () => {
    runBuildingCFDSimulation.mockImplementation((_input, options) => {
      options.onProgress({
        iteration: 10,
        continuityResidual: 0.1,
        momentumResidual: 0.2,
        energyResidual: 0.3,
      });
      options.onProgress({
        iteration: 20,
        continuityResidual: 0.01,
        momentumResidual: 0.02,
        energyResidual: 0.03,
      });
      return buildingResult;
    });
    const { deps, recorded } = makeDeps();
    await executeInternalBuildingRun(deps, 'project-1', 'case-1', 'job-1', buildingCase);

    expect(recorded.residuals).toBe(2);
  });

  it('attaches a visualization payload describing the solved room', async () => {
    const { deps, recorded } = makeDeps();
    await executeInternalBuildingRun(deps, 'project-1', 'case-1', 'job-1', buildingCase);

    expect(completedPatch(recorded)?.buildingVisualization).toMatchObject({
      rooms: [{ roomId: 'room-1' }],
    });
  });

  it('drops a solved room the geometry does not describe rather than emitting a null', async () => {
    runBuildingCFDSimulation.mockReturnValue({
      ...buildingResult,
      roomStates: [
        {
          roomId: 'ghost-room',
          avgTemperature: 22,
          meanVelocity: 0.4,
          grid: [[{ u: 0, v: 0, temp: 22 }]],
        },
      ],
    });
    const { deps, recorded } = makeDeps();
    await executeInternalBuildingRun(deps, 'project-1', 'case-1', 'job-1', buildingCase);

    expect(completedPatch(recorded)?.buildingVisualization).toMatchObject({ rooms: [] });
  });

  it('records a failed building run rather than propagating', async () => {
    runBuildingCFDSimulation.mockImplementation(() => {
      throw new Error('network solve failed');
    });
    const { deps, recorded } = makeDeps();

    await expect(
      executeInternalBuildingRun(deps, 'project-1', 'case-1', 'job-1', buildingCase),
    ).resolves.toBeUndefined();

    expect(failedPatch(recorded)?.errorMessage).toBe('network solve failed');
    expect(recorded.caseStatuses).toEqual(['running', 'failed']);
  });

  it('falls back to a building-specific message for a non-Error throw', async () => {
    runBuildingCFDSimulation.mockImplementation(() => {
      throw 42;
    });
    const { deps, recorded } = makeDeps();
    await executeInternalBuildingRun(deps, 'project-1', 'case-1', 'job-1', buildingCase);

    expect(failedPatch(recorded)?.errorMessage).toBe('Unknown building solver error');
  });
});
