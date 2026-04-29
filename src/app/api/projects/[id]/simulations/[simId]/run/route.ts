/**
 * Simulation Run API — POST to start a run, GET to poll status
 * POST /api/projects/[id]/simulations/[simId]/run  — Start execution
 * GET  /api/projects/[id]/simulations/[simId]/run  — Poll active run
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  updateCaseStatus,
  updateSimulationCase,
  createRunJob,
  getRunJob,
  updateRunJobStatus,
  appendResiduals,
  saveArtifactManifest,
} from '@/lib/firebase/simulation-cases-store';
import { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import type {
  SimulationInput,
  ArtifactManifest,
  ResidualSnapshot,
  FieldDescriptor,
} from '@/types/simulation';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'Access denied.', 'FORBIDDEN');
    }

    const simCase = await getSimulationCase(projectId, simId);
    if (!simCase) {
      return errorResponse(404, 'Case not found', 'No case.', 'CASE_NOT_FOUND');
    }

    if (!simCase.activeRunId) {
      return NextResponse.json({ run: null, status: simCase.status });
    }

    const job = await getRunJob(projectId, simId, simCase.activeRunId);
    return NextResponse.json({ run: job, status: simCase.status });
  } catch (error) {
    console.error('GET .../run error:', error);
    const d = getErrorDetails(error, 'Failed to poll run status');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'Access denied.', 'FORBIDDEN');
    }

    const simCase = await getSimulationCase(projectId, simId);
    if (!simCase) {
      return errorResponse(404, 'Case not found', 'No case.', 'CASE_NOT_FOUND');
    }

    if (simCase.status === 'running' || simCase.status === 'queued') {
      return errorResponse(409, 'Already running', 'Case already has an active run.', 'ALREADY_RUNNING');
    }

    if (!simCase.mesh) {
      return errorResponse(400, 'Not meshed', 'Generate a mesh before running.', 'NOT_MESHED');
    }

    const body = await request.json().catch(() => ({}));
    const source = body.source || simCase.runSource || 'internal';

    // Create the run job
    const job = await createRunJob(projectId, simId, {
      ownerId: auth.user.id,
      source,
      totalIterations: simCase.solver.maxIterations,
    });

    // Update case to queued
    await updateSimulationCase(projectId, simId, {
      status: 'queued',
      activeRunId: job.id,
      runSource: source,
    });

    if (source === 'internal') {
      // Run the internal solver synchronously (same as existing baseline)
      await executeInternalRun(projectId, simId, job.id, simCase, auth.user.id);
    }
    // For external sources, the case stays 'queued' until an external callback
    // or polling mechanism advances the lifecycle (Step 5/6)

    const updatedJob = await getRunJob(projectId, simId, job.id);
    const updatedCase = await getSimulationCase(projectId, simId);

    return NextResponse.json({
      run: updatedJob,
      case: updatedCase,
    }, { status: 201 });
  } catch (error) {
    console.error('POST .../run error:', error);
    const d = getErrorDetails(error, 'Failed to start simulation run');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

// ── Internal Run Execution ──────────────────────────────────

async function executeInternalRun(
  projectId: string,
  caseId: string,
  jobId: string,
  simCase: NonNullable<Awaited<ReturnType<typeof getSimulationCase>>>,
  _ownerId: string,
): Promise<void> {
  const startTime = Date.now();

  try {
    await updateRunJobStatus(projectId, caseId, jobId, 'running', {
      startedAt: new Date().toISOString(),
    });
    await updateCaseStatus(projectId, caseId, 'running');

    // Build SimulationInput from case data (bridge to existing solver)
    const input: SimulationInput = {
      projectId,
      floorId: simCase.geometry.roomId,
      config: {
        mode: 'engineering',
        gridResolution: simCase.mesh!.cellSizeM,
        gridSizeX: simCase.mesh!.nx,
        gridSizeY: simCase.mesh!.ny,
        gridSizeZ: simCase.mesh!.nz,
        iterations: simCase.solver.maxIterations,
        convergence: simCase.solver.convergenceTarget,
        timeStep: simCase.solver.timeStepS || 0.1,
        ambientTempC: simCase.physics.referenceTemperatureC,
        ambientHumidityRatio: 0.0093,
        airDensity: simCase.physics.fluid.density,
        airViscosity: simCase.physics.fluid.viscosity,
        thermalDiffusivity: simCase.physics.fluid.thermalConductivity / (simCase.physics.fluid.density * simCase.physics.fluid.specificHeat),
        specificHeat: simCase.physics.fluid.specificHeat,
      },
      racks: simCase.geometry.racks,
      hvacUnits: simCase.geometry.hvacUnits,
      tiles: simCase.geometry.tiles,
      raisedFloorHeight: simCase.geometry.raisedFloorHeightM,
    };

    const result = runCFDSimulation(input);

    const elapsed = (Date.now() - startTime) / 1000;

    // Build residual snapshot from result
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

    await appendResiduals(projectId, caseId, jobId, residual, result.iteration, elapsed);

    // Build artifact manifest
    const nx = simCase.mesh!.nx;
    const ny = simCase.mesh!.ny;
    const nz = simCase.mesh!.nz;
    const scalarSize = nx * ny * nz * 4; // float32
    const vectorSize = nx * ny * nz * 12; // 3x float32

    const fields: FieldDescriptor[] = [
      {
        name: 'temperature',
        dimensions: { nx, ny, nz },
        dataType: 'scalar',
        range: { min: result.metrics.minTemperature, max: result.metrics.maxTemperature },
        compressedSizeBytes: Math.ceil(scalarSize * 0.6),
      },
      {
        name: 'velocity',
        dimensions: { nx, ny, nz },
        dataType: 'vector3',
        range: { min: 0, max: result.metrics.maxVelocity },
        compressedSizeBytes: Math.ceil(vectorSize * 0.6),
      },
      {
        name: 'pressure',
        dimensions: { nx, ny, nz },
        dataType: 'scalar',
        range: { min: 0, max: 500 },
        compressedSizeBytes: Math.ceil(scalarSize * 0.6),
      },
      {
        name: 'humidity',
        dimensions: { nx, ny, nz },
        dataType: 'scalar',
        range: { min: result.metrics.minHumidityRatio, max: result.metrics.maxHumidityRatio },
        compressedSizeBytes: Math.ceil(scalarSize * 0.6),
      },
    ];

    const manifest: ArtifactManifest = {
      caseId,
      runJobId: jobId,
      source: 'internal',
      fields,
      metrics: result.metrics,
      convergenceHistory: result.convergenceHistory,
      totalSizeBytes: fields.reduce((s, f) => s + f.compressedSizeBytes, 0),
      createdAt: new Date().toISOString(),
    };

    await saveArtifactManifest(projectId, caseId, manifest);

    await updateRunJobStatus(projectId, caseId, jobId, 'completed', {
      currentIteration: result.iteration,
      elapsedSeconds: elapsed,
      completedAt: new Date().toISOString(),
    });

    await updateSimulationCase(projectId, caseId, {
      status: 'completed',
      resultId: jobId,
    });
  } catch (err) {
    const elapsed = (Date.now() - startTime) / 1000;
    const errorMsg = err instanceof Error ? err.message : 'Unknown solver error';

    await updateRunJobStatus(projectId, caseId, jobId, 'failed', {
      elapsedSeconds: elapsed,
      errorMessage: errorMsg,
      completedAt: new Date().toISOString(),
    });
    await updateCaseStatus(projectId, caseId, 'failed');
  }
}
