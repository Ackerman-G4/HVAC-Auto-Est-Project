/**
 * Internal solver execution for a simulation run.
 *
 * Extracted from the run route handler (TASK 3.1). The handler is an HTTP
 * boundary; deciding how a case is turned into solver input, and recording the
 * outcome against the run job, is not an HTTP concern.
 *
 * Both executors own their failure handling: a solver that throws is recorded
 * as a failed run rather than propagated, because the run job is the record the
 * client polls and leaving it in `running` after a crash strands the case.
 */

import { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import { runBuildingCFDSimulation } from '@/lib/functions/building-cfd-simulation';
import { buildRunFieldSnapshotFromResult } from '@/lib/simulation/field-snapshot';
import { safeDivide } from '@/lib/engine/numeric-guards';
import { DEFAULT_FIELD_ENVELOPE } from '@/types/simulation';
import type {
  SimulationInput,
  SimulationCase,
  CaseStatus,
  ArtifactManifest,
  ResidualSnapshot,
  FieldDescriptor,
  BuildingRoom,
  BuildingVisualizationPayload,
} from '@/types/simulation';

/** A case known to carry a mesh, which the room-scope solver requires. */
export type MeshedCase = SimulationCase & { mesh: NonNullable<SimulationCase['mesh']> };

/** A case known to carry building geometry, which the network solver requires. */
export type BuildingCase = SimulationCase & {
  buildingGeometry: NonNullable<SimulationCase['buildingGeometry']>;
};

/**
 * The store writes an executor performs. Injected rather than imported so the
 * executors carry no Firebase dependency and can be driven by fakes.
 */
export interface RunExecutionDeps {
  updateRunJobStatus: (
    projectId: string,
    caseId: string,
    jobId: string,
    status: 'running' | 'completed' | 'failed',
    patch: Record<string, unknown>,
  ) => Promise<unknown>;
  updateCaseStatus: (projectId: string, caseId: string, status: CaseStatus) => Promise<unknown>;
  updateSimulationCase: (
    projectId: string,
    caseId: string,
    patch: Record<string, unknown>,
  ) => Promise<unknown>;
  appendResiduals: (
    projectId: string,
    caseId: string,
    jobId: string,
    residual: ResidualSnapshot,
    iteration: number,
    elapsedSeconds: number,
  ) => Promise<unknown>;
  saveArtifactManifest: (
    projectId: string,
    caseId: string,
    manifest: ArtifactManifest,
  ) => Promise<unknown>;
  saveRunFieldSnapshot: (
    projectId: string,
    caseId: string,
    jobId: string,
    snapshot: ReturnType<typeof buildRunFieldSnapshotFromResult>,
  ) => Promise<unknown>;
  /** Wall-clock source. Injected so a test can assert elapsed time. */
  now: () => number;
}

/** Ambient humidity ratio, kg water per kg dry air. */
const AMBIENT_HUMIDITY_RATIO = 0.0093;

/** Compression achieved on a field payload, as a fraction of the raw size. */
const FIELD_COMPRESSION_RATIO = 0.6;

/** Bytes in a float32, the storage unit for a scalar field sample. */
const BYTES_PER_SCALAR_SAMPLE = 4;

/** Bytes in a 3-component float32 vector sample. */
const BYTES_PER_VECTOR_SAMPLE = 12;

function cloneDefaultFieldEnvelope() {
  return {
    ...DEFAULT_FIELD_ENVELOPE,
    units: { ...DEFAULT_FIELD_ENVELOPE.units },
    renderAxisMap: { ...DEFAULT_FIELD_ENVELOPE.renderAxisMap },
  };
}

/**
 * Thermal diffusivity, m2/s. The identity is alpha = k / (rho * cp).
 *
 * Density and specific heat both arrive from the stored case rather than being
 * written here, so the denominator originates outside the function and is
 * guarded (CLAUDE.md rule 6). A zero density would otherwise yield an infinite
 * diffusivity, which the solver carries into the temperature field as `NaN`
 * rather than failing — a silently wrong result instead of a reported error.
 */
export function thermalDiffusivityM2PerS(
  thermalConductivityWPerMK: number,
  densityKgPerM3: number,
  specificHeatJPerKgK: number,
): number {
  return safeDivide(
    thermalConductivityWPerMK,
    densityKgPerM3 * specificHeatJPerKgK,
    'runExecution.thermalDiffusivity',
    { requirePositive: true, code: 'INVALID_FLUID_PROPERTIES' },
  );
}

/** Elapsed seconds between two `now()` readings, floored at zero. */
function elapsedSecondsSince(startMs: number, now: () => number): number {
  return Math.max(0, (now() - startMs) / 1000);
}

function toResidualSnapshot(
  iteration: number,
  metrics: {
    continuityResidual: number;
    momentumResidual: number;
    energyResidual: number;
    turbulenceResidual: number;
  },
): ResidualSnapshot {
  return {
    iteration,
    continuity: metrics.continuityResidual,
    momentumX: metrics.momentumResidual,
    momentumY: metrics.momentumResidual,
    momentumZ: metrics.momentumResidual,
    energy: metrics.energyResidual,
    k: metrics.turbulenceResidual,
    epsilon: metrics.turbulenceResidual,
  };
}

/**
 * Record a failed run.
 *
 * Both executors funnel their catch through this so the two paths cannot drift
 * on what a failure looks like to a polling client.
 */
async function recordFailure(
  deps: RunExecutionDeps,
  projectId: string,
  caseId: string,
  jobId: string,
  startMs: number,
  error: unknown,
  fallbackMessage: string,
): Promise<void> {
  await deps.updateRunJobStatus(projectId, caseId, jobId, 'failed', {
    elapsedSeconds: elapsedSecondsSince(startMs, deps.now),
    errorMessage: error instanceof Error ? error.message : fallbackMessage,
    completedAt: new Date(deps.now()).toISOString(),
  });
  await deps.updateCaseStatus(projectId, caseId, 'failed');
}

// ─── Room-scope run ──────────────────────────────────────────────

/**
 * Execute a single-room CFD run synchronously.
 *
 * The mesh is required by the type rather than asserted inside. The route
 * previously used `simCase.mesh!` here, which turned a missing mesh into a
 * `TypeError` recorded as a solver failure; the orchestrator now rejects that
 * case at the boundary instead.
 */
export async function executeInternalRun(
  deps: RunExecutionDeps,
  projectId: string,
  caseId: string,
  jobId: string,
  simCase: MeshedCase,
): Promise<void> {
  const startMs = deps.now();

  try {
    await deps.updateRunJobStatus(projectId, caseId, jobId, 'running', {
      startedAt: new Date(startMs).toISOString(),
    });
    await deps.updateCaseStatus(projectId, caseId, 'running');

    const { mesh, physics, solver, geometry } = simCase;

    const input: SimulationInput = {
      projectId,
      floorId: geometry.roomId,
      config: {
        mode: 'engineering',
        gridResolution: mesh.cellSizeM,
        gridSizeX: mesh.nx,
        gridSizeY: mesh.ny,
        gridSizeZ: mesh.nz,
        iterations: solver.maxIterations,
        convergence: solver.convergenceTarget,
        timeStep: solver.timeStepS || 0.1,
        ambientTempC: physics.referenceTemperatureC,
        ambientHumidityRatio: AMBIENT_HUMIDITY_RATIO,
        airDensity: physics.fluid.density,
        airViscosity: physics.fluid.viscosity,
        thermalDiffusivity: thermalDiffusivityM2PerS(
          physics.fluid.thermalConductivity,
          physics.fluid.density,
          physics.fluid.specificHeat,
        ),
        specificHeat: physics.fluid.specificHeat,
      },
      racks: geometry.racks,
      hvacUnits: geometry.hvacUnits,
      tiles: geometry.tiles,
      raisedFloorHeight: geometry.raisedFloorHeightM,
    };

    const result = runCFDSimulation(input);
    const elapsed = elapsedSecondsSince(startMs, deps.now);

    await deps.appendResiduals(
      projectId,
      caseId,
      jobId,
      toResidualSnapshot(result.iteration, result.metrics),
      result.iteration,
      elapsed,
    );

    const cellCount = mesh.nx * mesh.ny * mesh.nz;
    const scalarBytes = Math.ceil(cellCount * BYTES_PER_SCALAR_SAMPLE * FIELD_COMPRESSION_RATIO);
    const vectorBytes = Math.ceil(cellCount * BYTES_PER_VECTOR_SAMPLE * FIELD_COMPRESSION_RATIO);
    const dimensions = { nx: mesh.nx, ny: mesh.ny, nz: mesh.nz };

    const fields: FieldDescriptor[] = [
      {
        name: 'temperature',
        dimensions,
        dataType: 'scalar',
        range: { min: result.metrics.minTemperature, max: result.metrics.maxTemperature },
        compressedSizeBytes: scalarBytes,
      },
      {
        name: 'velocity',
        dimensions,
        dataType: 'vector3',
        range: { min: 0, max: result.metrics.maxVelocity },
        compressedSizeBytes: vectorBytes,
      },
      {
        name: 'pressure',
        dimensions,
        dataType: 'scalar',
        range: { min: 0, max: 500 },
        compressedSizeBytes: scalarBytes,
      },
      {
        name: 'humidity',
        dimensions,
        dataType: 'scalar',
        range: { min: result.metrics.minHumidityRatio, max: result.metrics.maxHumidityRatio },
        compressedSizeBytes: scalarBytes,
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
      totalSizeBytes: fields.reduce((sum, field) => sum + field.compressedSizeBytes, 0),
      createdAt: new Date(deps.now()).toISOString(),
    };

    await deps.saveArtifactManifest(projectId, caseId, manifest);

    // Best-effort. The snapshot is a viewer convenience derived entirely from
    // `result`, which is already persisted in the manifest, so failing to store
    // it must not fail a run that otherwise completed. Logged rather than
    // swallowed, so the failure stays visible.
    try {
      const snapshot = buildRunFieldSnapshotFromResult({
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
      completedAt: new Date(deps.now()).toISOString(),
    });

    await deps.updateSimulationCase(projectId, caseId, {
      status: 'completed',
      resultId: jobId,
    });
  } catch (error) {
    await recordFailure(deps, projectId, caseId, jobId, startMs, error, 'Unknown solver error');
  }
}

// ─── Building-scope run ──────────────────────────────────────────

/** Cap on samples returned per room, to bound the visualization payload. */
const MAX_ROOM_SAMPLES = 420;

function toRoomVisualizationSamples(
  room: BuildingRoom,
  grid: Array<Array<{ u: number; v: number; temp: number }>>,
): BuildingVisualizationPayload['rooms'][number]['samples'] {
  const nx = grid.length;
  const ny = grid[0]?.length ?? 0;
  if (!nx || !ny) return [];

  // Stride is derived from the cell count so a large grid is downsampled to
  // roughly MAX_ROOM_SAMPLES rather than truncated, which would return only
  // one corner of the room.
  const stride = Math.max(1, Math.floor(Math.sqrt((nx * ny) / MAX_ROOM_SAMPLES)));
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
        velocity: { u: cell.u, v: cell.v },
        velocityMagnitude: Math.hypot(cell.u, cell.v),
      });
    }
  }

  return samples;
}

