/**
 * CFD Airflow Simulation Engine
 * 
 * Simplified Navier-Stokes solver on a 3D voxel grid.
 * Models airflow distribution, heat transfer, and temperature fields
 * for data center and HVAC environments.
 */

import type {
  CFDGrid,
  CFDCell,
  Vec3,
  SimulationConfig,
  SimulationInput,
  SimulationMetrics,
  SimulationResult,
  HotspotInfo,
  ServerRack,
  HVACUnit,
  PerforatedTile,
} from '@/types/simulation';

// ─── Default Physics Constants ──────────────────────────────────────

const DEFAULT_CONFIG: SimulationConfig = {
  gridResolution: 0.5,
  gridSizeX: 20,
  gridSizeY: 20,
  gridSizeZ: 6,
  iterations: 100,
  convergence: 0.001,
  timeStep: 0.1,
  ambientTempC: 24,
  airDensity: 1.2,        // kg/m³
  airViscosity: 1.8e-5,   // Pa·s
  thermalDiffusivity: 2.2e-5, // m²/s
  specificHeat: 1005,      // J/(kg·K)
};

// ASHRAE thermal guideline thresholds
const TEMP_WARNING = 27;   // °C
const TEMP_CRITICAL = 35;  // °C
const TEMP_EMERGENCY = 40; // °C

// ─── Grid Initialization ────────────────────────────────────────────

function createGrid(config: SimulationConfig): CFDGrid {
  const { gridSizeX, gridSizeY, gridSizeZ, gridResolution, ambientTempC } = config;
  const cells: CFDCell[][][] = [];

  for (let x = 0; x < gridSizeX; x++) {
    cells[x] = [];
    for (let y = 0; y < gridSizeY; y++) {
      cells[x][y] = [];
      for (let z = 0; z < gridSizeZ; z++) {
        cells[x][y][z] = {
          x, y, z,
          temperature: ambientTempC,
          velocity: { x: 0, y: 0, z: 0 },
          pressure: 101325,
          heatSource: 0,
          isObstacle: false,
          tileType: 'open',
        };
      }
    }
  }

  return { sizeX: gridSizeX, sizeY: gridSizeY, sizeZ: gridSizeZ, resolution: gridResolution, cells };
}

// ─── Equipment Placement ────────────────────────────────────────────

function posToGrid(pos: number, resolution: number): number {
  return Math.floor(pos / resolution);
}

function placeRacks(grid: CFDGrid, racks: ServerRack[], config: SimulationConfig): void {
  for (const rack of racks) {
    const gx = posToGrid(rack.position.x, config.gridResolution);
    const gy = posToGrid(rack.position.y, config.gridResolution);
    const rackWidthCells = Math.ceil(rack.width / config.gridResolution);
    const rackDepthCells = Math.ceil(rack.depth / config.gridResolution);
    const rackHeightCells = Math.ceil(rack.height / config.gridResolution);
    const totalHeatW = rack.powerKW * 1000;
    const heatPerCell = totalHeatW / Math.max(1, rackWidthCells * rackDepthCells * rackHeightCells);

    for (let dx = 0; dx < rackWidthCells; dx++) {
      for (let dy = 0; dy < rackDepthCells; dy++) {
        for (let dz = 0; dz < rackHeightCells; dz++) {
          const cx = gx + dx;
          const cy = gy + dy;
          const cz = dz + 1; // racks sit on raised floor (z=0 is plenum)
          if (cx >= 0 && cx < grid.sizeX && cy >= 0 && cy < grid.sizeY && cz >= 0 && cz < grid.sizeZ) {
            grid.cells[cx][cy][cz].isObstacle = true;
            grid.cells[cx][cy][cz].heatSource = heatPerCell;
          }
        }
      }
    }
  }
}

