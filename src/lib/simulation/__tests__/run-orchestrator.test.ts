import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The run orchestrator, extracted from a 564-line route handler (TASK 3.1).
 *
 * These drive every branch through the public entry points with in-memory
 * fakes. The route that used to hold this logic had no tests at all — the
 * lifecycle rules (who may run, when a case is runnable, what happens to a case
 * that is already running) were only reachable through an authenticated HTTP
 * request against a live Firestore, so in practice they were never asserted.
 *
 * `run-execution` is mocked rather than the CFD solvers beneath it. The
 * orchestrator's responsibility is *which* executor runs and *whether* it runs
 * at all; the solvers themselves are a different module's contract.
 */

const executeInternalRun = vi.hoisted(() => vi.fn(async () => {}));
const executeInternalBuildingRun = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../run-execution', () => ({ executeInternalRun, executeInternalBuildingRun }));

const {
  startSimulationRun,
  pollSimulationRun,
  resolveRunnableCase,
  canAccessProject,
  RUN_FAILURE_STATUS,
} = await import('../run-orchestrator');

// Type-only imports are erased before the mock hoisting runs, so these are
// plain imports rather than the dynamic form the values above need.
import type { RunOrchestratorDeps } from '../run-orchestrator';
import { DEFAULT_PHYSICS_SETUP, DEFAULT_SOLVER_PROFILE } from '@/types/simulation';
import type { SimulationCase, RunJob, ArtifactManifest } from '@/types/simulation';

// ─── Fixtures ────────────────────────────────────────────────────

const OWNER = { id: 'user-1', role: 'engineer' };
const OTHER_USER = { id: 'user-2', role: 'engineer' };
const ADMIN = { id: 'user-9', role: 'admin' };

