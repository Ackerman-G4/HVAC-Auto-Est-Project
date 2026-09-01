/**
 * Orchestration for starting and polling a simulation run.
 *
 * Extracted from `app/api/projects/[id]/simulations/[simId]/run/route.ts`
 * (TASK 3.1), which held authentication, rate limiting, ownership, case
 * lifecycle rules, solver dispatch and two full solver adapters in one 564-line
 * file. CLAUDE.md rule 7 confines a route handler to HTTP concerns.
 *
 * Mechanism: dependency inversion. Every store operation this module needs is
 * declared on `RunOrchestratorDeps` and supplied by the caller, so the module
 * imports nothing from `lib/firebase` and a test can drive every branch with
 * in-memory fakes rather than an emulator.
 *
 * Both entry points return a discriminated union rather than throwing or
 * writing a response. The handler maps `reason` onto a status code, which keeps
 * the status table in one readable place and lets these branches be asserted
 * without constructing a `Request`.
 */

import type { SimulationCase, RunJob, ArtifactManifest, RunSource } from '@/types/simulation';
import {
  executeInternalRun,
  executeInternalBuildingRun,
  type RunExecutionDeps,
  type MeshedCase,
  type BuildingCase,
} from './run-execution';

/** The caller, as established by the route's auth guard. */
export interface RunActor {
  id: string;
  role: string;
}

/** The subset of a project record ownership depends on. */
export interface ProjectOwnership {
  createdBy?: string;
}

export interface RunOrchestratorDeps extends RunExecutionDeps {
  getProjectRecord: (projectId: string) => Promise<ProjectOwnership | null>;
  getSimulationCase: (projectId: string, caseId: string) => Promise<SimulationCase | null>;
  createRunJob: (
    projectId: string,
    caseId: string,
    init: { ownerId: string; source: RunSource; totalIterations: number },
  ) => Promise<RunJob>;
  getRunJob: (projectId: string, caseId: string, jobId: string) => Promise<RunJob | null>;
  getArtifactManifest: (
    projectId: string,
    caseId: string,
    jobId: string,
  ) => Promise<ArtifactManifest | null>;
}

/**
 * Why a request could not proceed.
 *
 * Each maps to exactly one status code (see `RUN_FAILURE_STATUS`), so adding a
 * reason without deciding its status is a compile error rather than an
 * accidental 500.
 */
export type RunFailureReason =
  | 'PROJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'CASE_NOT_FOUND'
  | 'ALREADY_RUNNING'
  | 'NOT_MESHED'
  | 'MISSING_BUILDING_GEOMETRY';

export interface RunFailure {
  ok: false;
  reason: RunFailureReason;
  /** Human-readable description, safe to return to the client. */
  message: string;
}

export interface StartRunSuccess {
  ok: true;
  run: RunJob | null;
  case: SimulationCase | null;
  manifest: ArtifactManifest | null;
}

export interface PollRunSuccess {
  ok: true;
  run: RunJob | null;
  status: SimulationCase['status'];
  manifest: ArtifactManifest | null;
}

export type StartRunOutcome = StartRunSuccess | RunFailure;
export type PollRunOutcome = PollRunSuccess | RunFailure;

/** The single mapping from a domain reason to an HTTP status. */
export const RUN_FAILURE_STATUS: Record<RunFailureReason, number> = {
  PROJECT_NOT_FOUND: 404,
  CASE_NOT_FOUND: 404,
  FORBIDDEN: 403,
  ALREADY_RUNNING: 409,
  NOT_MESHED: 400,
  MISSING_BUILDING_GEOMETRY: 400,
};

function failure(reason: RunFailureReason, message: string): RunFailure {
  return { ok: false, reason, message };
}