function placeHVACUnits(grid: CFDGrid, units: HVACUnit[], config: SimulationConfig): void {
  for (const unit of units) {
    if (unit.status === 'failed') continue;

    const gx = posToGrid(unit.position.x, config.gridResolution);
    const gy = posToGrid(unit.position.y, config.gridResolution);
    const unitWidthCells = Math.ceil(unit.width / config.gridResolution);
    const unitDepthCells = Math.ceil(unit.depth / config.gridResolution);

    // HVAC unit acts as a cold air source at its outlet
    const cfmToMps = 0.000472; // CFM to m³/s conversion
    const volumeFlowRate = unit.airflowCFM * cfmToMps;
    const outletArea = unit.width * unit.height;
    const outletVelocity = outletArea > 0 ? volumeFlowRate / outletArea : 0;

    for (let dx = 0; dx < unitWidthCells; dx++) {
      for (let dy = 0; dy < unitDepthCells; dy++) {
        const cx = gx + dx;
        const cy = gy + dy;
        if (cx >= 0 && cx < grid.sizeX && cy >= 0 && cy < grid.sizeY) {
          // Supply air enters at lower cells
          for (let z = 0; z < Math.min(3, grid.sizeZ); z++) {
            const cell = grid.cells[cx][cy][z];
            cell.tileType = 'inlet';
            cell.temperature = unit.supplyTempC;
            cell.velocity = { x: 0, y: outletVelocity * 0.3, z: outletVelocity * 0.7 };
            cell.heatSource = -(unit.capacityKW * 1000) / (unitWidthCells * unitDepthCells * 3);
          }
        }
      }
    }
  }
}

function placePerforatedTiles(grid: CFDGrid, tiles: PerforatedTile[], config: SimulationConfig, raisedFloorHeight: number): void {
  for (const tile of tiles) {
    const cx = tile.x;
    const cy = tile.y;
    if (cx >= 0 && cx < grid.sizeX && cy >= 0 && cy < grid.sizeY) {
      const cell = grid.cells[cx][cy][0]; // plenum level
      cell.tileType = 'perforated';

      // Tile airflow: V = sqrt(2 * ΔP / ρ) with correction factor C ≈ 1.6
      const deltaP = 10; // Pa (typical raised floor static pressure)
      const baseVelocity = Math.sqrt((2 * deltaP) / config.airDensity);
      const correctionFactor = 1.6;
      const tileVelocity = correctionFactor * baseVelocity * tile.openArea;

      cell.velocity = { x: 0, y: 0, z: tileVelocity };
      cell.temperature = config.ambientTempC - 5; // Cold air from plenum
    }
  }
}

// ─── Physics Solver ─────────────────────────────────────────────────

/**
 * Step-wise CFD simulation: runs a single iteration and returns updated grid
 */
export function stepCFDSimulation(grid: CFDGrid, config: SimulationConfig): void {
  updateVelocity(grid, config);
  updatePressure(grid, config);
  updateTemperature(grid, config);
  applyBoundaryConditions(grid, config);
}

function clampIndex(val: number, max: number): number {
  return Math.max(0, Math.min(val, max - 1));
}

function getCell(grid: CFDGrid, x: number, y: number, z: number): CFDCell {
  return grid.cells[clampIndex(x, grid.sizeX)][clampIndex(y, grid.sizeY)][clampIndex(z, grid.sizeZ)];
}

/**
 * Update velocity field using simplified momentum equation:
 * ρ(du/dt) = -∇P + μ∇²u + F
 */
function updateVelocity(grid: CFDGrid, config: SimulationConfig): void {
  const { gridResolution: dx, timeStep: dt, airDensity: rho, airViscosity: mu } = config;
  const dx2 = dx * dx;

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle || cell.tileType === 'inlet') continue;

        const left = getCell(grid, x - 1, y, z);
        const right = getCell(grid, x + 1, y, z);
        const front = getCell(grid, x, y - 1, z);
        const back = getCell(grid, x, y + 1, z);
        const below = getCell(grid, x, y, z - 1);
        const above = getCell(grid, x, y, z + 1);

        // Pressure gradient
        const dpdx = (right.pressure - left.pressure) / (2 * dx);
        const dpdy = (back.pressure - front.pressure) / (2 * dx);
        const dpdz = (above.pressure - below.pressure) / (2 * dx);

        // Viscous diffusion (Laplacian of velocity)
        const lapUx = (left.velocity.x + right.velocity.x - 2 * cell.velocity.x) / dx2;
        const lapUy = (front.velocity.y + back.velocity.y - 2 * cell.velocity.y) / dx2;
        const lapUz = (below.velocity.z + above.velocity.z - 2 * cell.velocity.z) / dx2;

        // Buoyancy force (thermal plume): F = ρgβ(T - T_ref)
        const g = 9.81;
        const beta = 1 / (273.15 + config.ambientTempC); // thermal expansion coefficient
        const buoyancy = rho * g * beta * (cell.temperature - config.ambientTempC);

        // Update velocity components
        cell.velocity.x += dt * (-dpdx / rho + (mu / rho) * lapUx);
        cell.velocity.y += dt * (-dpdy / rho + (mu / rho) * lapUy);
        cell.velocity.z += dt * (-dpdz / rho + (mu / rho) * lapUz + buoyancy / rho);

        // Damping to prevent divergence
        const dampFactor = 0.98;
        cell.velocity.x *= dampFactor;
        cell.velocity.y *= dampFactor;
        cell.velocity.z *= dampFactor;
      }
    }
  }
}