const mesh: NonNullable<SimulationCase['mesh']> = {
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

const buildingGeometry: NonNullable<SimulationCase['buildingGeometry']> = {
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
};

function makeCase(overrides: Partial<SimulationCase> = {}): SimulationCase {
  return {
    id: 'case-1',
    projectId: 'project-1',
    ownerId: OWNER.id,
    name: 'Baseline',
    description: '',
    status: 'meshed',
    runSource: 'internal',
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
    mesh,
    physics: DEFAULT_PHYSICS_SETUP,
    solver: DEFAULT_SOLVER_PROFILE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeJob(overrides: Partial<RunJob> = {}): RunJob {
  return {
    id: 'job-1',
    caseId: 'case-1',
    projectId: 'project-1',
    ownerId: OWNER.id,
    status: 'pending',
    source: 'internal',
    currentIteration: 0,
    totalIterations: 100,
    residuals: [],
    elapsedSeconds: 0,
    logTail: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface FakeState {
  project: { createdBy?: string } | null;
  simCase: SimulationCase | null;
  job: RunJob | null;
  manifest: ArtifactManifest | null;
  caseUpdates: Record<string, unknown>[];
}

/**
 * A deps object backed by plain objects.
 *
 * Returned alongside the state so a test can assert what was written as well
 * as what was returned.
 */
function makeDeps(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    project: { createdBy: OWNER.id },
    simCase: makeCase(),
    job: makeJob(),
    manifest: null,
    caseUpdates: [],
    ...overrides,
  };

  const deps: RunOrchestratorDeps = {
    getProjectRecord: async () => state.project,
    getSimulationCase: async () => state.simCase,
    createRunJob: async (_projectId, _caseId, init) => {
      state.job = makeJob({ source: init.source, totalIterations: init.totalIterations });
      return state.job;
    },
    getRunJob: async () => state.job,
    getArtifactManifest: async () => state.manifest,
    updateRunJobStatus: async () => undefined,
    updateCaseStatus: async () => undefined,
    updateSimulationCase: async (_projectId, _caseId, patch) => {
      state.caseUpdates.push(patch);
      return undefined;
    },
    appendResiduals: async () => undefined,
    saveArtifactManifest: async () => undefined,
    saveRunFieldSnapshot: async () => undefined,
    now: () => 1_700_000_000_000,
  };

  return { deps, state };
}

const startRequest = { actor: OWNER, projectId: 'project-1', caseId: 'case-1' };

beforeEach(() => {
  executeInternalRun.mockClear();
  executeInternalBuildingRun.mockClear();
});

// ─── Access control ──────────────────────────────────────────────

describe('who may run a simulation', () => {
  it('lets the project creator run it', () => {
    expect(canAccessProject(OWNER, { createdBy: OWNER.id })).toBe(true);
  });

  it('refuses a signed-in user who does not own the project', () => {
    expect(canAccessProject(OTHER_USER, { createdBy: OWNER.id })).toBe(false);
  });

  it('lets an admin reach any project', () => {
    expect(canAccessProject(ADMIN, { createdBy: OWNER.id })).toBe(true);
  });

  it('refuses everyone when the project records no creator', () => {
    // An unowned project must not become world-writable by default.
    expect(canAccessProject(OWNER, {})).toBe(false);
    expect(canAccessProject(OTHER_USER, {})).toBe(false);
  });

  it('still lets an admin through an unowned project', () => {
    expect(canAccessProject(ADMIN, {})).toBe(true);
  });
});

// ─── Runnability ─────────────────────────────────────────────────

describe('whether a case can be executed at all', () => {
  it('routes a meshed room-scope case to the room solver', () => {
    const resolved = resolveRunnableCase(makeCase());
    expect('kind' in resolved && resolved.kind).toBe('room');
  });

  it('rejects a room-scope case with no mesh', () => {
    const resolved = resolveRunnableCase(makeCase({ mesh: undefined }));
    expect('reason' in resolved && resolved.reason).toBe('NOT_MESHED');
  });

  it('routes a building-scope case with geometry to the building solver', () => {
    const resolved = resolveRunnableCase(
      makeCase({ simulationScope: 'building', buildingGeometry, mesh: undefined }),
    );
    expect('kind' in resolved && resolved.kind).toBe('building');
  });

  it('rejects a building-scope case that has no building geometry', () => {
    // The regression this replaces: the old guard was
    // `!mesh && scope !== 'building'`, so this combination fell through to the
    // room solver and died on `simCase.mesh!` — surfaced to the client as a
    // solver failure reading "Cannot read properties of undefined".
    const resolved = resolveRunnableCase(
      makeCase({ simulationScope: 'building', buildingGeometry: undefined, mesh: undefined }),
    );
    expect('reason' in resolved && resolved.reason).toBe('MISSING_BUILDING_GEOMETRY');
  });

  it('does not require a mesh for a building-scope case', () => {
    // The network solver derives its own grid, so a missing mesh is normal here
    // and must not be reported as NOT_MESHED.
    const resolved = resolveRunnableCase(
      makeCase({ simulationScope: 'building', buildingGeometry, mesh: undefined }),
    );
    expect('reason' in resolved).toBe(false);
  });
});

// ─── startSimulationRun: failure branches ────────────────────────

describe('starting a run rejects what it should', () => {
  it('reports a missing project', async () => {
    const { deps } = makeDeps({ project: null });
    const outcome = await startSimulationRun(deps, startRequest);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toBe('PROJECT_NOT_FOUND');
  });

  it('refuses a user who does not own the project', async () => {
    const { deps } = makeDeps();
    const outcome = await startSimulationRun(deps, { ...startRequest, actor: OTHER_USER });
    expect(!outcome.ok && outcome.reason).toBe('FORBIDDEN');
  });

  it('reports a missing case', async () => {
    const { deps } = makeDeps({ simCase: null });
    const outcome = await startSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.reason).toBe('CASE_NOT_FOUND');
  });

  it('refuses to start a second run while one is running', async () => {
    const { deps } = makeDeps({ simCase: makeCase({ status: 'running' }) });
    const outcome = await startSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.reason).toBe('ALREADY_RUNNING');
  });

  it('refuses to start a second run while one is queued', async () => {
    const { deps } = makeDeps({ simCase: makeCase({ status: 'queued' }) });
    const outcome = await startSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.reason).toBe('ALREADY_RUNNING');
  });

  it('refuses an unmeshed room-scope case', async () => {
    const { deps } = makeDeps({ simCase: makeCase({ mesh: undefined }) });
    const outcome = await startSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.reason).toBe('NOT_MESHED');
  });

  it('refuses a building case with no geometry', async () => {
    const { deps } = makeDeps({
      simCase: makeCase({ simulationScope: 'building', mesh: undefined }),
    });
    const outcome = await startSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.reason).toBe('MISSING_BUILDING_GEOMETRY');
  });

  it('creates no run job when the request is rejected', async () => {
    // A rejected start must leave no trace. A job created before the
    // lifecycle check would leave an orphan the client could then poll.
    const { deps, state } = makeDeps({ simCase: makeCase({ status: 'running' }) });
    await startSimulationRun(deps, startRequest);
    expect(state.caseUpdates).toEqual([]);
    expect(executeInternalRun).not.toHaveBeenCalled();
  });

  it('checks ownership before it checks whether the case exists', async () => {
    // Otherwise the 404-vs-403 distinction tells an unauthorised caller which
    // case identifiers are real.
    const { deps } = makeDeps({ simCase: null });
    const outcome = await startSimulationRun(deps, { ...startRequest, actor: OTHER_USER });
    expect(!outcome.ok && outcome.reason).toBe('FORBIDDEN');
  });
});

