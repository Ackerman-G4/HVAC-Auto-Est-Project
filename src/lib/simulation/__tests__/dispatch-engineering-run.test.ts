import { describe, expect, it, vi } from 'vitest';
import { dispatchEngineeringRun, type DispatchRunDeps } from '../dispatch-engineering-run';

/**
 * Engineering-tier dispatch, extracted from the runs route by TASK 3.2.
 *
 * Eight refusals, none of which previously had a test because reaching any of
 * them meant an HTTP request against a Firestore-backed case plus live cloud
 * configuration. Two orderings matter most and are pinned below: the case
 * package and the provisioning check both happen *before* a run job exists, so
 * a failure in either cannot leave a dangling queued job.
 */

const OWNER = { id: 'u1', role: 'engineer' };
const project = { id: 'p1', createdBy: OWNER.id };

const simCase = {
  id: 'c1', status: 'ready', simulationScope: 'room',
  mesh: { nx: 4, ny: 4, nz: 4, cellSizeM: 0.25 },
  solver: { maxIterations: 500 },
};

function makeDeps(over: Partial<Record<keyof DispatchRunDeps, unknown>> = {}) {
  const order: string[] = [];

  const deps = {
    getProjectRecord: vi.fn(async () => project),
    getSimulationCase: vi.fn(async () => simCase),
    createRunJob: vi.fn(async () => { order.push('createJob'); return { id: 'job-1' }; }),
    updateSimulationCase: vi.fn(async () => undefined),
    updateCaseStatus: vi.fn(async () => undefined),
    updateRunJobStatus: vi.fn(async () => undefined),
    buildOpenFOAMConfig: vi.fn(() => { order.push('buildConfig'); return { solver: 'buoyantSimpleFoam', caseName: 'c1' }; }),
    generateCaseFiles: vi.fn(() => [['system/controlDict', 'contents']]),
    buildStructuredGrid: vi.fn(() => ({ nx: 8, ny: 8, nz: 8, cellSizeM: 0.5 })),
    recommendCellSize: vi.fn(() => 0.5),
    toFallbackGeometry: vi.fn(() => ({ lengthM: 10, widthM: 8, heightM: 3 })),
    isOpenFOAMCloudConfigured: vi.fn(() => { order.push('checkProvisioned'); return true; }),
    missingOpenFOAMCloudConfig: vi.fn(() => ['CFD_BUCKET', 'CFD_JOB_NAME']),
    getOpenFOAMCloudConfig: vi.fn(() => ({ callbackBaseUrl: 'https://cb.test', callbackSecret: 's' })),
    uploadCaseInput: vi.fn(async () => undefined),
    triggerSolveJob: vi.fn(async () => 'exec-123'),
    resolveCallbackUrl: vi.fn(() => 'https://cb.test/hook'),
    caseInputObjectPath: vi.fn(() => 'in/p1/c1/job-1.json'),
    resultOutputObjectPath: vi.fn(() => 'out/p1/c1/job-1.json'),
    ...over,
  } as unknown as DispatchRunDeps;

  return { deps, order };
}

const params = {
  projectId: 'p1', caseId: 'c1', user: OWNER, requestOrigin: 'https://app.test',
};