/**
 * Update pressure field using simplified continuity equation
 */
function updatePressure(grid: CFDGrid, config: SimulationConfig): void {
  const { gridResolution: dx } = config;
  const relaxation = 0.3; // SOR relaxation factor

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle) continue;

        const left = getCell(grid, x - 1, y, z);
        const right = getCell(grid, x + 1, y, z);
        const front = getCell(grid, x, y - 1, z);
        const back = getCell(grid, x, y + 1, z);
        const below = getCell(grid, x, y, z - 1);
        const above = getCell(grid, x, y, z + 1);

        // Divergence of velocity
        const divU = (right.velocity.x - left.velocity.x + back.velocity.y - front.velocity.y + above.velocity.z - below.velocity.z) / (2 * dx);

        // Pressure Poisson correction
        const pAvg = (left.pressure + right.pressure + front.pressure + back.pressure + below.pressure + above.pressure) / 6;
        const pCorrection = pAvg - (config.airDensity * dx * dx * divU) / 6;

        cell.pressure = cell.pressure * (1 - relaxation) + pCorrection * relaxation;
      }
    }
  }
}

/**
 * Update temperature field:
 * dT/dt = α∇²T - (V·∇T) + Q/(ρ·Cp)
 */
function updateTemperature(grid: CFDGrid, config: SimulationConfig): void {
  const { gridResolution: dx, timeStep: dt, thermalDiffusivity: alpha, airDensity: rho, specificHeat: cp } = config;
  const dx2 = dx * dx;
  const cellVolume = dx * dx * dx;

  // Store old temperatures for advection
  const oldTemps: number[][][] = [];
  for (let x = 0; x < grid.sizeX; x++) {
    oldTemps[x] = [];
    for (let y = 0; y < grid.sizeY; y++) {
      oldTemps[x][y] = [];
      for (let z = 0; z < grid.sizeZ; z++) {
        oldTemps[x][y][z] = grid.cells[x][y][z].temperature;
      }
    }
  }

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.tileType === 'inlet') continue; // Inlet temperature is fixed

        // Thermal diffusion (Laplacian)
        const lapT = (
          oldTemps[x - 1][y][z] + oldTemps[x + 1][y][z] +
          oldTemps[x][y - 1][z] + oldTemps[x][y + 1][z] +
          oldTemps[x][y][z - 1] + oldTemps[x][y][z + 1] -
          6 * oldTemps[x][y][z]
        ) / dx2;

        // Advection: -(V·∇T)
        const dTdx = (oldTemps[x + 1][y][z] - oldTemps[x - 1][y][z]) / (2 * dx);
        const dTdy = (oldTemps[x][y + 1][z] - oldTemps[x][y - 1][z]) / (2 * dx);
        const dTdz = (oldTemps[x][y][z + 1] - oldTemps[x][y][z - 1]) / (2 * dx);
        const advection = cell.velocity.x * dTdx + cell.velocity.y * dTdy + cell.velocity.z * dTdz;

        // Heat source contribution
        const heatContrib = cell.heatSource / (rho * cp * cellVolume);

        // Update temperature
        cell.temperature += dt * (alpha * lapT - advection + heatContrib);

        // Clamp to reasonable range
        cell.temperature = Math.max(5, Math.min(60, cell.temperature));
      }
    }
  }
}

/**
 * Apply boundary conditions
 */
function applyBoundaryConditions(grid: CFDGrid, config: SimulationConfig): void {
  // Wall boundaries: no-slip, adiabatic (simplified)
  for (let y = 0; y < grid.sizeY; y++) {
    for (let z = 0; z < grid.sizeZ; z++) {
      // Left wall
      grid.cells[0][y][z].velocity = { x: 0, y: 0, z: 0 };
      // Right wall
      grid.cells[grid.sizeX - 1][y][z].velocity = { x: 0, y: 0, z: 0 };
    }
  }
  for (let x = 0; x < grid.sizeX; x++) {
    for (let z = 0; z < grid.sizeZ; z++) {
      // Front wall
      grid.cells[x][0][z].velocity = { x: 0, y: 0, z: 0 };
      // Back wall
      grid.cells[x][grid.sizeY - 1][z].velocity = { x: 0, y: 0, z: 0 };
    }
  }
  // Floor and ceiling
  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      grid.cells[x][y][grid.sizeZ - 1].velocity = { x: 0, y: 0, z: 0 };
    }
  }
}