function roomCenter(room: BuildingRoom) {
  return {
    x: room.origin.x + room.dimensions.width / 2,
    y: room.origin.y + room.dimensions.height / 2,
    z: room.origin.z + room.dimensions.length / 2,
  };
}

/**
 * The point on `fromRoom`'s boundary facing `toRoom`.
 *
 * Picks the dominant axis of separation and offsets by half that dimension, so
 * a connection is drawn from a wall rather than from the room centre.
 */
function connectionEndpoint(fromRoom: BuildingRoom, toRoom: BuildingRoom) {
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

/**
 * Execute a building-scope run through the lightweight network solver.
 *
 * Building geometry is required by the type; the orchestrator establishes it.
 */
export async function executeInternalBuildingRun(
  deps: RunExecutionDeps,
  projectId: string,
  caseId: string,
  jobId: string,
  simCase: BuildingCase,
): Promise<void> {
  const startMs = deps.now();

  try {
    await deps.updateRunJobStatus(projectId, caseId, jobId, 'running', {
      startedAt: new Date(startMs).toISOString(),
    });
    await deps.updateCaseStatus(projectId, caseId, 'running');

    const { buildingGeometry, mesh, physics, solver } = simCase;
    const rooms = buildingGeometry.rooms ?? [];
    const timeStepS = solver.timeStepS || 0.1;
    const progressResiduals: ResidualSnapshot[] = [];

    const buildingResult = runBuildingCFDSimulation(
      {
        projectId,
        building: buildingGeometry,
        config: {
          mode: 'engineering',
          gridResolution: Math.max(0.25, mesh?.cellSizeM ?? 0.5),
          gridSizeX: mesh?.nx ?? 20,
          gridSizeY: mesh?.ny ?? 20,
          gridSizeZ: Math.max(6, mesh?.nz ?? 8),
          iterations: solver.maxIterations,
          convergence: solver.convergenceTarget,
          timeStep: timeStepS,
          ambientTempC: physics.referenceTemperatureC,
          ambientHumidityRatio: AMBIENT_HUMIDITY_RATIO,
          airDensity: physics.fluid.density,
          airViscosity: physics.fluid.viscosity,
          thermalDiffusivity: thermalDiffusivityM2PerS(
            physics.fluid.thermalConductivity,
            physics.fluid.density,
            physics.fluid.specificHeat,
          ),
          specificHeat: physics.fluid.specificHeat,
          progressEmitInterval: Math.max(5, Math.floor(solver.maxIterations / 20)),
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
        await deps.appendResiduals(
          projectId,
          caseId,
          jobId,
          residual,
          residual.iteration,
          Math.max(0.001, residual.iteration * timeStepS),
        );
      }
    } else {
      // The solver converged before the first progress emit. Record the final
      // state so a completed run is never left with an empty residual history.
      await deps.appendResiduals(
        projectId,
        caseId,
        jobId,
        toResidualSnapshot(buildingResult.iteration, buildingResult.metrics),
        buildingResult.iteration,
        Math.max(0.001, buildingResult.iteration * timeStepS),
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
        .filter((room): room is BuildingVisualizationPayload['rooms'][number] => room !== null),
      connections: buildingResult.connectionFlows.map((connection, index) => {
        const fromRoom = roomById.get(connection.fromRoom);
        const toRoom = roomById.get(connection.toRoom);
        const origin = { x: 0, y: 0, z: 0 };

        return {
          id: connection.id ?? `connection-${index + 1}`,
          flowRateM3s: connection.flowRateM3s ?? 0,
          fromPoint: fromRoom && toRoom ? connectionEndpoint(fromRoom, toRoom) : origin,
          toPoint: fromRoom && toRoom ? connectionEndpoint(toRoom, fromRoom) : origin,
        };
      }),
      temperatureRange: {
        min: buildingResult.metrics.minTemperature,
        max: buildingResult.metrics.maxTemperature,
      },
      velocityRange: { min: 0, max: buildingResult.metrics.maxVelocity },
    };

    await deps.updateRunJobStatus(projectId, caseId, jobId, 'completed', {
      currentIteration: buildingResult.iteration,
      elapsedSeconds: elapsedSecondsSince(startMs, deps.now),
      completedAt: new Date(deps.now()).toISOString(),
      buildingVisualization,
      metricsSnapshot: buildingResult.metrics,
    });

    await deps.updateSimulationCase(projectId, caseId, {
      status: 'completed',
      resultId: jobId,
    });
  } catch (error) {
    await recordFailure(
      deps, projectId, caseId, jobId, startMs, error, 'Unknown building solver error',
    );
  }
}