/** An admin reaches any project; anyone else must be the recorded creator. */
export function canAccessProject(actor: RunActor, project: ProjectOwnership): boolean {
  if (actor.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === actor.id;
}

/**
 * Load the project and case, checking existence and access in order.
 *
 * Shared by both entry points so the two cannot drift on what a caller is
 * allowed to see.
 */
async function loadAccessibleCase(
  deps: RunOrchestratorDeps,
  actor: RunActor,
  projectId: string,
  caseId: string,
): Promise<{ ok: true; simCase: SimulationCase } | RunFailure> {
  const project = await deps.getProjectRecord(projectId);
  if (!project) return failure('PROJECT_NOT_FOUND', 'No project with that identifier.');

  if (!canAccessProject(actor, project)) {
    return failure('FORBIDDEN', 'Access denied.');
  }

  const simCase = await deps.getSimulationCase(projectId, caseId);
  if (!simCase) return failure('CASE_NOT_FOUND', 'No simulation case with that identifier.');

  return { ok: true, simCase };
}

/** A case that has everything its scope's solver requires. */
export type RunnableCase =
  | { kind: 'building'; simCase: BuildingCase }
  | { kind: 'room'; simCase: MeshedCase };

/**
 * Decide whether a case can actually be executed, and by which solver.
 *
 * The route previously checked `!simCase.mesh && scope !== 'building'`, which
 * let a building-scope case with no building geometry through to the room
 * solver, where `simCase.mesh!` threw a `TypeError` that was caught and
 * recorded as a failed run. The client saw "Cannot read properties of
 * undefined" attributed to the solver. Requiring each scope's own precondition
 * turns that into a 400 naming what is missing.
 */
export function resolveRunnableCase(simCase: SimulationCase): RunnableCase | RunFailure {
  if (simCase.simulationScope === 'building') {
    if (!simCase.buildingGeometry) {
      return failure(
        'MISSING_BUILDING_GEOMETRY',
        'This case is building-scope but has no building geometry. Rebuild it from the project floors before running.',
      );
    }
    return { kind: 'building', simCase: { ...simCase, buildingGeometry: simCase.buildingGeometry } };
  }

  if (!simCase.mesh) {
    return failure('NOT_MESHED', 'Generate a mesh before running.');
  }

  return { kind: 'room', simCase: { ...simCase, mesh: simCase.mesh } };
}

/** Statuses that mean a run is already in flight for this case. */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['running', 'queued']);

export interface StartRunRequest {
  actor: RunActor;
  projectId: string;
  caseId: string;
  /** Parsed from the request body; falls back to the case's recorded source. */
  source?: RunSource;
}

/**
 * Start a run.
 *
 * An internal run executes synchronously before this resolves, which is the
 * behaviour the route already had. An external source leaves the case `queued`
 * for a callback to advance.
 */
export async function startSimulationRun(
  deps: RunOrchestratorDeps,
  request: StartRunRequest,
): Promise<StartRunOutcome> {
  const { actor, projectId, caseId } = request;

  const loaded = await loadAccessibleCase(deps, actor, projectId, caseId);
  if (!loaded.ok) return loaded;

  const { simCase } = loaded;

  if (ACTIVE_STATUSES.has(simCase.status)) {
    return failure('ALREADY_RUNNING', 'This case already has an active run.');
  }

  const runnable = resolveRunnableCase(simCase);
  if ('reason' in runnable) return runnable;

  const source = request.source || simCase.runSource || 'internal';

  const job = await deps.createRunJob(projectId, caseId, {
    ownerId: actor.id,
    source,
    totalIterations: simCase.solver.maxIterations,
  });

  await deps.updateSimulationCase(projectId, caseId, {
    status: 'queued',
    activeRunId: job.id,
    runSource: source,
  });

  if (source === 'internal') {
    if (runnable.kind === 'building') {
      await executeInternalBuildingRun(deps, projectId, caseId, job.id, runnable.simCase);
    } else {
      await executeInternalRun(deps, projectId, caseId, job.id, runnable.simCase);
    }
  }

  // Re-read rather than returning the pre-execution objects: the executor has
  // written status, residuals and the manifest since, and the client polls
  // against this response.
  const updatedJob = await deps.getRunJob(projectId, caseId, job.id);
  const updatedCase = await deps.getSimulationCase(projectId, caseId);
  const manifest = updatedJob
    ? await deps.getArtifactManifest(projectId, caseId, updatedJob.id)
    : null;

  return { ok: true, run: updatedJob, case: updatedCase, manifest };
}

export interface PollRunRequest {
  actor: RunActor;
  projectId: string;
  caseId: string;
}

/** Poll the active run for a case. A case with no active run is not an error. */
export async function pollSimulationRun(
  deps: RunOrchestratorDeps,
  request: PollRunRequest,
): Promise<PollRunOutcome> {
  const { actor, projectId, caseId } = request;

  const loaded = await loadAccessibleCase(deps, actor, projectId, caseId);
  if (!loaded.ok) return loaded;

  const { simCase } = loaded;

  if (!simCase.activeRunId) {
    return { ok: true, run: null, status: simCase.status, manifest: null };
  }

  const job = await deps.getRunJob(projectId, caseId, simCase.activeRunId);
  const manifest = job ? await deps.getArtifactManifest(projectId, caseId, job.id) : null;

  return { ok: true, run: job, status: simCase.status, manifest };
}
