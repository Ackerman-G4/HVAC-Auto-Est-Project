/**
 * Engineering-tier (OpenFOAM) run dispatch.
 *
 * Extracted from the runs route by REMEDIATION_PLAN.md TASK 3.2. It carried
 * eight distinct refusals — wrong tier, not meshed, tier not provisioned,
 * dispatch failed among them — none of which had a test, because reaching any
 * of them meant an HTTP request against a Firestore-backed case plus cloud
 * configuration.
 *
 * Two orderings here are deliberate and are what the tests pin:
 *
 * 1. The case package is built **before** a run job is created, so an export
 *    failure surfaces synchronously instead of leaving a dangling job.
 * 2. Provisioning is checked **before** the job is created too, so an
 *    unprovisioned tier returns 503 rather than queueing work nothing will run.
 */

import type { getProjectRecord } from '@/lib/firebase/projects-store';
import type {
  createRunJob,
  getSimulationCase,
  updateCaseStatus,
  updateRunJobStatus,
  updateSimulationCase,
} from '@/lib/firebase/simulation-cases-store';
import type { buildOpenFOAMConfig, generateCaseFiles } from '@/lib/engine/simulation/openfoam-exporter';
import type { buildStructuredGrid, recommendCellSize } from '@/lib/engine/simulation/geometry-builder';
import type { toFallbackGeometry } from '@/lib/simulation/building-case';
import type {
  caseInputObjectPath,
  getOpenFOAMCloudConfig,
  isOpenFOAMCloudConfigured,
  missingOpenFOAMCloudConfig,
  resolveCallbackUrl,
  resultOutputObjectPath,
  triggerSolveJob,
  uploadCaseInput,
} from '@/lib/engine/simulation/cfd-cloud';
import type { SimulationCase } from '@/types/simulation';

export interface DispatchRunDeps {
  readonly getProjectRecord: typeof getProjectRecord;
  readonly getSimulationCase: typeof getSimulationCase;
  readonly createRunJob: typeof createRunJob;
  readonly updateSimulationCase: typeof updateSimulationCase;
  readonly updateCaseStatus: typeof updateCaseStatus;
  readonly updateRunJobStatus: typeof updateRunJobStatus;
  readonly buildOpenFOAMConfig: typeof buildOpenFOAMConfig;
  readonly generateCaseFiles: typeof generateCaseFiles;
  readonly buildStructuredGrid: typeof buildStructuredGrid;
  readonly recommendCellSize: typeof recommendCellSize;
  readonly toFallbackGeometry: typeof toFallbackGeometry;
  readonly isOpenFOAMCloudConfigured: typeof isOpenFOAMCloudConfigured;
  readonly missingOpenFOAMCloudConfig: typeof missingOpenFOAMCloudConfig;
  readonly getOpenFOAMCloudConfig: typeof getOpenFOAMCloudConfig;
  readonly uploadCaseInput: typeof uploadCaseInput;
  readonly triggerSolveJob: typeof triggerSolveJob;
  readonly resolveCallbackUrl: typeof resolveCallbackUrl;
  readonly caseInputObjectPath: typeof caseInputObjectPath;
  readonly resultOutputObjectPath: typeof resultOutputObjectPath;
}

export type DispatchRefusal =
  | { readonly reason: 'PROJECT_NOT_FOUND' }
  | { readonly reason: 'FORBIDDEN' }
  | { readonly reason: 'CASE_NOT_FOUND' }
  | { readonly reason: 'ALREADY_RUNNING' }
  | { readonly reason: 'USE_PREVIEW_ENDPOINT' }
  | { readonly reason: 'NOT_MESHED' }
  | { readonly reason: 'ENGINEERING_TIER_NOT_PROVISIONED'; readonly missing: string[] }
  | { readonly reason: 'SOLVER_DISPATCH_FAILED'; readonly message: string };

export type DispatchRunResult =
  | { readonly ok: true; readonly runId: string; readonly execution: string }
  | ({ readonly ok: false } & DispatchRefusal);

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return Boolean(project.createdBy) && project.createdBy === user.id;
}

