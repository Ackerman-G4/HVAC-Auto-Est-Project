import { describe, expect, it, vi } from 'vitest';
import {
  pollSimulationRun,
  startSimulationRun,
  type RunOrchestratorDeps,
} from '../run-orchestrator';
import type { RunJob, SimulationCase } from '@/types/simulation';

/**
 * The simulation run lifecycle.
 *
 * These branches lived inside a 564-line route handler, which meant reaching
 * "already running" or "solver threw" required an HTTP request against a
 * Firestore-backed case. None of them had a test. Every dependency is injected,
 * so the whole lifecycle runs in-process here.
 */

const OWNER = { id: 'user-1', role: 'engineer' };
const ADMIN = { id: 'admin-1', role: 'admin' };
const STRANGER = { id: 'user-2', role: 'engineer' };

const project = { id: 'p1', createdBy: OWNER.id };

const metrics = {
  maxTemperature: 31, minTemperature: 18, avgTemperature: 24,
  maxVelocity: 2, minHumidityRatio: 0.008, maxHumidityRatio: 0.012,
  continuityResidual: 1e-5, momentumResidual: 2e-5, energyResidual: 3e-5,
  turbulenceResidual: 4e-5,
};

function makeCase(over: Partial<SimulationCase> = {}): SimulationCase {
  return {
    id: 'c1', projectId: 'p1', ownerId: OWNER.id, name: 'Case', description: '',
    status: 'ready', runSource: 'internal',
    geometry: { roomId: 'r1', racks: [], hvacUnits: [], tiles: [], raisedFloorHeightM: 0.6 },
    mesh: { nx: 4, ny: 4, nz: 4, cellSizeM: 0.25 },
    physics: {
      referenceTemperatureC: 24,
      fluid: { density: 1.2, viscosity: 1.8e-5, thermalConductivity: 0.026, specificHeat: 1005 },
    },
    solver: { maxIterations: 100, convergenceTarget: 1e-4, timeStepS: 0.1 },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as SimulationCase;
}

function makeJob(over: Partial<RunJob> = {}): RunJob {
  return {
    id: 'job-1', caseId: 'c1', projectId: 'p1', ownerId: OWNER.id,
    source: 'internal', status: 'pending', totalIterations: 100, currentIteration: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as RunJob;
}

/** Fakes that record what happened, so status transitions are assertable. */
function makeDeps(over: Partial<RunOrchestratorDeps> = {}) {
  const jobStatuses: Array<{ status: string; errorMessage?: string }> = [];
  const caseStatuses: string[] = [];

  const deps = {
    getProjectRecord: vi.fn(async () => project),
    getSimulationCase: vi.fn(async () => makeCase()),
    updateSimulationCase: vi.fn(async (_p, _c, patch: { status?: string }) => {
      if (patch.status) caseStatuses.push(patch.status);
    }),
    updateCaseStatus: vi.fn(async (_p, _c, status: string) => { caseStatuses.push(status); }),
    createRunJob: vi.fn(async () => makeJob()),
    getRunJob: vi.fn(async () => makeJob({ status: 'completed' })),
    updateRunJobStatus: vi.fn(async (_p, _c, _j, status: string, patch?: { errorMessage?: string }) => {
      jobStatuses.push({ status, errorMessage: patch?.errorMessage });
    }),
    appendResiduals: vi.fn(async () => undefined),
    saveArtifactManifest: vi.fn(async () => undefined),
    getArtifactManifest: vi.fn(async () => null),
    saveRunFieldSnapshot: vi.fn(async () => undefined),
    runCFDSimulation: vi.fn(() => ({ iteration: 100, metrics, convergenceHistory: [1, 0.1] })),
    runBuildingCFDSimulation: vi.fn(() => ({
      iteration: 50, metrics, roomStates: [], connectionFlows: [], convergenceHistory: [1],
    })),
    buildRunFieldSnapshotFromResult: vi.fn(() => ({ caseId: 'c1' })),
    ...over,
  } as unknown as RunOrchestratorDeps;

  return { deps, jobStatuses, caseStatuses };
}

const params = { projectId: 'p1', caseId: 'c1', user: OWNER };

describe('a run is refused before anything is written', () => {
  it('refuses a project that does not exist', async () => {
    const { deps } = makeDeps({ getProjectRecord: vi.fn(async () => null) });
    const result = await startSimulationRun(deps, params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PROJECT_NOT_FOUND');
    expect(deps.createRunJob).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not own the project', async () => {
    const { deps } = makeDeps();
    const result = await startSimulationRun(deps, { ...params, user: STRANGER });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('FORBIDDEN');
    expect(deps.createRunJob).not.toHaveBeenCalled();
  });

  it('lets an admin run a project they do not own', async () => {
    const { deps } = makeDeps();
    const result = await startSimulationRun(deps, { ...params, user: ADMIN });
    expect(result.ok).toBe(true);
  });

  it('refuses a case that does not exist', async () => {
    const { deps } = makeDeps({ getSimulationCase: vi.fn(async () => null) });
    const result = await startSimulationRun(deps, params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CASE_NOT_FOUND');
  });

  it('refuses a second run while one is already running', async () => {
    const { deps } = makeDeps({ getSimulationCase: vi.fn(async () => makeCase({ status: 'running' })) });
    const result = await startSimulationRun(deps, params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('ALREADY_RUNNING');
    expect(deps.createRunJob).not.toHaveBeenCalled();
  });

  it('refuses a second run while one is queued', async () => {
    const { deps } = makeDeps({ getSimulationCase: vi.fn(async () => makeCase({ status: 'queued' })) });
    const result = await startSimulationRun(deps, params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('ALREADY_RUNNING');
  });

  it('refuses an unmeshed room-scope case', async () => {
    const { deps } = makeDeps({
      getSimulationCase: vi.fn(async () => makeCase({ mesh: undefined })),
    });
    const result = await startSimulationRun(deps, params);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NOT_MESHED');
  });

  it('allows an unmeshed building-scope case, which is solved from its room network', async () => {
    const { deps } = makeDeps({
      getSimulationCase: vi.fn(async () => makeCase({
        mesh: undefined,
        simulationScope: 'building',
        buildingGeometry: { buildingId: 'b1', rooms: [], connections: [] },
      })),
    });
    const result = await startSimulationRun(deps, params);

    expect(result.ok).toBe(true);
    expect(deps.runBuildingCFDSimulation).toHaveBeenCalled();
    expect(deps.runCFDSimulation).not.toHaveBeenCalled();
  });
});

describe('a successful internal run drives the case to completed', () => {
  it('creates the job, solves, and records the manifest', async () => {
    const { deps, jobStatuses, caseStatuses } = makeDeps();
    const result = await startSimulationRun(deps, params);

    expect(result.ok).toBe(true);
    expect(deps.runCFDSimulation).toHaveBeenCalledOnce();
    expect(deps.saveArtifactManifest).toHaveBeenCalledOnce();
    expect(deps.appendResiduals).toHaveBeenCalledOnce();
    expect(jobStatuses.map((j) => j.status)).toEqual(['running', 'completed']);
    expect(caseStatuses).toEqual(['queued', 'running', 'completed']);
  });

  it('sizes the manifest from the mesh cell count', async () => {
    const { deps } = makeDeps();
    await startSimulationRun(deps, params);

    const manifest = vi.mocked(deps.saveArtifactManifest).mock.calls[0][2];
    // 4x4x4 = 64 cells; scalar float32 at 0.6 compression = ceil(64*4*0.6) = 154.
    const temperature = manifest.fields.find((f) => f.name === 'temperature');
    expect(temperature?.compressedSizeBytes).toBe(154);
    expect(manifest.fields).toHaveLength(4);
  });

  it('leaves an external-source run queued for its callback', async () => {
    // 'openfoam' is dispatched to a solver service; the case stays queued until
    // that service calls back, so nothing runs in-process here.
    const { deps, caseStatuses } = makeDeps();
    const result = await startSimulationRun(deps, { ...params, source: 'openfoam' });

    expect(result.ok).toBe(true);
    expect(deps.runCFDSimulation).not.toHaveBeenCalled();
    expect(caseStatuses).toEqual(['queued']);
  });
});

describe('a solver failure marks the run failed rather than escaping', () => {
  it('records the message and fails the case', async () => {
    const { deps, jobStatuses, caseStatuses } = makeDeps({
      runCFDSimulation: vi.fn(() => { throw new Error('diverged at iteration 12'); }),
    });

    // Resolves rather than rejecting: the caller was already promised a run.
    const result = await startSimulationRun(deps, params);
    expect(result.ok).toBe(true);

    expect(jobStatuses.at(-1)?.status).toBe('failed');
    expect(jobStatuses.at(-1)?.errorMessage).toBe('diverged at iteration 12');
    expect(caseStatuses.at(-1)).toBe('failed');
  });

  it('does not fail a converged run when only the playback snapshot fails', async () => {
    // The snapshot is an optimisation for playback, not part of the result.
    const { deps, jobStatuses } = makeDeps({
      saveRunFieldSnapshot: vi.fn(async () => { throw new Error('storage full'); }),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await startSimulationRun(deps, params);
    expect(jobStatuses.at(-1)?.status).toBe('completed');
  });
});

describe('polling reports run state without starting anything', () => {
  it('returns null for a case that has never run', async () => {
    const { deps } = makeDeps({ getSimulationCase: vi.fn(async () => makeCase()) });
    const result = await pollSimulationRun(deps, params);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run).toBeNull();
    expect(result.status).toBe('ready');
  });

  it('returns the active job when one exists', async () => {
    const { deps } = makeDeps({
      getSimulationCase: vi.fn(async () => makeCase({ activeRunId: 'job-1', status: 'running' })),
    });
    const result = await pollSimulationRun(deps, params);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run?.id).toBe('job-1');
    expect(result.status).toBe('running');
  });

  it('applies the same access check as starting a run', async () => {
    const { deps } = makeDeps();
    const result = await pollSimulationRun(deps, { ...params, user: STRANGER });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('FORBIDDEN');
  });
});