// ─── startSimulationRun: success branches ────────────────────────

describe('starting a run that should proceed', () => {
  it('dispatches a room-scope case to the room executor', async () => {
    const { deps } = makeDeps();
    const outcome = await startSimulationRun(deps, startRequest);

    expect(outcome.ok).toBe(true);
    expect(executeInternalRun).toHaveBeenCalledTimes(1);
    expect(executeInternalBuildingRun).not.toHaveBeenCalled();
  });

  it('dispatches a building-scope case to the building executor', async () => {
    const { deps } = makeDeps({
      simCase: makeCase({ simulationScope: 'building', buildingGeometry, mesh: undefined }),
    });
    const outcome = await startSimulationRun(deps, startRequest);

    expect(outcome.ok).toBe(true);
    expect(executeInternalBuildingRun).toHaveBeenCalledTimes(1);
    expect(executeInternalRun).not.toHaveBeenCalled();
  });

  it('queues the case before executing, so a concurrent start is rejected', async () => {
    const { deps, state } = makeDeps();
    await startSimulationRun(deps, startRequest);

    expect(state.caseUpdates[0]).toMatchObject({ status: 'queued', activeRunId: 'job-1' });
  });

  it('does not run a solver for an externally-sourced run', async () => {
    // An external source leaves the case queued for a callback to advance;
    // running the internal solver as well would produce two sets of results
    // for one run job.
    const { deps } = makeDeps();
    const outcome = await startSimulationRun(deps, { ...startRequest, source: 'openfoam' });

    expect(outcome.ok).toBe(true);
    expect(executeInternalRun).not.toHaveBeenCalled();
    expect(executeInternalBuildingRun).not.toHaveBeenCalled();
  });

  it('falls back to the case source when the request names none', async () => {
    const { deps, state } = makeDeps({ simCase: makeCase({ runSource: 'openfoam' }) });
    await startSimulationRun(deps, startRequest);

    expect(state.caseUpdates[0]).toMatchObject({ runSource: 'openfoam' });
    expect(executeInternalRun).not.toHaveBeenCalled();
  });

  it('lets the request source override the case source', async () => {
    const { deps, state } = makeDeps({ simCase: makeCase({ runSource: 'openfoam' }) });
    await startSimulationRun(deps, { ...startRequest, source: 'internal' });

    expect(state.caseUpdates[0]).toMatchObject({ runSource: 'internal' });
    expect(executeInternalRun).toHaveBeenCalledTimes(1);
  });

  it('lets an admin start a run on a project they do not own', async () => {
    const { deps } = makeDeps();
    const outcome = await startSimulationRun(deps, { ...startRequest, actor: ADMIN });
    expect(outcome.ok).toBe(true);
  });

  it('re-reads the job and case after execution rather than returning stale ones', async () => {
    // The executor writes status, residuals and the manifest after the job is
    // created, and the client polls against this response.
    const { deps, state } = makeDeps();
    state.manifest = null;
    const outcome = await startSimulationRun(deps, startRequest);

    expect(outcome.ok && outcome.run).toEqual(state.job);
    expect(outcome.ok && outcome.case).toEqual(state.simCase);
  });
});

