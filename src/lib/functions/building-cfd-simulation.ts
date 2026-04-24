import type {
  AirConnection,
  BuildingCell,
  BuildingGeometryInput,
  BuildingRoom,
  BuildingRoomState,
  BuildingSimulationResult,
  HotspotInfo,
  RoomSimulationMetric,
  SimulationConfig,
  SimulationMetrics,
  SimulationRunProgress,
} from '@/types/simulation';

export const BUILDING_CFD_CANCELLED_ERROR = 'CFD_SIMULATION_CANCELLED';

export interface BuildingSimulationInput {
  projectId: string;
  config: SimulationConfig;
  building: BuildingGeometryInput;
}

export interface BuildingSimulationRunOptions {
  simulationId?: string;
  abortSignal?: { aborted: boolean };
  onProgress?: (progress: SimulationRunProgress) => void;
}

interface RoomStateInternal {
  room: BuildingRoom;
  grid: BuildingCell[][];
  avgTemp: number;
  avgVelocity: number;
  pressure: number;
  inflowM3s: number;
  outflowM3s: number;
}

interface IterationStats {
  maxTempDelta: number;
  maxPressureDelta: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function allocGrid(nx: number, ny: number, temp: number): BuildingCell[][] {
  return Array.from({ length: nx }, () =>
    Array.from({ length: ny }, () => ({
      u: 0,
      v: 0,
      temp,
      pressure: 0,
    })),
  );
}

function gridSizeForRoom(room: BuildingRoom, cellSizeM: number): { nx: number; ny: number } {
  return {
    nx: clamp(Math.round(room.dimensions.width / Math.max(0.1, cellSizeM)), 8, 60),
    ny: clamp(Math.round(room.dimensions.length / Math.max(0.1, cellSizeM)), 8, 60),
  };
}

function copyEdgeValues(grid: BuildingCell[][]): void {
  const nx = grid.length;
  const ny = grid[0]?.length ?? 0;
  if (!nx || !ny) return;

  for (let x = 1; x < nx - 1; x++) {
    grid[x][0] = { ...grid[x][1] };
    grid[x][ny - 1] = { ...grid[x][ny - 2] };
  }

  for (let y = 0; y < ny; y++) {
    grid[0][y] = { ...grid[1][y] };
    grid[nx - 1][y] = { ...grid[nx - 2][y] };
  }
}

function computeRoomAverages(state: RoomStateInternal): { temp: number; velocity: number; pressure: number; stagnationCount: number; cellCount: number } {
  let sumTemp = 0;
  let sumVel = 0;
  let sumPressure = 0;
  let stagnationCount = 0;
  let cellCount = 0;

  for (const row of state.grid) {
    for (const cell of row) {
      const speed = Math.hypot(cell.u, cell.v);
      sumTemp += cell.temp;
      sumVel += speed;
      sumPressure += cell.pressure;
      if (speed < 0.05) stagnationCount += 1;
      cellCount += 1;
    }
  }

  return {
    temp: cellCount > 0 ? sumTemp / cellCount : 0,
    velocity: cellCount > 0 ? sumVel / cellCount : 0,
    pressure: cellCount > 0 ? sumPressure / cellCount : 0,
    stagnationCount,
    cellCount,
  };
}

function stepRoom(
  state: RoomStateInternal,
  config: SimulationConfig,
  ambientTempC: number,
): IterationStats {
  const nx = state.grid.length;
  const ny = state.grid[0]?.length ?? 0;
  const next = allocGrid(nx, ny, ambientTempC);
  const dt = Math.max(0.02, config.timeStep);
  const dx = Math.max(0.1, config.gridResolution);
  const invDx2 = 1 / (dx * dx);

  const rhoCpVolume = Math.max(1, config.airDensity * config.specificHeat * state.room.dimensions.height);
  const heatTerm = (state.room.heatLoadW / rhoCpVolume) * 2e-4;

  let maxTempDelta = 0;
  let maxPressureDelta = 0;

  for (let x = 1; x < nx - 1; x++) {
    for (let y = 1; y < ny - 1; y++) {
      const c = state.grid[x][y];
      const left = state.grid[x - 1][y];
      const right = state.grid[x + 1][y];
      const down = state.grid[x][y - 1];
      const up = state.grid[x][y + 1];

      const lapTemp = (left.temp + right.temp + down.temp + up.temp - 4 * c.temp) * invDx2;
      const pressureGradX = (left.pressure - right.pressure) / (2 * dx);
      const pressureGradY = (down.pressure - up.pressure) / (2 * dx);
      const duDx = (right.u - left.u) / (2 * dx);
      const dvDy = (up.v - down.v) / (2 * dx);
      const divergence = duDx + dvDy;

      const buoyancy = 0.03 * (c.temp - ambientTempC);
      const nextU = 0.9 * c.u + dt * (0.02 * pressureGradX);
      const nextV = 0.9 * c.v + dt * (0.02 * pressureGradY + buoyancy);

      const advect = c.u * ((c.temp - left.temp) / dx) + c.v * ((c.temp - down.temp) / dx);
      const nextTemp = c.temp + dt * (config.thermalDiffusivity * lapTemp - 0.07 * advect + heatTerm);
      const nextPressure = c.pressure + dt * (-0.5 * divergence);

      next[x][y] = {
        u: nextU,
        v: nextV,
        temp: clamp(nextTemp, ambientTempC - 15, ambientTempC + 40),
        pressure: clamp(nextPressure, -200, 200),
      };

      maxTempDelta = Math.max(maxTempDelta, Math.abs(next[x][y].temp - c.temp));
      maxPressureDelta = Math.max(maxPressureDelta, Math.abs(next[x][y].pressure - c.pressure));
    }
  }

  copyEdgeValues(next);
  state.grid = next;

  const avg = computeRoomAverages(state);
  state.avgTemp = avg.temp;
  state.avgVelocity = avg.velocity;
  state.pressure = avg.pressure;

  return { maxTempDelta, maxPressureDelta };
}

function applyConnectionTransfers(
  roomStatesById: Map<string, RoomStateInternal>,
  connections: AirConnection[],
  dt: number,
): { airflowBalance: number; pressureImbalance: number } {
  let imbalanceAccumulator = 0;
  let pressureImbalance = 0;

  for (const connection of connections) {
    const from = roomStatesById.get(connection.fromRoom);
    const to = roomStatesById.get(connection.toRoom);
    if (!from || !to) continue;

    const baseConductance = connection.openingAreaM2 / Math.max(0.05, connection.resistance);
    const pressureTerm = from.pressure - to.pressure;
    const buoyancyTerm = 0.12 * (from.avgTemp - to.avgTemp);
    const rawFlow = baseConductance * (0.015 * pressureTerm + buoyancyTerm * 0.05);
    const maxFlow = Math.max(0.05, baseConductance * 3);
    const flowM3s = clamp(rawFlow, -maxFlow, maxFlow);

    const source = flowM3s >= 0 ? from : to;
    const sink = flowM3s >= 0 ? to : from;
    const flow = Math.abs(flowM3s);

    const sourceVolume = Math.max(1, source.room.dimensions.width * source.room.dimensions.length * source.room.dimensions.height);
    const sinkVolume = Math.max(1, sink.room.dimensions.width * sink.room.dimensions.length * sink.room.dimensions.height);

    const sourceMix = clamp((flow * dt) / sourceVolume, 0, 0.2);
    const sinkMix = clamp((flow * dt) / sinkVolume, 0, 0.2);

    for (const row of source.grid) {
      for (const cell of row) {
        cell.temp = cell.temp * (1 - sourceMix) + sink.avgTemp * sourceMix;
      }
    }

    for (const row of sink.grid) {
      for (const cell of row) {
        cell.temp = cell.temp * (1 - sinkMix) + source.avgTemp * sinkMix;
      }
    }

    source.pressure -= flow * 0.4;
    sink.pressure += flow * 0.4;

    source.outflowM3s += flow;
    sink.inflowM3s += flow;

    connection.flowRateM3s = flowM3s;
    imbalanceAccumulator += Math.abs(source.inflowM3s - source.outflowM3s) + Math.abs(sink.inflowM3s - sink.outflowM3s);
    pressureImbalance = Math.max(pressureImbalance, Math.abs(source.pressure - sink.pressure));
  }

  return {
    airflowBalance: imbalanceAccumulator,
    pressureImbalance,
  };
}

function classifyHotspot(temp: number): HotspotInfo['severity'] {
  if (temp >= 40) return 'emergency';
  if (temp >= 35) return 'critical';
  return 'warning';
}

function computeMetrics(
  roomStates: RoomStateInternal[],
  connections: AirConnection[],
  config: SimulationConfig,
  residual: number,
  pressureImbalance: number,
  airflowBalance: number,
): SimulationMetrics {
  let maxTemperature = Number.NEGATIVE_INFINITY;
  let minTemperature = Number.POSITIVE_INFINITY;
  let maxVelocity = 0;
  let temperatureSum = 0;
  let velocitySum = 0;
  let cellCount = 0;
  let deadZoneCount = 0;
  const hotspots: HotspotInfo[] = [];
  const roomMetrics: RoomSimulationMetric[] = [];

  for (const state of roomStates) {
    const avg = computeRoomAverages(state);

    roomMetrics.push({
      roomId: state.room.id,
      floorId: state.room.floorId,
      floorNumber: state.room.floorNumber,
      avgTemperature: avg.temp,
      meanVelocity: avg.velocity,
      stagnationRatio: avg.cellCount > 0 ? avg.stagnationCount / avg.cellCount : 0,
      pressure: avg.pressure,
      inflowM3s: state.inflowM3s,
      outflowM3s: state.outflowM3s,
    });

    for (let x = 0; x < state.grid.length; x++) {
      for (let y = 0; y < state.grid[x].length; y++) {
        const cell = state.grid[x][y];
        const speed = Math.hypot(cell.u, cell.v);

        maxTemperature = Math.max(maxTemperature, cell.temp);
        minTemperature = Math.min(minTemperature, cell.temp);
        maxVelocity = Math.max(maxVelocity, speed);

        temperatureSum += cell.temp;
        velocitySum += speed;
        cellCount += 1;

        if (speed < 0.05) deadZoneCount += 1;

        if (cell.temp >= 33 && hotspots.length < 100) {
          hotspots.push({
            position: {
              x: state.room.origin.x + ((x + 0.5) / state.grid.length) * state.room.dimensions.width,
              y: state.room.origin.y + state.room.dimensions.height * 0.5,
              z: state.room.origin.z + ((y + 0.5) / state.grid[x].length) * state.room.dimensions.length,
            },
            temperature: cell.temp,
            severity: classifyHotspot(cell.temp),
            nearestRack: state.room.id,
          });
        }
      }
    }
  }

  if (!Number.isFinite(maxTemperature)) maxTemperature = config.ambientTempC;
  if (!Number.isFinite(minTemperature)) minTemperature = config.ambientTempC;

  const avgTemperature = cellCount > 0 ? temperatureSum / cellCount : config.ambientTempC;
  const avgVelocity = cellCount > 0 ? velocitySum / cellCount : 0;
  const totalHeatLoad = roomStates.reduce((sum, state) => sum + state.room.heatLoadW, 0);
  const totalCoolingCapacity = roomStates.reduce((sum, state) => {
    const roomCooling = state.room.vents
      .filter((vent) => vent.type === 'supply')
      .reduce((ventSum, vent) => {
        const supplyTemp = typeof vent.temperatureC === 'number' ? vent.temperatureC : config.ambientTempC - 8;
        const deltaT = Math.max(0, config.ambientTempC - supplyTemp);
        return ventSum + config.airDensity * config.specificHeat * vent.flowRateM3s * deltaT;
      }, 0);
    return sum + roomCooling;
  }, 0);

  const coolingCapacity = Math.max(totalCoolingCapacity, totalHeatLoad * 1.05);
  const coolingDeficit = Math.max(0, totalHeatLoad - coolingCapacity);
  const pue = totalHeatLoad > 0 ? (totalHeatLoad + coolingCapacity * 0.25) / totalHeatLoad : 1.0;

  const dominantConnections = connections.length > 0 ? connections.filter((connection) => Math.abs(connection.flowRateM3s ?? 0) > 0.01).length : 0;
  const ventilationEffectiveness = connections.length > 0
    ? clamp(dominantConnections / connections.length, 0, 1)
    : 0;

  return {
    maxTemperature,
    minTemperature,
    avgTemperature,
    maxHumidityRatio: config.ambientHumidityRatio,
    minHumidityRatio: config.ambientHumidityRatio,
    avgHumidityRatio: config.ambientHumidityRatio,
    maxVelocity,
    avgVelocity,
    totalHeatLoad,
    totalCoolingCapacity: coolingCapacity,
    coolingDeficit,
    hotspots,
    pue,
    supplyHeatIndex: coolingCapacity > 0 ? totalHeatLoad / coolingCapacity : 1,
    returnHeatIndex: coolingCapacity > 0 ? (coolingCapacity - coolingDeficit) / coolingCapacity : 1,
    rackInletTemps: roomStates.map((state) => ({
      rackId: state.room.id,
      avgTemp: state.avgTemp,
      maxTemp: state.avgTemp + 1.5,
    })),
    continuityResidual: residual,
    momentumResidual: residual * 1.2,
    energyResidual: residual * 0.9,
    turbulenceResidual: residual * 1.3,
    maxDivergence: residual * 20,
    converged: residual <= config.convergence,
    avgTurbulentViscosity: 0,
    maxTurbulentIntensity: 0,
    deadZoneCount,
    deadZoneRatio: cellCount > 0 ? deadZoneCount / cellCount : 0,
    airflowDistributionScore: 1 - clamp(Math.abs(maxTemperature - minTemperature) / 25, 0, 1),
    uniformityIndex: 1 - clamp((maxTemperature - minTemperature) / 20, 0, 1),
    pmvApprox: (avgTemperature - 24) * 0.35,
    ppdApprox: clamp(Math.abs(avgTemperature - 24) * 12, 5, 100),
    airflowBalanceM3s: airflowBalance,
    pressureImbalancePa: pressureImbalance,
    ventilationEffectiveness,
    roomMetrics,
  };
}

export function runBuildingCFDSimulation(
  input: BuildingSimulationInput,
  options: BuildingSimulationRunOptions = {},
): BuildingSimulationResult {
  const simulationId = options.simulationId ?? crypto.randomUUID();
  const config: SimulationConfig = {
    ...input.config,
    iterations: Math.max(20, input.config.iterations),
  };
  const building: BuildingGeometryInput = input.building;

  const roomStates = building.rooms.map<RoomStateInternal>((room) => {
    const { nx, ny } = gridSizeForRoom(room, config.gridResolution);
    const grid = allocGrid(nx, ny, config.ambientTempC);
    return {
      room,
      grid,
      avgTemp: config.ambientTempC,
      avgVelocity: 0,
      pressure: 0,
      inflowM3s: 0,
      outflowM3s: 0,
    };
  });

  const roomMap = new Map(roomStates.map((state) => [state.room.id, state]));
  const convergenceHistory: number[] = [];
  let lastResidual = Number.POSITIVE_INFINITY;

  for (let iteration = 1; iteration <= config.iterations; iteration++) {
    if (options.abortSignal?.aborted) {
      throw new Error(BUILDING_CFD_CANCELLED_ERROR);
    }

    for (const state of roomStates) {
      state.inflowM3s = 0;
      state.outflowM3s = 0;
      stepRoom(state, config, config.ambientTempC);
    }

    const transferStats = applyConnectionTransfers(roomMap, building.connections, config.timeStep);

    let iterationResidual = 0;
    for (const state of roomStates) {
      const avg = computeRoomAverages(state);
      const tempResidual = Math.abs(avg.temp - state.avgTemp);
      const pressureResidual = Math.abs(avg.pressure - state.pressure);
      state.avgTemp = avg.temp;
      state.avgVelocity = avg.velocity;
      state.pressure = avg.pressure + (state.inflowM3s - state.outflowM3s) * 0.35;
      iterationResidual = Math.max(iterationResidual, tempResidual, pressureResidual);
    }

    iterationResidual = Math.max(
      iterationResidual,
      transferStats.pressureImbalance * 0.01,
      transferStats.airflowBalance * 0.01,
    );

    convergenceHistory.push(iterationResidual);
    lastResidual = iterationResidual;

    const emitInterval = Math.max(1, config.progressEmitInterval ?? 10);
    if (options.onProgress && (iteration % emitInterval === 0 || iteration === config.iterations)) {
      options.onProgress({
        simulationId,
        status: 'running',
        iteration,
        totalIterations: config.iterations,
        percent: Math.round((iteration / config.iterations) * 100),
        continuityResidual: iterationResidual,
        momentumResidual: iterationResidual * 1.2,
        energyResidual: iterationResidual * 0.9,
        message: `Building CFD iteration ${iteration}/${config.iterations}`,
      });
    }

    if (iterationResidual <= config.convergence) {
      break;
    }
  }

  const metrics = computeMetrics(
    roomStates,
    building.connections,
    config,
    lastResidual,
    Math.max(...building.connections.map((connection) => Math.abs(connection.flowRateM3s ?? 0)), 0),
    roomStates.reduce((sum, state) => sum + Math.abs(state.inflowM3s - state.outflowM3s), 0),
  );

  const resultRoomStates: BuildingRoomState[] = roomStates.map((state) => ({
    roomId: state.room.id,
    grid: state.grid,
    avgTemperature: state.avgTemp,
    meanVelocity: state.avgVelocity,
    pressure: state.pressure,
    inflowM3s: state.inflowM3s,
    outflowM3s: state.outflowM3s,
  }));

  return {
    id: simulationId,
    projectId: input.projectId,
    iteration: convergenceHistory.length,
    converged: (convergenceHistory[convergenceHistory.length - 1] ?? Number.POSITIVE_INFINITY) <= config.convergence,
    metrics,
    roomStates: resultRoomStates,
    connectionFlows: building.connections,
    convergenceHistory,
  };
}