// ─── Metrics Computation ────────────────────────────────────────────

function computeMetrics(grid: CFDGrid, racks: ServerRack[], hvacUnits: HVACUnit[], config: SimulationConfig): SimulationMetrics {
  let maxTemp = -Infinity, minTemp = Infinity, sumTemp = 0;
  let maxVel = 0, sumVel = 0, count = 0;
  let totalHeatLoad = 0, totalCoolingCapacity = 0;
  const hotspots: HotspotInfo[] = [];

  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle) continue;

        maxTemp = Math.max(maxTemp, cell.temperature);
        minTemp = Math.min(minTemp, cell.temperature);
        sumTemp += cell.temperature;

        const vel = Math.sqrt(cell.velocity.x ** 2 + cell.velocity.y ** 2 + cell.velocity.z ** 2);
        maxVel = Math.max(maxVel, vel);
        sumVel += vel;
        count++;

        if (cell.heatSource > 0) totalHeatLoad += cell.heatSource;
        if (cell.heatSource < 0) totalCoolingCapacity += Math.abs(cell.heatSource);

        // Detect hotspots
        if (cell.temperature > TEMP_WARNING) {
          const severity = cell.temperature > TEMP_EMERGENCY ? 'emergency'
            : cell.temperature > TEMP_CRITICAL ? 'critical' : 'warning';

          // Find nearest rack
          let nearestRack = '';
          let nearestDist = Infinity;
          for (const rack of racks) {
            const rx = posToGrid(rack.position.x, config.gridResolution);
            const ry = posToGrid(rack.position.y, config.gridResolution);
            const dist = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestRack = rack.id;
            }
          }

          hotspots.push({
            position: { x: x * config.gridResolution, y: y * config.gridResolution, z: z * config.gridResolution },
            temperature: cell.temperature,
            severity,
            nearestRack,
          });
        }
      }
    }
  }

  // Rack inlet temperatures
  const rackInletTemps = racks.map(rack => {
    const gx = posToGrid(rack.position.x, config.gridResolution);
    const gy = posToGrid(rack.position.y, config.gridResolution);
    let temps: number[] = [];
    for (let dz = 1; dz <= Math.ceil(rack.height / config.gridResolution); dz++) {
      const z = Math.min(dz, grid.sizeZ - 1);
      // Front face of rack (inlet)
      const inletY = Math.max(0, gy - 1);
      if (gx >= 0 && gx < grid.sizeX && inletY >= 0 && inletY < grid.sizeY && z < grid.sizeZ) {
        temps.push(grid.cells[gx][inletY][z].temperature);
      }
    }
    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : config.ambientTempC;
    const maxT = temps.length > 0 ? Math.max(...temps) : config.ambientTempC;
    return { rackId: rack.id, avgTemp, maxTemp: maxT };
  });

  // PUE calculation
  const totalITPower = racks.reduce((sum, r) => sum + r.powerKW, 0);
  const coolingPower = hvacUnits.filter(u => u.status !== 'failed').reduce((sum, u) => sum + u.powerInputKW, 0);
  const totalFacilityPower = totalITPower + coolingPower;
  const pue = totalITPower > 0 ? totalFacilityPower / totalITPower : 1;

  // SHI and RHI
  const avgInletTemp = rackInletTemps.length > 0
    ? rackInletTemps.reduce((s, r) => s + r.avgTemp, 0) / rackInletTemps.length
    : config.ambientTempC;
  const avgSupplyTemp = hvacUnits.reduce((s, u) => s + u.supplyTempC, 0) / Math.max(1, hvacUnits.length);
  const avgReturnTemp = hvacUnits.reduce((s, u) => s + u.returnTempC, 0) / Math.max(1, hvacUnits.length);

  const supplyHeatIndex = (avgReturnTemp - avgSupplyTemp) > 0
    ? (avgInletTemp - avgSupplyTemp) / (avgReturnTemp - avgSupplyTemp)
    : 0;
  const returnHeatIndex = 1 - supplyHeatIndex;

  return {
    maxTemperature: maxTemp === -Infinity ? config.ambientTempC : maxTemp,
    minTemperature: minTemp === Infinity ? config.ambientTempC : minTemp,
    avgTemperature: count > 0 ? sumTemp / count : config.ambientTempC,
    maxVelocity: maxVel,
    avgVelocity: count > 0 ? sumVel / count : 0,
    totalHeatLoad,
    totalCoolingCapacity,
    coolingDeficit: Math.max(0, totalHeatLoad - totalCoolingCapacity),
    hotspots: deduplicateHotspots(hotspots, config.gridResolution),
    pue,
    supplyHeatIndex,
    returnHeatIndex,
    rackInletTemps,
  };
}

