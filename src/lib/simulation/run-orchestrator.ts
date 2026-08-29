/**
 * Simulation run orchestration.
 *
 * REMEDIATION_PLAN.md TASK 3.1. This was 480 of the 564 lines inside
 * `api/projects/[id]/simulations/[simId]/run/route.ts`. At that size its
 * branches — not meshed, already running, solver threw, room state naming an
 * unknown room — were reachable only by driving an HTTP request against a
 * Firestore-backed case, which is why none of them had a test.
 *
 * Every dependency that touches the network is injected through
 * `RunOrchestratorDeps` rather than imported, so the whole lifecycle runs
 * in-process against fakes. The `import type` lines below are erased at compile
 * time: this module has no runtime dependency on Firebase.
 *
 * Failure is returned, never thrown. A thrown error crossing back into a route
 * means every handler needs a try/catch that maps it to a status, and the one
 * that forgets returns 500 for what is a 404.
 */

import type { getProjectRecord } from '@/lib/firebase/projects-store';
import type {
  appendResiduals,
  createRunJob,
  getArtifactManifest,
  getRunJob,
  getSimulationCase,
  saveArtifactManifest,
  saveRunFieldSnapshot,
  updateCaseStatus,
  updateRunJobStatus,
  updateSimulationCase,
} from '@/lib/firebase/simulation-cases-store';
import type { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import type { runBuildingCFDSimulation } from '@/lib/functions/building-cfd-simulation';
import type { buildRunFieldSnapshotFromResult } from '@/lib/simulation/field-snapshot';
import { buildBuildingVisualization } from '@/lib/simulation/building-visualization';
import { DEFAULT_FIELD_ENVELOPE } from '@/types/simulation';
import type {
  ArtifactManifest,
  FieldDescriptor,
  ResidualSnapshot,
  RunJob,
  SimulationCase,
  SimulationInput,
} from '@/types/simulation';

// ─── Injected dependencies ───────────────────────────────────

/**
 * Declared with `typeof` against the real exports so a signature change in a
 * store is a compile error here, not a runtime surprise in a fake.
 */
export interface RunOrchestratorDeps {
  readonly getProjectRecord: typeof getProjectRecord;
  readonly getSimulationCase: typeof getSimulationCase;
  readonly updateSimulationCase: typeof updateSimulationCase;
  readonly updateCaseStatus: typeof updateCaseStatus;
  readonly createRunJob: typeof createRunJob;
  readonly getRunJob: typeof getRunJob;
  readonly updateRunJobStatus: typeof updateRunJobStatus;
  readonly appendResiduals: typeof appendResiduals;
  readonly saveArtifactManifest: typeof saveArtifactManifest;
  readonly getArtifactManifest: typeof getArtifactManifest;
  readonly saveRunFieldSnapshot: typeof saveRunFieldSnapshot;
  readonly runCFDSimulation: typeof runCFDSimulation;
  readonly runBuildingCFDSimulation: typeof runBuildingCFDSimulation;
  readonly buildRunFieldSnapshotFromResult: typeof buildRunFieldSnapshotFromResult;
}

export interface RunActor {
  readonly id: string;
  readonly role: string;
}

// ─── Result unions ───────────────────────────────────────────

/** Every way a run request can be refused, each mapping to one status. */
export type RunRefusal =
  | { readonly reason: 'PROJECT_NOT_FOUND' }
  | { readonly reason: 'FORBIDDEN' }
  | { readonly reason: 'CASE_NOT_FOUND' }
  | { readonly reason: 'ALREADY_RUNNING' }
  | { readonly reason: 'NOT_MESHED' };

export interface StartRunSuccess {
  readonly run: RunJob | null;
  readonly case: SimulationCase | null;
  readonly manifest: ArtifactManifest | null;
}

export interface PollRunSuccess {
  readonly run: RunJob | null;
  readonly status: SimulationCase['status'];
  readonly manifest: ArtifactManifest | null;
}

export type StartRunResult =
  | ({ readonly ok: true } & StartRunSuccess)
  | ({ readonly ok: false } & RunRefusal);

export type PollRunResult =
  | ({ readonly ok: true } & PollRunSuccess)
  | ({ readonly ok: false } & RunRefusal);

// ─── Shared access check ─────────────────────────────────────

function isProjectOwnerOrAdmin(user: RunActor, project: { createdBy?: string }): boolean {
  if (user.role === 'admin') return true;
  return Boolean(project.createdBy) && project.createdBy === user.id;
}

/**
 * Resolve the project and case, refusing before any write happens.
 *
 * Both entry points need the identical four checks in the identical order, and
 * the route previously carried two hand-copied versions of them.
 */
async function resolveCase(
  deps: RunOrchestratorDeps,
  projectId: string,
  caseId: string,
  user: RunActor,
): Promise<{ ok: true; simCase: SimulationCase } | ({ ok: false } & RunRefusal)> {
  const project = await deps.getProjectRecord(projectId);
  if (!project) return { ok: false, reason: 'PROJECT_NOT_FOUND' };
  if (!isProjectOwnerOrAdmin(user, project)) return { ok: false, reason: 'FORBIDDEN' };

  const simCase = await deps.getSimulationCase(projectId, caseId);
  if (!simCase) return { ok: false, reason: 'CASE_NOT_FOUND' };

  return { ok: true, simCase };
}

function cloneDefaultFieldEnvelope() {
  return {
    ...DEFAULT_FIELD_ENVELOPE,
    units: { ...DEFAULT_FIELD_ENVELOPE.units },
    renderAxisMap: { ...DEFAULT_FIELD_ENVELOPE.renderAxisMap },
  };
}

/** Thermal diffusivity α = k / (ρ·cp). Grouped so the identity is stated once. */
function thermalDiffusivity(fluid: SimulationCase['physics']['fluid']): number {
  return fluid.thermalConductivity / (fluid.density * fluid.specificHeat);
}

// ─── Poll ────────────────────────────────────────────────────

export async function pollSimulationRun(
  deps: RunOrchestratorDeps,
  params: { projectId: string; caseId: string; user: RunActor },
): Promise<PollRunResult> {
  const resolved = await resolveCase(deps, params.projectId, params.caseId, params.user);
  if (!resolved.ok) return resolved;

  const { simCase } = resolved;
  if (!simCase.activeRunId) {
    return { ok: true, run: null, status: simCase.status, manifest: null };
  }

  const job = await deps.getRunJob(params.projectId, params.caseId, simCase.activeRunId);
  const manifest = job
    ? await deps.getArtifactManifest(params.projectId, params.caseId, job.id)
    : null;

  return { ok: true, run: job, status: simCase.status, manifest };
}

// ─── Start ───────────────────────────────────────────────────

export async function startSimulationRun(
  deps: RunOrchestratorDeps,
  params: {
    projectId: string;
    caseId: string;
    user: RunActor;
    source?: RunJob['source'];
  },
): Promise<StartRunResult> {
  const resolved = await resolveCase(deps, params.projectId, params.caseId, params.user);
  if (!resolved.ok) return resolved;

  const { simCase } = resolved;
  const { projectId, caseId } = params;

  if (simCase.status === 'running' || simCase.status === 'queued') {
    return { ok: false, reason: 'ALREADY_RUNNING' };
  }

  // A building-scope case is solved from its room network, so it needs no mesh.
  if (!simCase.mesh && simCase.simulationScope !== 'building') {
    return { ok: false, reason: 'NOT_MESHED' };
  }

  const source = params.source ?? simCase.runSource ?? 'internal';

  const job = await deps.createRunJob(projectId, caseId, {
    ownerId: params.user.id,
    source,
    totalIterations: simCase.solver.maxIterations,
  });

  await deps.updateSimulationCase(projectId, caseId, {
    status: 'queued',
    activeRunId: job.id,
    runSource: source,
  });

  if (source === 'internal') {
    if (simCase.simulationScope === 'building' && simCase.buildingGeometry) {
      await executeInternalBuildingRun(deps, projectId, caseId, job.id, simCase);
    } else {
      await executeInternalRun(deps, projectId, caseId, job.id, simCase);
    }
  }
  // An external source leaves the case queued until its callback advances it.

  const updatedJob = await deps.getRunJob(projectId, caseId, job.id);
  const updatedCase = await deps.getSimulationCase(projectId, caseId);
  const manifest = updatedJob
    ? await deps.getArtifactManifest(projectId, caseId, updatedJob.id)
    : null;

  return { ok: true, run: updatedJob, case: updatedCase, manifest };
}

// ─── Internal room-scope execution ───────────────────────────

/**
 * A solver failure marks the run failed and returns. It is deliberately not
 * rethrown: the run job carries the error, and the caller has already been
 * promised a created run.
 */
async function executeInternalRun(
  deps: RunOrchestratorDeps,
  projectId: string,
  caseId: string,
  jobId: string,
  simCase: SimulationCase,
): Promise<void> {
  const startTime = Date.now();

  try {
    await deps.updateRunJobStatus(projectId, caseId, jobId, 'running', {
      startedAt: new Date().toISOString(),
    });
    await deps.updateCaseStatus(projectId, caseId, 'running');

    // Guaranteed by the NOT_MESHED check in startSimulationRun.
    const mesh = simCase.mesh;
    if (!mesh) throw new Error('internal run reached the solver without a mesh');

    const input: SimulationInput = {
      projectId,
      floorId: simCase.geometry.roomId,
      config: {
        mode: 'engineering',
        gridResolution: mesh.cellSizeM,
        gridSizeX: mesh.nx,
        gridSizeY: mesh.ny,
        gridSizeZ: mesh.nz,
        iterations: simCase.solver.maxIterations,
        convergence: simCase.solver.convergenceTarget,
        timeStep: simCase.solver.timeStepS || 0.1,
        ambientTempC: simCase.physics.referenceTemperatureC,
        ambientHumidityRatio: 0.0093,
        airDensity: simCase.physics.fluid.density,
        airViscosity: simCase.physics.fluid.viscosity,
        thermalDiffusivity: thermalDiffusivity(simCase.physics.fluid),
        specificHeat: simCase.physics.fluid.specificHeat,
      },
      racks: simCase.geometry.racks,
      hvacUnits: simCase.geometry.hvacUnits,
      tiles: simCase.geometry.tiles,
      raisedFloorHeight: simCase.geometry.raisedFloorHeightM,
    };

    const result = deps.runCFDSimulation(input);
    const elapsed = (Date.now() - startTime) / 1000;

    const residual: ResidualSnapshot = {
      iteration: result.iteration,
      continuity: result.metrics.continuityResidual,
      momentumX: result.metrics.momentumResidual,
      momentumY: result.metrics.momentumResidual,
      momentumZ: result.metrics.momentumResidual,
      energy: result.metrics.energyResidual,
      k: result.metrics.turbulenceResidual,
      epsilon: result.metrics.turbulenceResidual,
    };
    await deps.appendResiduals(projectId, caseId, jobId, residual, result.iteration, elapsed);

    await deps.saveArtifactManifest(
      projectId,
      caseId,
      buildArtifactManifest({ caseId, jobId, mesh, result }),
    );

    // The snapshot is an optimisation for playback, not part of the result. A
    // failure here must not fail a converged run, so it is logged and dropped.
    try {
      const snapshot = deps.buildRunFieldSnapshotFromResult({
        caseId,
        runJobId: jobId,
        source: 'internal',
        result,
      });
      await deps.saveRunFieldSnapshot(projectId, caseId, jobId, snapshot);
    } catch (snapshotError) {
      console.warn('Failed to persist run field snapshot:', snapshotError);
    }

    await deps.updateRunJobStatus(projectId, caseId, jobId, 'completed', {
      currentIteration: result.iteration,
      elapsedSeconds: elapsed,
      completedAt: new Date().toISOString(),
    });
    await deps.updateSimulationCase(projectId, caseId, { status: 'completed', resultId: jobId });
  } catch (err) {
    await markRunFailed(deps, projectId, caseId, jobId, startTime, err, 'Unknown solver error');
  }
}

/** float32 per scalar cell; three of them per vector cell. */
const BYTES_PER_SCALAR_CELL = 4;
const BYTES_PER_VECTOR_CELL = 12;
/** Observed compression ratio for these fields. Sizing hint only. */
const COMPRESSION_RATIO = 0.6;

function buildArtifactManifest(args: {
  caseId: string;
  jobId: string;
  mesh: NonNullable<SimulationCase['mesh']>;
  result: ReturnType<typeof runCFDSimulation>;
}): ArtifactManifest {
  const { caseId, jobId, mesh, result } = args;
  const dimensions = { nx: mesh.nx, ny: mesh.ny, nz: mesh.nz };
  const cells = mesh.nx * mesh.ny * mesh.nz;
  const scalarSize = Math.ceil(cells * BYTES_PER_SCALAR_CELL * COMPRESSION_RATIO);
  const vectorSize = Math.ceil(cells * BYTES_PER_VECTOR_CELL * COMPRESSION_RATIO);

  const fields: FieldDescriptor[] = [
    {
      name: 'temperature',
      dimensions,
      dataType: 'scalar',
      range: { min: result.metrics.minTemperature, max: result.metrics.maxTemperature },
      compressedSizeBytes: scalarSize,
    },
    {
      name: 'velocity',
      dimensions,
      dataType: 'vector3',
      range: { min: 0, max: result.metrics.maxVelocity },
      compressedSizeBytes: vectorSize,
    },
    {
      name: 'pressure',
      dimensions,
      dataType: 'scalar',
      range: { min: 0, max: 500 },
      compressedSizeBytes: scalarSize,
    },
    {
      name: 'humidity',
      dimensions,
      dataType: 'scalar',
      range: { min: result.metrics.minHumidityRatio, max: result.metrics.maxHumidityRatio },
      compressedSizeBytes: scalarSize,
    },
  ];

  return {
    caseId,
    runJobId: jobId,
    source: 'internal',
    fieldEnvelope: cloneDefaultFieldEnvelope(),
    fields,
    metrics: result.metrics,
    convergenceHistory: result.convergenceHistory,
    totalSizeBytes: fields.reduce((sum, field) => sum + field.compressedSizeBytes, 0),
    createdAt: new Date().toISOString(),
  };
}

// ─── Internal building-scope execution ───────────────────────

async function executeInternalBuildingRun(
  deps: RunOrchestratorDeps,
  projectId: string,
  caseId: string,
  jobId: string,
  simCase: SimulationCase,
): Promise<void> {
  const startTime = Date.now();

  try {
    await deps.updateRunJobStatus(projectId, caseId, jobId, 'running', {
      startedAt: new Date().toISOString(),
    });
    await deps.updateCaseStatus(projectId, caseId, 'running');

    const building = simCase.buildingGeometry;
    if (!building) throw new Error('building run reached the solver without geometry');

    const timeStepS = simCase.solver.timeStepS || 0.1;
    const progressResiduals: ResidualSnapshot[] = [];

    const buildingResult = deps.runBuildingCFDSimulation(
      {
        projectId,
        building,
        config: {
          mode: 'engineering',
          gridResolution: Math.max(0.25, simCase.mesh?.cellSizeM ?? 0.5),
          gridSizeX: simCase.mesh?.nx ?? 20,
          gridSizeY: simCase.mesh?.ny ?? 20,
          gridSizeZ: Math.max(6, simCase.mesh?.nz ?? 8),
          iterations: simCase.solver.maxIterations,
          convergence: simCase.solver.convergenceTarget,
          timeStep: timeStepS,
          ambientTempC: simCase.physics.referenceTemperatureC,
          ambientHumidityRatio: 0.0093,
          airDensity: simCase.physics.fluid.density,
          airViscosity: simCase.physics.fluid.viscosity,
          thermalDiffusivity: thermalDiffusivity(simCase.physics.fluid),
          specificHeat: simCase.physics.fluid.specificHeat,
          progressEmitInterval: Math.max(5, Math.floor(simCase.solver.maxIterations / 20)),
        },
      },
      {
        simulationId: jobId,
        onProgress: (progress) => {
          progressResiduals.push({
            iteration: progress.iteration,
            continuity: progress.continuityResidual ?? 0,
            momentumX: progress.momentumResidual ?? 0,
            momentumY: progress.momentumResidual ?? 0,
            momentumZ: progress.momentumResidual ?? 0,
            energy: progress.energyResidual ?? 0,
            k: progress.momentumResidual,
            epsilon: progress.momentumResidual,
          });
        },
      },
    );

    // A solver that emitted no progress still produced a result, so record one
    // residual from the final state rather than leaving the history empty.
    const residuals: ResidualSnapshot[] =
      progressResiduals.length > 0
        ? progressResiduals
        : [
            {
              iteration: buildingResult.iteration,
              continuity: buildingResult.metrics.continuityResidual,
              momentumX: buildingResult.metrics.momentumResidual,
              momentumY: buildingResult.metrics.momentumResidual,
              momentumZ: buildingResult.metrics.momentumResidual,
              energy: buildingResult.metrics.energyResidual,
              k: buildingResult.metrics.turbulenceResidual,
              epsilon: buildingResult.metrics.turbulenceResidual,
            },
          ];

    for (const residual of residuals) {
      await deps.appendResiduals(
        projectId,
        caseId,
        jobId,
        residual,
        residual.iteration,
        Math.max(0.001, residual.iteration * timeStepS),
      );
    }

    const buildingVisualization = buildBuildingVisualization({
      rooms: building.rooms ?? [],
      roomStates: buildingResult.roomStates,
      connectionFlows: buildingResult.connectionFlows,
      temperatureRange: {
        min: buildingResult.metrics.minTemperature,
        max: buildingResult.metrics.maxTemperature,
      },
      maxVelocity: buildingResult.metrics.maxVelocity,
    });

    await deps.updateRunJobStatus(projectId, caseId, jobId, 'completed', {
      currentIteration: buildingResult.iteration,
      elapsedSeconds: (Date.now() - startTime) / 1000,
      completedAt: new Date().toISOString(),
      buildingVisualization,
      metricsSnapshot: buildingResult.metrics,
    });
    await deps.updateSimulationCase(projectId, caseId, { status: 'completed', resultId: jobId });
  } catch (err) {
    await markRunFailed(
      deps,
      projectId,
      caseId,
      jobId,
      startTime,
      err,
      'Unknown building solver error',
    );
  }
}

/** Both execution paths fail identically; the route carried two copies of this. */
async function markRunFailed(
  deps: RunOrchestratorDeps,
  projectId: string,
  caseId: string,
  jobId: string,
  startTime: number,
  err: unknown,
  fallbackMessage: string,
): Promise<void> {
  await deps.updateRunJobStatus(projectId, caseId, jobId, 'failed', {
    elapsedSeconds: (Date.now() - startTime) / 1000,
    errorMessage: err instanceof Error ? err.message : fallbackMessage,
    completedAt: new Date().toISOString(),
  });
  await deps.updateCaseStatus(projectId, caseId, 'failed');
}
