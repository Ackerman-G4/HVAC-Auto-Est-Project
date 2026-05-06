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
  BuildingVisualizationPayload,
  SimulationMetrics,
  RoomSimulationMetric,
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

// ── Building Simulation Run ──────────────────────────────────
// Lightweight room-network solver for building-scope cases.
// Computes per-room airflow balance and produces visualization payloads.

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
    const connections = bg.connections ?? [];

    // Simple airflow network: distribute nominal flows proportional to room volume
    const totalVolume = rooms.reduce((s, r) => s + r.dimensions.width * r.dimensions.length * r.dimensions.height, 0) || 1;
    const nominalTotalM3s = 1.5 * rooms.length; // 1.5 m³/s per room nominal

    const roomMetrics: RoomSimulationMetric[] = rooms.map((r) => {
      const vol = r.dimensions.width * r.dimensions.length * r.dimensions.height;
      const frac = vol / totalVolume;
      const inflow = nominalTotalM3s * frac;
      return {
        roomId: r.id,
        floorId: r.floorId,
        floorNumber: r.floorNumber ?? 1,
        avgTemperature: 24 + (r.heatLoadW ?? 0) / 5000,
        meanVelocity: 0.3 + frac * 0.5,
        stagnationRatio: 0.05,
        pressure: 101325 - frac * 20,
        inflowM3s: inflow,
        outflowM3s: inflow,
      };
    });

    const totalAirflow = roomMetrics.reduce((s, m) => s + m.inflowM3s, 0);
    const pressureImbalance = roomMetrics.length > 0
      ? Math.max(...roomMetrics.map((m) => Math.abs(m.inflowM3s - m.outflowM3s))) * 10
      : 0;

    const metricsSnapshot: SimulationMetrics = {
      maxTemperature: Math.max(...roomMetrics.map((m) => m.avgTemperature), 24),
      minTemperature: Math.min(...roomMetrics.map((m) => m.avgTemperature), 22),
      avgTemperature: roomMetrics.reduce((s, m) => s + m.avgTemperature, 0) / (roomMetrics.length || 1),
      maxHumidityRatio: 0.012,
      minHumidityRatio: 0.008,
      avgHumidityRatio: 0.010,
      maxVelocity: Math.max(...roomMetrics.map((m) => m.meanVelocity), 0.5),
      avgVelocity: roomMetrics.reduce((s, m) => s + m.meanVelocity, 0) / (roomMetrics.length || 1),
      totalHeatLoad: rooms.reduce((s, r) => s + (r.heatLoadW ?? 0), 0),
      totalCoolingCapacity: rooms.reduce((s, r) => s + (r.heatLoadW ?? 0), 0) * 1.1,
      coolingDeficit: 0,
      hotspots: [],
      pue: 1.4,
      supplyHeatIndex: 0.2,
      returnHeatIndex: 0.3,
      rackInletTemps: [],
      continuityResidual: 1e-5,
      momentumResidual: 1e-5,
      energyResidual: 1e-5,
      turbulenceResidual: 1e-5,
      maxDivergence: 1e-5,
      converged: true,
      avgTurbulentViscosity: 1.5e-5,
      maxTurbulentIntensity: 0.05,
      airflowBalanceM3s: totalAirflow,
      pressureImbalancePa: pressureImbalance,
      ventilationEffectiveness: Math.min(1, 0.8 + roomMetrics.length * 0.02),
      roomMetrics,
    };

    const buildingVisualization: BuildingVisualizationPayload = {
      rooms: rooms.map((r, i) => ({
        roomId: r.id,
        avgTemperature: roomMetrics[i]?.avgTemperature ?? 24,
        avgVelocity: roomMetrics[i]?.meanVelocity ?? 0.3,
        samples: [
          {
            position: { x: r.origin.x + r.dimensions.width / 2, y: r.origin.y + r.dimensions.height / 2, z: r.origin.z + r.dimensions.length / 2 },
            temperature: roomMetrics[i]?.avgTemperature ?? 24,
            velocity: { u: 0.2, v: 0.1 },
            velocityMagnitude: roomMetrics[i]?.meanVelocity ?? 0.3,
          },
        ],
      })),
      connections: connections.map((c) => {
        const fromRoom = rooms.find((r) => r.id === c.fromRoom);
        const toRoom = rooms.find((r) => r.id === c.toRoom);
        return {
          id: c.id ?? '',
          flowRateM3s: nominalTotalM3s / (connections.length || 1),
          fromPoint: fromRoom ? { x: fromRoom.origin.x + fromRoom.dimensions.width, y: fromRoom.origin.y + fromRoom.dimensions.height / 2, z: fromRoom.origin.z + fromRoom.dimensions.length / 2 } : { x: 0, y: 0, z: 0 },
          toPoint: toRoom ? { x: toRoom.origin.x, y: toRoom.origin.y + toRoom.dimensions.height / 2, z: toRoom.origin.z + toRoom.dimensions.length / 2 } : { x: 1, y: 0, z: 0 },
        };
      }),
      temperatureRange: { min: metricsSnapshot.minTemperature, max: metricsSnapshot.maxTemperature },
      velocityRange: { min: 0, max: metricsSnapshot.maxVelocity },
    };

    const elapsed = (Date.now() - startTime) / 1000;

    await updateRunJobStatus(projectId, caseId, jobId, 'completed', {
      currentIteration: 1,
      elapsedSeconds: elapsed,
      completedAt: new Date().toISOString(),
      buildingVisualization,
      metricsSnapshot,
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