/** Merge nearby hotspot detections into clusters */
function deduplicateHotspots(hotspots: HotspotInfo[], resolution: number): HotspotInfo[] {
  const merged: HotspotInfo[] = [];
  const clusterDist = resolution * 3;

  for (const hs of hotspots) {
    const existing = merged.find(m =>
      Math.sqrt((m.position.x - hs.position.x) ** 2 + (m.position.y - hs.position.y) ** 2 + (m.position.z - hs.position.z) ** 2) < clusterDist
    );
    if (existing) {
      if (hs.temperature > existing.temperature) {
        existing.temperature = hs.temperature;
        existing.severity = hs.severity;
        existing.position = hs.position;
      }
    } else {
      merged.push({ ...hs });
    }
  }
  return merged;
}

// ─── Extract Fields ─────────────────────────────────────────────────

function extractTemperatureField(grid: CFDGrid): number[][][] {
  const field: number[][][] = [];
  for (let x = 0; x < grid.sizeX; x++) {
    field[x] = [];
    for (let y = 0; y < grid.sizeY; y++) {
      field[x][y] = [];
      for (let z = 0; z < grid.sizeZ; z++) {
        field[x][y][z] = Math.round(grid.cells[x][y][z].temperature * 100) / 100;
      }
    }
  }
  return field;
}

function extractVelocityField(grid: CFDGrid): Vec3[][][] {
  const field: Vec3[][][] = [];
  for (let x = 0; x < grid.sizeX; x++) {
    field[x] = [];
    for (let y = 0; y < grid.sizeY; y++) {
      field[x][y] = [];
      for (let z = 0; z < grid.sizeZ; z++) {
        const v = grid.cells[x][y][z].velocity;
        field[x][y][z] = {
          x: Math.round(v.x * 1000) / 1000,
          y: Math.round(v.y * 1000) / 1000,
          z: Math.round(v.z * 1000) / 1000,
        };
      }
    }
  }
  return field;
}

function extractPressureField(grid: CFDGrid): number[][][] {
  const field: number[][][] = [];
  for (let x = 0; x < grid.sizeX; x++) {
    field[x] = [];
    for (let y = 0; y < grid.sizeY; y++) {
      field[x][y] = [];
      for (let z = 0; z < grid.sizeZ; z++) {
        field[x][y][z] = Math.round(grid.cells[x][y][z].pressure * 10) / 10;
      }
    }
  }
  return field;
}

// ─── Main Simulation Runner ─────────────────────────────────────────

export function runCFDSimulation(input: SimulationInput): SimulationResult {
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...input.config };
  const grid = createGrid(config);

  // Place equipment on grid
  placeRacks(grid, input.racks, config);
  placeHVACUnits(grid, input.hvacUnits, config);
  placePerforatedTiles(grid, input.tiles, config, input.raisedFloorHeight);

  const convergenceHistory: number[] = [];
  let prevMaxTemp = config.ambientTempC;

  // Iterative solver
  for (let iter = 0; iter < config.iterations; iter++) {
    // Step 1: Apply boundary conditions
    applyBoundaryConditions(grid, config);

    // Step 2: Update velocity field (momentum)
    updateVelocity(grid, config);

    // Step 3: Update pressure field (continuity)
    updatePressure(grid, config);

    // Step 4: Update temperature field (energy)
    updateTemperature(grid, config);

    // Check convergence
    const metrics = computeMetrics(grid, input.racks, input.hvacUnits, config);
    const residual = Math.abs(metrics.maxTemperature - prevMaxTemp);
    convergenceHistory.push(residual);
    prevMaxTemp = metrics.maxTemperature;

    if (residual < config.convergence && iter > 10) {
      break;
    }
  }

  const finalMetrics = computeMetrics(grid, input.racks, input.hvacUnits, config);

  return {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    status: 'completed',
    config,
    metrics: finalMetrics,
    temperatureField: extractTemperatureField(grid),
    velocityField: extractVelocityField(grid),
    pressureField: extractPressureField(grid),
    iteration: convergenceHistory.length,
    convergenceHistory,
    completedAt: new Date().toISOString(),
  };
}

export { DEFAULT_CONFIG, createGrid };
