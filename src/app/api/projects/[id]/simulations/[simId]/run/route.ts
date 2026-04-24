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
import { runBuildingCFDSimulation } from '@/lib/functions/building-cfd-simulation';
import { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import type {
  SimulationInput,
  ArtifactManifest,
  BuildingGeometryInput,
  BuildingSimulationResult,
  BuildingVisualizationPayload,
  ResidualSnapshot,
  FieldDescriptor,
  Vec3,
} from '@/types/simulation';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

function roomCenter(room: BuildingGeometryInput['rooms'][number]): Vec3 {
  return {
    x: room.origin.x + room.dimensions.width / 2,
    y: room.origin.y + room.dimensions.height / 2,
    z: room.origin.z + room.dimensions.length / 2,
  };
}

function buildBuildingVisualizationPayload(
  buildingGeometry: BuildingGeometryInput,
  buildingResult: BuildingSimulationResult,
): BuildingVisualizationPayload {
  const roomLookup = new Map(buildingGeometry.rooms.map((room) => [room.id, room]));

  let minTemp = Number.POSITIVE_INFINITY;
  let maxTemp = Number.NEGATIVE_INFINITY;
  let maxVelocity = 0;

  const rooms = buildingResult.roomStates.flatMap((state) => {
    const room = roomLookup.get(state.roomId);
    if (!room) return [];

    const nx = state.grid.length;
    const ny = state.grid[0]?.length ?? 0;
    if (nx === 0 || ny === 0) return [];

    const step = Math.max(1, Math.floor(Math.max(nx, ny) / 10));
    const samples: BuildingVisualizationPayload['rooms'][number]['samples'] = [];

    for (let x = 0; x < nx; x += step) {
      for (let y = 0; y < ny; y += step) {
        const cell = state.grid[x]?.[y];
        if (!cell) continue;

        const velocityMagnitude = Math.hypot(cell.u, cell.v);
        maxVelocity = Math.max(maxVelocity, velocityMagnitude);
        minTemp = Math.min(minTemp, cell.temp);
        maxTemp = Math.max(maxTemp, cell.temp);

        samples.push({
          position: {
            x: room.origin.x + ((x + 0.5) / nx) * room.dimensions.width,
            y: room.origin.y + room.dimensions.height * 0.5,
            z: room.origin.z + ((y + 0.5) / ny) * room.dimensions.length,
          },
          temperature: cell.temp,
          velocityMagnitude,
          velocity: { u: cell.u, v: cell.v },
        });
      }
    }

    return [{
      roomId: room.id,
      floorId: room.floorId,
      floorNumber: room.floorNumber,
      roomName: room.name,
      origin: room.origin,
      dimensions: room.dimensions,
      avgTemperature: state.avgTemperature,
      meanVelocity: state.meanVelocity,
      samples,
    }];
  });

  if (!Number.isFinite(minTemp)) minTemp = buildingResult.metrics.minTemperature;
  if (!Number.isFinite(maxTemp)) maxTemp = buildingResult.metrics.maxTemperature;

  const connections = buildingResult.connectionFlows.map((connection) => {
    const fromRoom = roomLookup.get(connection.fromRoom);
    const toRoom = roomLookup.get(connection.toRoom);
    return {
      id: connection.id,
      fromRoom: connection.fromRoom,
      toRoom: connection.toRoom,
      type: connection.type,
      flowRateM3s: connection.flowRateM3s ?? 0,
      openingAreaM2: connection.openingAreaM2,
      fromPoint: fromRoom ? roomCenter(fromRoom) : { x: 0, y: 0, z: 0 },
      toPoint: toRoom ? roomCenter(toRoom) : { x: 0, y: 0, z: 0 },
    };
  });

  return {
    iteration: buildingResult.iteration,
    rooms,
    connections,
    temperatureRange: { min: minTemp, max: maxTemp },
    velocityRange: { min: 0, max: maxVelocity },
  };
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

    const mesh = simCase.mesh;
    if (!mesh) {
      throw new Error('Simulation case mesh is required before running');
    }

    const solverConfig = {
      mode: 'engineering' as const,
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
      thermalDiffusivity:
        simCase.physics.fluid.thermalConductivity
        / (simCase.physics.fluid.density * simCase.physics.fluid.specificHeat),
      specificHeat: simCase.physics.fluid.specificHeat,
    };

    let result: {
      iteration: number;
      metrics: ArtifactManifest['metrics'];
      convergenceHistory: number[];
    };
    let buildingVisualization: BuildingVisualizationPayload | undefined = undefined;

    if (simCase.simulationScope === 'building') {
      if (!simCase.buildingGeometry) {
        throw new Error('Building simulation case is missing buildingGeometry');
      }

      const buildingResult = runBuildingCFDSimulation(
        {
          projectId,
          config: solverConfig,
          building: simCase.buildingGeometry,
        },
        {
          simulationId: jobId,
        },
      );

      result = {
        iteration: buildingResult.iteration,
        metrics: buildingResult.metrics,
        convergenceHistory: buildingResult.convergenceHistory,
      };
      buildingVisualization = buildBuildingVisualizationPayload(simCase.buildingGeometry, buildingResult);
    } else {
      const input: SimulationInput = {
        projectId,
        floorId: simCase.geometry.roomId,
        config: solverConfig,
        racks: simCase.geometry.racks,
        hvacUnits: simCase.geometry.hvacUnits,
        tiles: simCase.geometry.tiles,
        raisedFloorHeight: simCase.geometry.raisedFloorHeightM,
      };

      const roomResult = runCFDSimulation(input);
      result = {
        iteration: roomResult.iteration,
        metrics: roomResult.metrics,
        convergenceHistory: roomResult.convergenceHistory,
      };
    }

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
    const nx = mesh.nx;
    const ny = mesh.ny;
    const nz = mesh.nz;
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
      metricsSnapshot: result.metrics,
      ...(buildingVisualization ? { buildingVisualization } : {}),
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