export async function dispatchEngineeringRun(
  deps: DispatchRunDeps,
  params: {
    projectId: string;
    caseId: string;
    user: { id: string; role: string };
    solverBackend?: 'preview' | 'engineering' | undefined;
    requestOrigin: string;
  },
): Promise<DispatchRunResult> {
  const { projectId, caseId, user } = params;

  const project = await deps.getProjectRecord(projectId);
  if (!project) return { ok: false, reason: 'PROJECT_NOT_FOUND' };
  if (!isProjectOwnerOrAdmin(user, project)) return { ok: false, reason: 'FORBIDDEN' };

  const simCase = await deps.getSimulationCase(projectId, caseId);
  if (!simCase) return { ok: false, reason: 'CASE_NOT_FOUND' };

  if (simCase.status === 'running' || simCase.status === 'queued') {
    return { ok: false, reason: 'ALREADY_RUNNING' };
  }

  // The Preview tier solves in-browser via POST .../run. Accepting it here
  // would spend cloud compute on a run the caller asked to keep local.
  if (params.solverBackend === 'preview') return { ok: false, reason: 'USE_PREVIEW_ENDPOINT' };

  const caseForExport = resolveExportCase(deps, simCase);
  if (!caseForExport) return { ok: false, reason: 'NOT_MESHED' };

  const mesh = caseForExport.mesh;
  if (!mesh) return { ok: false, reason: 'NOT_MESHED' };
  const dimensions = { nx: mesh.nx, ny: mesh.ny, nz: mesh.nz };

  // Built before any job exists, so an export failure throws here rather than
  // leaving a queued job with nothing behind it.
  const config = deps.buildOpenFOAMConfig(caseForExport);
  const files: Record<string, string> = {};
  for (const [path, content] of deps.generateCaseFiles(config)) files[path] = content;

  // Also checked before the job is created: an unprovisioned tier must not
  // queue work that nothing will ever pick up.
  if (!deps.isOpenFOAMCloudConfigured()) {
    return {
      ok: false,
      reason: 'ENGINEERING_TIER_NOT_PROVISIONED',
      missing: deps.missingOpenFOAMCloudConfig(),
    };
  }

  const cloud = deps.getOpenFOAMCloudConfig();

  const job = await deps.createRunJob(projectId, caseId, {
    ownerId: user.id,
    source: 'openfoam',
    totalIterations: caseForExport.solver.maxIterations,
  });
  await deps.updateSimulationCase(projectId, caseId, {
    status: 'queued',
    activeRunId: job.id,
    runSource: 'openfoam',
    solverBackend: 'engineering',
  });

  try {
    const inputObjectPath = deps.caseInputObjectPath(projectId, caseId, job.id);
    const resultObjectPath = deps.resultOutputObjectPath(projectId, caseId, job.id);
    const callbackUrl = deps.resolveCallbackUrl(
      params.requestOrigin,
      projectId,
      caseId,
      job.id,
      cloud.callbackBaseUrl,
    );

    await deps.uploadCaseInput(cloud, inputObjectPath, {
      solver: config.solver,
      caseName: config.caseName,
      files,
      dimensions,
      runJobId: job.id,
      callbackUrl,
      callbackSecret: cloud.callbackSecret,
    });

    const execution = await deps.triggerSolveJob(cloud, {
      runJobId: job.id,
      inputObjectPath,
      resultObjectPath,
      callbackUrl,
    });

    await deps.updateRunJobStatus(projectId, caseId, job.id, 'running', {
      startedAt: new Date().toISOString(),
      logTail: [`Cloud Run Job dispatched: ${execution}`],
    });
    await deps.updateCaseStatus(projectId, caseId, 'running');

    return { ok: true, runId: job.id, execution };
  } catch (dispatchErr) {
    // The job exists by this point, so it is marked failed rather than left
    // queued forever. The caller gets 502, not 500: the fault is downstream.
    const message =
      dispatchErr instanceof Error ? dispatchErr.message : 'Failed to dispatch solver job';
    await deps.updateRunJobStatus(projectId, caseId, job.id, 'failed', {
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
    await deps.updateCaseStatus(projectId, caseId, 'failed');
    return { ok: false, reason: 'SOLVER_DISPATCH_FAILED', message };
  }
}

/**
 * A building-scope case with no stored mesh gets one derived on the fly, which
 * mirrors the export route. Any other unmeshed case is refused.
 */
function resolveExportCase(deps: DispatchRunDeps, simCase: SimulationCase): SimulationCase | null {
  if (simCase.mesh) return simCase;
  if (simCase.simulationScope !== 'building' || !simCase.buildingGeometry) return null;

  const geometry = deps.toFallbackGeometry(simCase.buildingGeometry);
  const cellSize = deps.recommendCellSize(geometry);
  const mesh = deps.buildStructuredGrid(geometry, cellSize);
  return { ...simCase, mesh, geometry };
}