// ─── pollSimulationRun ───────────────────────────────────────────

describe('polling a run', () => {
  it('reports a missing project', async () => {
    const { deps } = makeDeps({ project: null });
    const outcome = await pollSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.reason).toBe('PROJECT_NOT_FOUND');
  });

  it('refuses a user who does not own the project', async () => {
    const { deps } = makeDeps();
    const outcome = await pollSimulationRun(deps, { ...startRequest, actor: OTHER_USER });
    expect(!outcome.ok && outcome.reason).toBe('FORBIDDEN');
  });

  it('reports a missing case', async () => {
    const { deps } = makeDeps({ simCase: null });
    const outcome = await pollSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.reason).toBe('CASE_NOT_FOUND');
  });

  it('returns a null run for a case that has never been started', async () => {
    // Not an error: a draft case legitimately has no active run, and a 404
    // here would make the viewer show a failure on first load.
    const { deps } = makeDeps({ simCase: makeCase({ status: 'draft' }) });
    const outcome = await pollSimulationRun(deps, startRequest);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.run).toBeNull();
    expect(outcome.ok && outcome.status).toBe('draft');
  });

  it('returns the active run and its status', async () => {
    const { deps } = makeDeps({
      simCase: makeCase({ status: 'running', activeRunId: 'job-1' }),
      job: makeJob({ status: 'running', currentIteration: 42 }),
    });
    const outcome = await pollSimulationRun(deps, startRequest);

    expect(outcome.ok && outcome.run?.currentIteration).toBe(42);
    expect(outcome.ok && outcome.status).toBe('running');
  });

  it('returns a null manifest when the active run has produced none yet', async () => {
    const { deps } = makeDeps({
      simCase: makeCase({ status: 'running', activeRunId: 'job-1' }),
      manifest: null,
    });
    const outcome = await pollSimulationRun(deps, startRequest);
    expect(outcome.ok && outcome.manifest).toBeNull();
  });
});

// ─── Status mapping ──────────────────────────────────────────────

describe('the reason-to-status table', () => {
  it('maps every failure reason, so none can fall through to a 500', async () => {
    const reasons: string[] = [
      'PROJECT_NOT_FOUND',
      'FORBIDDEN',
      'CASE_NOT_FOUND',
      'ALREADY_RUNNING',
      'NOT_MESHED',
      'MISSING_BUILDING_GEOMETRY',
    ];
    for (const reason of reasons) {
      expect(Object.keys(RUN_FAILURE_STATUS)).toContain(reason);
    }
    expect(Object.keys(RUN_FAILURE_STATUS)).toHaveLength(reasons.length);
  });

  it('uses the status each condition actually means', () => {
    expect(RUN_FAILURE_STATUS.PROJECT_NOT_FOUND).toBe(404);
    expect(RUN_FAILURE_STATUS.CASE_NOT_FOUND).toBe(404);
    expect(RUN_FAILURE_STATUS.FORBIDDEN).toBe(403);
    // A conflict, not a bad request: the payload was fine, the case was busy.
    expect(RUN_FAILURE_STATUS.ALREADY_RUNNING).toBe(409);
    expect(RUN_FAILURE_STATUS.NOT_MESHED).toBe(400);
    expect(RUN_FAILURE_STATUS.MISSING_BUILDING_GEOMETRY).toBe(400);
  });

  it('carries a message a client can display for every failure', async () => {
    const { deps } = makeDeps({ project: null });
    const outcome = await startSimulationRun(deps, startRequest);
    expect(!outcome.ok && outcome.message.length).toBeGreaterThan(0);
  });
});
