/**
 * Simulation Run API — POST to start a run, GET to poll status
 * POST /api/projects/[id]/simulations/[simId]/run  — Start execution
 * GET  /api/projects/[id]/simulations/[simId]/run  — Poll active run
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  updateCaseStatus,
  updateSimulationCase,
  createRunJob,
  getRunJob,
  getArtifactManifest,
  updateRunJobStatus,
  appendResiduals,
  saveArtifactManifest,
  saveRunFieldSnapshot,
} from '@/lib/firebase/simulation-cases-store';
import { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import { runBuildingCFDSimulation } from '@/lib/functions/building-cfd-simulation';
import { buildRunFieldSnapshotFromResult } from '@/lib/simulation/field-snapshot';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import { DEFAULT_FIELD_ENVELOPE } from '@/types/simulation';
import type {
  SimulationInput,
  ArtifactManifest,
  ResidualSnapshot,
  FieldDescriptor,
  BuildingVisualizationPayload,
} from '@/types/simulation';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

const SIMULATION_RUN_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 6,
} as const;

const SIMULATION_RUN_STATUS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 120,
} as const;

function cloneDefaultFieldEnvelope() {
  return {
    ...DEFAULT_FIELD_ENVELOPE,
    units: { ...DEFAULT_FIELD_ENVELOPE.units },
    renderAxisMap: { ...DEFAULT_FIELD_ENVELOPE.renderAxisMap },
  };
}

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-run-get', SIMULATION_RUN_STATUS_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

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
    const manifest = job ? await getArtifactManifest(projectId, simId, job.id) : null;
    return NextResponse.json({
      run: job,
      status: simCase.status,
      manifest,
      fieldEnvelope: manifest?.fieldEnvelope ?? null,
    });
  } catch (error) {
    console.error('GET .../run error:', error);
    const d = getErrorDetails(error, 'Failed to poll run status');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-run-post', SIMULATION_RUN_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

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

    if (!simCase.mesh && simCase.simulationScope !== 'building') {
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
      // Branch: building-scope uses a lightweight network solver
      if (simCase.simulationScope === 'building' && simCase.buildingGeometry) {
        await executeInternalBuildingRun(projectId, simId, job.id, simCase);
      } else {
        // Run the internal solver synchronously (same as existing baseline)
        await executeInternalRun(projectId, simId, job.id, simCase, auth.user.id);
      }
    }
    // For external sources, the case stays 'queued' until an external callback
    // or polling mechanism advances the lifecycle (Step 5/6)

    const updatedJob = await getRunJob(projectId, simId, job.id);
    const updatedCase = await getSimulationCase(projectId, simId);
    const manifest = updatedJob ? await getArtifactManifest(projectId, simId, updatedJob.id) : null;

    return NextResponse.json({
      run: updatedJob,
      case: updatedCase,
      manifest,
      fieldEnvelope: manifest?.fieldEnvelope ?? null,
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
      fieldEnvelope: cloneDefaultFieldEnvelope(),
      fields,
      metrics: result.metrics,
      convergenceHistory: result.convergenceHistory,
      totalSizeBytes: fields.reduce((s, f) => s + f.compressedSizeBytes, 0),
      createdAt: new Date().toISOString(),
    };

    await saveArtifactManifest(projectId, caseId, manifest);

    try {
      const snapshot = buildRunFieldSnapshotFromResult({
        caseId,
        runJobId: jobId,
        source: 'internal',
        result,
      });
      await saveRunFieldSnapshot(projectId, caseId, jobId, snapshot);
    } catch (snapshotError) {
      console.warn('Failed to persist run field snapshot:', snapshotError);
    }

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

// ── Building Simulation Run ──────────────────────────────────

function toRoomVisualizationSamples(
  room: NonNullable<NonNullable<Awaited<ReturnType<typeof getSimulationCase>>>['buildingGeometry']>['rooms'][number],
  grid: Array<Array<{ u: number; v: number; temp: number }>>,
): BuildingVisualizationPayload['rooms'][number]['samples'] {
  const nx = grid.length;
  const ny = grid[0]?.length ?? 0;
  if (!nx || !ny) return [];

  const maxSamples = 420;
  const stride = Math.max(1, Math.floor(Math.sqrt((nx * ny) / maxSamples)));
  const samples: BuildingVisualizationPayload['rooms'][number]['samples'] = [];

  for (let x = 0; x < nx; x += stride) {
    for (let y = 0; y < ny; y += stride) {
      const cell = grid[x]?.[y];
      if (!cell) continue;

      samples.push({
        position: {
          x: room.origin.x + ((x + 0.5) / nx) * room.dimensions.width,
          y: room.origin.y + room.dimensions.height * 0.5,
          z: room.origin.z + ((y + 0.5) / ny) * room.dimensions.length,
        },
        temperature: cell.temp,
        velocity: {
          u: cell.u,
          v: cell.v,
        },
        velocityMagnitude: Math.hypot(cell.u, cell.v),
      });
    }
  }

  return samples;
}

function roomCenter(
  room: NonNullable<NonNullable<Awaited<ReturnType<typeof getSimulationCase>>>['buildingGeometry']>['rooms'][number],
) {
  return {
    x: room.origin.x + room.dimensions.width / 2,
    y: room.origin.y + room.dimensions.height / 2,
    z: room.origin.z + room.dimensions.length / 2,
  };
}

function connectionEndpoint(
  fromRoom: NonNullable<NonNullable<Awaited<ReturnType<typeof getSimulationCase>>>['buildingGeometry']>['rooms'][number],
  toRoom: NonNullable<NonNullable<Awaited<ReturnType<typeof getSimulationCase>>>['buildingGeometry']>['rooms'][number],
) {
  const from = roomCenter(fromRoom);
  const to = roomCenter(toRoom);

  const dx = to.x - from.x;
  const dz = to.z - from.z;

  if (Math.abs(dx) >= Math.abs(dz)) {
    return {
      x: from.x + Math.sign(dx || 1) * fromRoom.dimensions.width * 0.5,
      y: from.y,
      z: from.z,
    };
  }

  return {
    x: from.x,
    y: from.y,
    z: from.z + Math.sign(dz || 1) * fromRoom.dimensions.length * 0.5,
  };
}

async function executeInternalBuildingRun(
  projectId: string,
  caseId: string,
  jobId: string,
  simCase: NonNullable<Awaited<ReturnType<typeof getSimulationCase>>>,
): Promise<void> {
  const startTime = Date.now();
  try {
    await updateRunJobStatus(projectId, caseId, jobId, 'running', {
      startedAt: new Date().toISOString(),
    });
    await updateCaseStatus(projectId, caseId, 'running');

    const bg = simCase.buildingGeometry!;
    const rooms = bg.rooms ?? [];
    const progressResiduals: ResidualSnapshot[] = [];

    const buildingResult = runBuildingCFDSimulation(
      {
        projectId,
        building: bg,
        config: {
          mode: 'engineering',
          gridResolution: Math.max(0.25, simCase.mesh?.cellSizeM ?? 0.5),
          gridSizeX: simCase.mesh?.nx ?? 20,
          gridSizeY: simCase.mesh?.ny ?? 20,
          gridSizeZ: Math.max(6, simCase.mesh?.nz ?? 8),
          iterations: simCase.solver.maxIterations,
          convergence: simCase.solver.convergenceTarget,
          timeStep: simCase.solver.timeStepS || 0.1,
          ambientTempC: simCase.physics.referenceTemperatureC,
          ambientHumidityRatio: 0.0093,
          airDensity: simCase.physics.fluid.density,
          airViscosity: simCase.physics.fluid.viscosity,
          thermalDiffusivity:
            simCase.physics.fluid.thermalConductivity
            / (simCase.physics.fluid.density * simCase.physics.fluid.specificHeat),
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

    if (progressResiduals.length > 0) {
      for (const residual of progressResiduals) {
        const elapsedSec = Math.max(0.001, residual.iteration * (simCase.solver.timeStepS || 0.1));
        await appendResiduals(projectId, caseId, jobId, residual, residual.iteration, elapsedSec);
      }
    } else {
      const fallbackResidual: ResidualSnapshot = {
        iteration: buildingResult.iteration,
        continuity: buildingResult.metrics.continuityResidual,
        momentumX: buildingResult.metrics.momentumResidual,
        momentumY: buildingResult.metrics.momentumResidual,
        momentumZ: buildingResult.metrics.momentumResidual,
        energy: buildingResult.metrics.energyResidual,
        k: buildingResult.metrics.turbulenceResidual,
        epsilon: buildingResult.metrics.turbulenceResidual,
      };
      await appendResiduals(
        projectId,
        caseId,
        jobId,
        fallbackResidual,
        buildingResult.iteration,
        Math.max(0.001, buildingResult.iteration * (simCase.solver.timeStepS || 0.1)),
      );
    }

    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const buildingVisualization: BuildingVisualizationPayload = {
      rooms: buildingResult.roomStates
        .map((state) => {
          const room = roomById.get(state.roomId);
          if (!room) return null;

          return {
            roomId: room.id,
            avgTemperature: state.avgTemperature,
            avgVelocity: state.meanVelocity,
            samples: toRoomVisualizationSamples(room, state.grid),
          };
        })
        .filter((room): room is BuildingVisualizationPayload['rooms'][number] => Boolean(room)),
      connections: buildingResult.connectionFlows.map((connection, index) => {
        const fromRoom = roomById.get(connection.fromRoom);
        const toRoom = roomById.get(connection.toRoom);
        const fallbackFrom = { x: 0, y: 0, z: 0 };
        const fallbackTo = { x: 0, y: 0, z: 0 };

        return {
          id: connection.id ?? `connection-${index + 1}`,
          flowRateM3s: connection.flowRateM3s ?? 0,
          fromPoint: fromRoom && toRoom ? connectionEndpoint(fromRoom, toRoom) : fallbackFrom,
          toPoint: fromRoom && toRoom ? connectionEndpoint(toRoom, fromRoom) : fallbackTo,
        };
      }),
      temperatureRange: {
        min: buildingResult.metrics.minTemperature,
        max: buildingResult.metrics.maxTemperature,
      },
      velocityRange: {
        min: 0,
        max: buildingResult.metrics.maxVelocity,
      },
    };

    const elapsed = (Date.now() - startTime) / 1000;

    await updateRunJobStatus(projectId, caseId, jobId, 'completed', {
      currentIteration: buildingResult.iteration,
      elapsedSeconds: elapsed,
      completedAt: new Date().toISOString(),
      buildingVisualization,
      metricsSnapshot: buildingResult.metrics,
    });

    await updateSimulationCase(projectId, caseId, {
      status: 'completed',
      resultId: jobId,
    });
  } catch (err) {
    const elapsed = (Date.now() - startTime) / 1000;
    const errorMsg = err instanceof Error ? err.message : 'Unknown building solver error';
    await updateRunJobStatus(projectId, caseId, jobId, 'failed', {
      elapsedSeconds: elapsed,
      errorMessage: errorMsg,
      completedAt: new Date().toISOString(),
    });
    await updateCaseStatus(projectId, caseId, 'failed');
  }
}