describe('dispatch refuses before it spends anything', () => {
  it('refuses an unknown project', async () => {
    const { deps } = makeDeps({ getProjectRecord: vi.fn(async () => null) });
    const r = await dispatchEngineeringRun(deps, params);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('PROJECT_NOT_FOUND');
  });

  it('refuses a caller who does not own the project', async () => {
    const { deps } = makeDeps();
    const r = await dispatchEngineeringRun(deps, { ...params, user: { id: 'other', role: 'engineer' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('FORBIDDEN');
  });

  it('refuses an unknown case', async () => {
    const { deps } = makeDeps({ getSimulationCase: vi.fn(async () => null) });
    const r = await dispatchEngineeringRun(deps, params);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('CASE_NOT_FOUND');
  });

  it('refuses a case that is already running', async () => {
    const { deps } = makeDeps({ getSimulationCase: vi.fn(async () => ({ ...simCase, status: 'running' })) });
    const r = await dispatchEngineeringRun(deps, params);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('ALREADY_RUNNING');
  });

  it('refuses a preview-tier request, which must not spend cloud compute', async () => {
    // The Preview tier solves in-browser via POST .../run. Accepting it here
    // would bill a solve the caller asked to keep local.
    const { deps } = makeDeps();
    const r = await dispatchEngineeringRun(deps, { ...params, solverBackend: 'preview' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('USE_PREVIEW_ENDPOINT');
    expect(deps.createRunJob).not.toHaveBeenCalled();
  });

  it('refuses an unmeshed room-scope case', async () => {
    const { deps } = makeDeps({ getSimulationCase: vi.fn(async () => ({ ...simCase, mesh: undefined })) });
    const r = await dispatchEngineeringRun(deps, params);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NOT_MESHED');
  });

  it('derives a mesh for an unmeshed building-scope case instead of refusing', async () => {
    const { deps } = makeDeps({
      getSimulationCase: vi.fn(async () => ({
        ...simCase, mesh: undefined, simulationScope: 'building',
        buildingGeometry: { buildingId: 'b1', rooms: [], connections: [] },
      })),
    });
    const r = await dispatchEngineeringRun(deps, params);

    expect(r.ok).toBe(true);
    expect(deps.buildStructuredGrid).toHaveBeenCalled();
  });

  it('reports which configuration is missing when the tier is unprovisioned', async () => {
    const { deps } = makeDeps({ isOpenFOAMCloudConfigured: vi.fn(() => false) });
    const r = await dispatchEngineeringRun(deps, params);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('ENGINEERING_TIER_NOT_PROVISIONED');
    if (r.reason !== 'ENGINEERING_TIER_NOT_PROVISIONED') return;
    expect(r.missing).toEqual(['CFD_BUCKET', 'CFD_JOB_NAME']);
    // The whole point: no job was queued for a tier that cannot run it.
    expect(deps.createRunJob).not.toHaveBeenCalled();
  });
});

describe('nothing is queued before it can be run', () => {
  it('builds the case package and checks provisioning before creating a job', async () => {
    const { deps, order } = makeDeps();
    await dispatchEngineeringRun(deps, params);

    expect(order).toEqual(['buildConfig', 'checkProvisioned', 'createJob']);
  });

  it('surfaces an export failure without creating a job', async () => {
    const { deps } = makeDeps({
      buildOpenFOAMConfig: vi.fn(() => { throw new Error('unsupported boundary condition'); }),
    });

    await expect(dispatchEngineeringRun(deps, params)).rejects.toThrow('unsupported boundary');
    expect(deps.createRunJob).not.toHaveBeenCalled();
  });
});

describe('a dispatch failure fails the job it already created', () => {
  it('marks the run failed rather than leaving it queued forever', async () => {
    const { deps } = makeDeps({
      triggerSolveJob: vi.fn(async () => { throw new Error('Cloud Run quota exceeded'); }),
    });
    const r = await dispatchEngineeringRun(deps, params);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('SOLVER_DISPATCH_FAILED');
    if (r.reason !== 'SOLVER_DISPATCH_FAILED') return;
    expect(r.message).toBe('Cloud Run quota exceeded');
    expect(deps.updateRunJobStatus).toHaveBeenCalledWith(
      'p1', 'c1', 'job-1', 'failed', expect.objectContaining({ errorMessage: 'Cloud Run quota exceeded' }),
    );
    expect(deps.updateCaseStatus).toHaveBeenCalledWith('p1', 'c1', 'failed');
  });
});

describe('a successful dispatch', () => {
  it('uploads the case, triggers the job, and returns the execution handle', async () => {
    const { deps } = makeDeps();
    const r = await dispatchEngineeringRun(deps, params);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.runId).toBe('job-1');
    expect(r.execution).toBe('exec-123');
    expect(deps.uploadCaseInput).toHaveBeenCalledOnce();
    expect(deps.triggerSolveJob).toHaveBeenCalledOnce();
  });

  it('queues the case against the openfoam source before dispatch', async () => {
    const { deps } = makeDeps();
    await dispatchEngineeringRun(deps, params);

    expect(deps.updateSimulationCase).toHaveBeenCalledWith('p1', 'c1', expect.objectContaining({
      status: 'queued', activeRunId: 'job-1', runSource: 'openfoam', solverBackend: 'engineering',
    }));
  });
});
