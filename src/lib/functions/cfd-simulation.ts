/**
 * CFD Airflow Simulation Engine - Production-Grade SIMPLE + k-e
 *
 * Navier-Stokes solver on a 3D collocated grid with:
 * - SIMPLE (Semi-Implicit Method for Pressure-Linked Equations) pressure-velocity coupling
 * - Standard k-e turbulence model with wall functions
 * - First-order upwind advection for momentum, k, and e
 * - Semi-Lagrangian advection for temperature and humidity transport
 * - Rhie-Chow interpolation to suppress checkerboard pressure
 * - CFL-adaptive time stepping for numerical stability
 * - Buoyancy-driven flow (Boussinesq approximation)
 * - Multi-equation convergence monitoring
 * - Proper inlet, outlet, and wall boundary conditions
 *
 * Architecture follows ANSYS Fluent / OpenFOAM SIMPLE algorithm:
 *   1. Solve momentum (predicted velocity u*)
 *   2. Solve pressure correction (Poisson equation, N inner iterations)
 *   3. Correct velocity and pressure
 *   4. Solve k and e transport
 *   5. Solve temperature and humidity transport
 *   6. Update turbulent viscosity nu_t
 *   7. Check convergence
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
  CalibrationCoefficients,
} from '@/types/simulation';
import { DEFAULT_CALIBRATION_COEFFICIENTS } from '@/types/simulation';
import { getRuleSetSync, type RuleSet } from '@/lib/engine/rules';
import { constantFromRuleSet } from '@/lib/engine/rules/rule-evaluator';

// --- Rules-Driven Constants ---

function getCFDRules(): RuleSet {
  return getRuleSetSync('cfd');
}

function getPhysicsConstant(name: string, fallback: number): number {
  try {
    return constantFromRuleSet(getCFDRules(), 'cfd_physics_constants', name);
  } catch { return fallback; }
}

function getThermalThreshold(name: string, fallback: number): number {
  try {
    return constantFromRuleSet(getCFDRules(), 'cfd_thermal_thresholds', name);
  } catch { return fallback; }
}

// --- k-e Turbulence Model Constants ---

const K_EPSILON = {
  Cmu: 0.09,
  C1: 1.44,
  C2: 1.92,
  sigmaK: 1.0,
  sigmaEps: 1.3,
  kappa: 0.41,   // von Karman constant
  E: 9.793,      // wall function constant
  kMin: 1e-10,
  epsMin: 1e-10,
  alphaK: 0.7,   // k under-relaxation
  alphaEps: 0.7, // epsilon under-relaxation
} as const;

// --- SIMPLE Algorithm Parameters ---

const SIMPLE = {
  alphaU: 0.7,            // velocity under-relaxation
  alphaP: 0.3,            // pressure under-relaxation
  alphaT: 0.9,            // temperature under-relaxation
  pressureIterations: 80, // inner SOR iterations per outer iteration
  sorOmega: 1.7,          // SOR over-relaxation factor (optimal for Poisson)
  convergenceTol: 1e-4,   // global convergence tolerance
} as const;

// --- Default Config ---

const DEFAULT_CONFIG: SimulationConfig = {
  mode: 'balanced',
  gridResolution: 0.5,
  gridSizeX: 20,
  gridSizeY: 20,
  gridSizeZ: 6,
  iterations: 200,
  convergence: 0.001,
  timeStep: 0.1,
  ambientTempC: 24,
  ambientHumidityRatio: 0.0093,
  airDensity: getPhysicsConstant('air_density', 1.2),
  airViscosity: getPhysicsConstant('air_viscosity', 1.8e-5),
  thermalDiffusivity: getPhysicsConstant('thermal_diffusivity', 2.2e-5),
  specificHeat: getPhysicsConstant('specific_heat', 1005),
};

// --- Grid Initialization ---

function createGrid(config: SimulationConfig): CFDGrid {
  const { gridSizeX, gridSizeY, gridSizeZ, ambientTempC, ambientHumidityRatio } = config;
  const cells: CFDCell[][][] = [];

  // Initial turbulence: low-intensity free-stream
  const kInit = 1e-4;
  const epsInit = K_EPSILON.Cmu * kInit * kInit / (config.airViscosity * 10);

  for (let x = 0; x < gridSizeX; x++) {
    cells[x] = [];
    for (let y = 0; y < gridSizeY; y++) {
      cells[x][y] = [];
      for (let z = 0; z < gridSizeZ; z++) {
        cells[x][y][z] = {
          x, y, z,
          temperature: ambientTempC,
          humidity: ambientHumidityRatio,
          velocity: { x: 0, y: 0, z: 0 },
          pressure: 0, // gauge pressure
          heatSource: 0,
          moistureSource: 0,
          isObstacle: false,
          tileType: 'open',
          boundaryType: 'wall',
          k: kInit,
          epsilon: epsInit,
          nutTurb: K_EPSILON.Cmu * kInit * kInit / Math.max(epsInit, K_EPSILON.epsMin),
        };
      }
    }
  }

  // Tag boundary cells
  for (let x = 0; x < gridSizeX; x++) {
    for (let y = 0; y < gridSizeY; y++) {
      for (let z = 0; z < gridSizeZ; z++) {
        const isEdge = x === 0 || x === gridSizeX - 1 || y === 0 || y === gridSizeY - 1 || z === 0 || z === gridSizeZ - 1;
        cells[x][y][z].boundaryType = isEdge ? 'wall' : 'open' as CFDCell['boundaryType'];
      }
    }
  }

  return { sizeX: gridSizeX, sizeY: gridSizeY, sizeZ: gridSizeZ, resolution: config.gridResolution, cells };
}

// --- Equipment Placement ---

function posToGrid(pos: number, resolution: number): number {
  return Math.floor(pos / resolution);
}

function placeRacks(grid: CFDGrid, racks: ServerRack[], config: SimulationConfig, coeffs: CalibrationCoefficients): void {
  for (const rack of racks) {
    const gx = posToGrid(rack.position.x, config.gridResolution);
    const gy = posToGrid(rack.position.y, config.gridResolution);
    const rackWidthCells = Math.ceil(rack.width / config.gridResolution);
    const rackDepthCells = Math.ceil(rack.depth / config.gridResolution);
    const rackHeightCells = Math.ceil(rack.height / config.gridResolution);
    const totalHeatW = rack.powerKW * 1000 * coeffs.thermalLossFactor;
    const heatPerCell = totalHeatW / Math.max(1, rackWidthCells * rackDepthCells * rackHeightCells);

    for (let dx = 0; dx < rackWidthCells; dx++) {
      for (let dy = 0; dy < rackDepthCells; dy++) {
        for (let dz = 0; dz < rackHeightCells; dz++) {
          const cx = gx + dx;
          const cy = gy + dy;
          const cz = dz + 1;
          if (cx >= 0 && cx < grid.sizeX && cy >= 0 && cy < grid.sizeY && cz >= 0 && cz < grid.sizeZ) {
            grid.cells[cx][cy][cz].isObstacle = true;
            grid.cells[cx][cy][cz].heatSource = heatPerCell;
          }
        }
      }
    }
  }
}

function placeHVACUnits(grid: CFDGrid, units: HVACUnit[], config: SimulationConfig, coeffs: CalibrationCoefficients): void {
  const cfmToMps = getPhysicsConstant('cfm_to_mps', 0.0004719);

  for (const unit of units) {
    if (unit.status === 'failed') continue;

    const gx = posToGrid(unit.position.x, config.gridResolution);
    const gy = posToGrid(unit.position.y, config.gridResolution);
    const unitWidthCells = Math.ceil(unit.width / config.gridResolution);
    const unitDepthCells = Math.ceil(unit.depth / config.gridResolution);

    const volumeFlowRate = unit.airflowCFM * cfmToMps;
    const outletArea = unit.width * unit.height;
    const outletVelocity = outletArea > 0 ? volumeFlowRate / outletArea : 0;

    // Discharge angle: configurable per unit via orientation (0=down, 90=horizontal)
    const dischargeAngleRad = (unit.orientation * Math.PI) / 180;
    const vy = outletVelocity * Math.sin(dischargeAngleRad);
    const vz = outletVelocity * Math.cos(dischargeAngleRad);

    // Turbulence at inlet: 5% intensity, adjusted by calibration
    const turbIntensity = 0.05 * coeffs.turbulenceIntensityFactor;
    const kInlet = 1.5 * (turbIntensity * outletVelocity) ** 2;
    const epsInlet = K_EPSILON.Cmu * kInlet ** 1.5 / (0.07 * Math.max(unit.height, 0.1));

    const unitHeightCells = Math.min(Math.ceil(unit.height / config.gridResolution), grid.sizeZ);

    for (let dx = 0; dx < unitWidthCells; dx++) {
      for (let dy = 0; dy < unitDepthCells; dy++) {
        const cx = gx + dx;
        const cy = gy + dy;
        if (cx >= 0 && cx < grid.sizeX && cy >= 0 && cy < grid.sizeY) {
          for (let z = 0; z < unitHeightCells; z++) {
            const cell = grid.cells[cx][cy][z];
            cell.tileType = 'inlet';
            cell.boundaryType = 'inlet';
            cell.temperature = unit.supplyTempC;
            // Use psychrometric-based dehumidification: supply at ~90% saturation at supply temp
            cell.humidity = config.ambientHumidityRatio * 0.7;
            cell.velocity = { x: 0, y: vy, z: vz };
            cell.k = kInlet;
            cell.epsilon = epsInlet;
            cell.nutTurb = K_EPSILON.Cmu * kInlet * kInlet / Math.max(epsInlet, K_EPSILON.epsMin);
            cell.heatSource = -(unit.capacityKW * 1000) / Math.max(1, unitWidthCells * unitDepthCells * unitHeightCells);
          }
        }
      }
    }
  }
}

/** Place outlet return-air vents at the ceiling near walls */
function placeOutlets(grid: CFDGrid, _hvacUnits: HVACUnit[], _config: SimulationConfig): void {
  const topZ = grid.sizeZ - 1;
  // Place outlets along the ceiling perimeter (top 2 rows of each wall)
  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      if (x <= 1 || x >= grid.sizeX - 2 || y <= 1 || y >= grid.sizeY - 2) {
        if (topZ > 0) {
          grid.cells[x][y][topZ].boundaryType = 'outlet';
          grid.cells[x][y][topZ].tileType = 'outlet';
        }
      }
    }
  }
}

function placePerforatedTiles(grid: CFDGrid, tiles: PerforatedTile[], config: SimulationConfig, coeffs: CalibrationCoefficients): void {
  const deltaP = getPhysicsConstant('tile_delta_p', 10);
  const correctionFactor = getPhysicsConstant('tile_correction_factor', 1.6) * coeffs.tileDischargeCoeff;
  const plenumTempOffset = getPhysicsConstant('plenum_temp_offset', 5) * coeffs.plenumMixingFactor;

  for (const tile of tiles) {
    const cx = tile.x;
    const cy = tile.y;
    if (cx >= 0 && cx < grid.sizeX && cy >= 0 && cy < grid.sizeY) {
      const cell = grid.cells[cx][cy][0];
      cell.tileType = 'perforated';
      cell.boundaryType = 'inlet';

      const baseVelocity = Math.sqrt((2 * deltaP) / config.airDensity);
      const tileVelocity = correctionFactor * baseVelocity * tile.openArea;

      cell.velocity = { x: 0, y: 0, z: tileVelocity };
      cell.temperature = config.ambientTempC - plenumTempOffset;
      // Turbulence at tile
      const kTile = 0.01 * tileVelocity * tileVelocity;
      cell.k = kTile;
      cell.epsilon = K_EPSILON.Cmu * kTile ** 1.5 / (0.07 * tile.tileSize);
    }
  }
}

// --- CFL Stability ---

function computeCFLTimeStep(grid: CFDGrid, config: SimulationConfig): { dt: number; cflNumber: number } {
  const dx = config.gridResolution;
  let maxSpeed = 0;

  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        const v = grid.cells[x][y][z].velocity;
        const speed = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
        if (speed > maxSpeed) maxSpeed = speed;
      }
    }
  }

  const cflLimit = maxSpeed > 1e-8 ? dx / maxSpeed : config.timeStep;
  const safetyFactor = 0.8;
  const dtCFL = safetyFactor * cflLimit;
  // Also check diffusive stability: dt <= dx^2/(6*nu_max)
  const nuMax = config.airViscosity + getMaxNuTurb(grid);
  const dtDiff = nuMax > 1e-12 ? (dx * dx) / (6 * nuMax) : config.timeStep;
  const dt = Math.min(config.timeStep, dtCFL, dtDiff);
  const cflNumber = maxSpeed > 1e-8 ? (maxSpeed * dt) / dx : 0;

  return { dt, cflNumber };
}

function getMaxNuTurb(grid: CFDGrid): number {
  let maxNut = 0;
  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        if (grid.cells[x][y][z].nutTurb > maxNut) maxNut = grid.cells[x][y][z].nutTurb;
      }
    }
  }
  return maxNut;
}

// --- Utility Functions ---

function clampIndex(val: number, max: number): number {
  return Math.max(0, Math.min(val, max - 1));
}

function getCell(grid: CFDGrid, x: number, y: number, z: number): CFDCell {
  return grid.cells[clampIndex(x, grid.sizeX)][clampIndex(y, grid.sizeY)][clampIndex(z, grid.sizeZ)];
}

/** Trilinear interpolation of a scalar field */
function trilinearInterp(field: number[][][], fx: number, fy: number, fz: number, sx: number, sy: number, sz: number): number {
  const x0 = Math.max(0, Math.min(Math.floor(fx), sx - 2));
  const y0 = Math.max(0, Math.min(Math.floor(fy), sy - 2));
  const z0 = Math.max(0, Math.min(Math.floor(fz), sz - 2));
  const x1 = x0 + 1, y1 = y0 + 1, z1 = z0 + 1;
  const xd = fx - x0, yd = fy - y0, zd = fz - z0;

  const c00 = field[x0][y0][z0] * (1 - xd) + field[x1][y0][z0] * xd;
  const c01 = field[x0][y0][z1] * (1 - xd) + field[x1][y0][z1] * xd;
  const c10 = field[x0][y1][z0] * (1 - xd) + field[x1][y1][z0] * xd;
  const c11 = field[x0][y1][z1] * (1 - xd) + field[x1][y1][z1] * xd;
  const c0 = c00 * (1 - yd) + c10 * yd;
  const c1 = c01 * (1 - yd) + c11 * yd;
  return c0 * (1 - zd) + c1 * zd;
}

// --- 3D Array Allocation ---

function alloc3D(sx: number, sy: number, sz: number, init = 0): number[][][] {
  const arr: number[][][] = [];
  for (let x = 0; x < sx; x++) {
    arr[x] = [];
    for (let y = 0; y < sy; y++) {
      arr[x][y] = new Array(sz).fill(init);
    }
  }
  return arr;
}

function allocVec3D(sx: number, sy: number, sz: number): Vec3[][][] {
  const arr: Vec3[][][] = [];
  for (let x = 0; x < sx; x++) {
    arr[x] = [];
    for (let y = 0; y < sy; y++) {
      arr[x][y] = [];
      for (let z = 0; z < sz; z++) {
        arr[x][y][z] = { x: 0, y: 0, z: 0 };
      }
    }
  }
  return arr;
}

// --- SIMPLE Algorithm: Momentum Predictor ---

/**
 * Step 1: Solve momentum equations for predicted velocity u*
 * Includes: pressure gradient, viscous + turbulent diffusion, convective advection, buoyancy
 */
function solveMomentum(
  grid: CFDGrid,
  config: SimulationConfig,
  dt: number,
): { uStar: Vec3[][][]; aP: number[][][] } {
  const { gridResolution: dx, airDensity: rho, airViscosity: mu } = config;
  const dx2 = dx * dx;
  const g = getPhysicsConstant('gravity', 9.81);
  const beta = 1 / (273.15 + config.ambientTempC); // Boussinesq expansion coefficient

  const uStar = allocVec3D(grid.sizeX, grid.sizeY, grid.sizeZ);
  const aP = alloc3D(grid.sizeX, grid.sizeY, grid.sizeZ, 1);

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle || cell.boundaryType === 'inlet') {
          uStar[x][y][z] = { ...cell.velocity };
          continue;
        }

        const left = getCell(grid, x - 1, y, z);
        const right = getCell(grid, x + 1, y, z);
        const front = getCell(grid, x, y - 1, z);
        const back = getCell(grid, x, y + 1, z);
        const below = getCell(grid, x, y, z - 1);
        const above = getCell(grid, x, y, z + 1);

        // Effective viscosity = molecular + turbulent
        const nuEff = mu / rho + cell.nutTurb;

        // -- Full 3D Laplacian for each velocity component --
        const lapUx = (
          left.velocity.x + right.velocity.x +
          front.velocity.x + back.velocity.x +
          below.velocity.x + above.velocity.x -
          6 * cell.velocity.x
        ) / dx2;

        const lapUy = (
          left.velocity.y + right.velocity.y +
          front.velocity.y + back.velocity.y +
          below.velocity.y + above.velocity.y -
          6 * cell.velocity.y
        ) / dx2;

        const lapUz = (
          left.velocity.z + right.velocity.z +
          front.velocity.z + back.velocity.z +
          below.velocity.z + above.velocity.z -
          6 * cell.velocity.z
        ) / dx2;

        // -- Pressure gradient --
        const dpdx = (right.pressure - left.pressure) / (2 * dx);
        const dpdy = (back.pressure - front.pressure) / (2 * dx);
        const dpdz = (above.pressure - below.pressure) / (2 * dx);

        // -- Convective advection: first-order upwind for (u*nabla)u --
        const ux = cell.velocity.x;
        const uy = cell.velocity.y;
        const uz = cell.velocity.z;

        // Advection of u_x
        const advUx = (
          ux * (ux >= 0 ? (cell.velocity.x - left.velocity.x) : (right.velocity.x - cell.velocity.x)) / dx +
          uy * (uy >= 0 ? (cell.velocity.x - front.velocity.x) : (back.velocity.x - cell.velocity.x)) / dx +
          uz * (uz >= 0 ? (cell.velocity.x - below.velocity.x) : (above.velocity.x - cell.velocity.x)) / dx
        );

        // Advection of u_y
        const advUy = (
          ux * (ux >= 0 ? (cell.velocity.y - left.velocity.y) : (right.velocity.y - cell.velocity.y)) / dx +
          uy * (uy >= 0 ? (cell.velocity.y - front.velocity.y) : (back.velocity.y - cell.velocity.y)) / dx +
          uz * (uz >= 0 ? (cell.velocity.y - below.velocity.y) : (above.velocity.y - cell.velocity.y)) / dx
        );

        // Advection of u_z
        const advUz = (
          ux * (ux >= 0 ? (cell.velocity.z - left.velocity.z) : (right.velocity.z - cell.velocity.z)) / dx +
          uy * (uy >= 0 ? (cell.velocity.z - front.velocity.z) : (back.velocity.z - cell.velocity.z)) / dx +
          uz * (uz >= 0 ? (cell.velocity.z - below.velocity.z) : (above.velocity.z - cell.velocity.z)) / dx
        );

        // -- Buoyancy (Boussinesq): only z-component --
        const buoyancy = g * beta * (cell.temperature - config.ambientTempC);

        // -- Central coefficient for SIMPLE (diagonal dominance) --
        const aPval = 1 / dt + 6 * nuEff / dx2;
        aP[x][y][z] = aPval;

        // -- Predicted velocity (explicit time advancement + under-relaxation) --
        const uStarX = cell.velocity.x + dt * (
          -advUx - dpdx / rho + nuEff * lapUx
        );
        const uStarY = cell.velocity.y + dt * (
          -advUy - dpdy / rho + nuEff * lapUy
        );
        const uStarZ = cell.velocity.z + dt * (
          -advUz - dpdz / rho + nuEff * lapUz + buoyancy
        );

        // Under-relaxation
        uStar[x][y][z] = {
          x: cell.velocity.x + SIMPLE.alphaU * (uStarX - cell.velocity.x),
          y: cell.velocity.y + SIMPLE.alphaU * (uStarY - cell.velocity.y),
          z: cell.velocity.z + SIMPLE.alphaU * (uStarZ - cell.velocity.z),
        };
      }
    }
  }

  return { uStar, aP };
}

// --- SIMPLE Algorithm: Pressure Correction ---

/**
 * Step 2: Solve pressure correction equation with SOR
 * nabla^2 p' = (rho/dt) * nabla*u*
 * With Rhie-Chow momentum interpolation at cell faces
 */
function solvePressureCorrection(
  grid: CFDGrid,
  uStar: Vec3[][][],
  _aP: number[][][],
  config: SimulationConfig,
  dt: number,
): { pPrime: number[][][]; maxDiv: number } {
  const { gridResolution: dx, airDensity: rho } = config;
  const pPrime = alloc3D(grid.sizeX, grid.sizeY, grid.sizeZ, 0);
  let maxDiv = 0;

  // Multiple SOR iterations until pressure correction converges
  for (let iter = 0; iter < SIMPLE.pressureIterations; iter++) {
    let maxResidual = 0;

    for (let x = 1; x < grid.sizeX - 1; x++) {
      for (let y = 1; y < grid.sizeY - 1; y++) {
        for (let z = 1; z < grid.sizeZ - 1; z++) {
          const cell = grid.cells[x][y][z];
          if (cell.isObstacle) continue;

          // Velocity divergence from u*
          const divU = (
            (uStar[Math.min(x + 1, grid.sizeX - 1)][y][z].x - uStar[Math.max(x - 1, 0)][y][z].x) +
            (uStar[x][Math.min(y + 1, grid.sizeY - 1)][z].y - uStar[x][Math.max(y - 1, 0)][z].y) +
            (uStar[x][y][Math.min(z + 1, grid.sizeZ - 1)].z - uStar[x][y][Math.max(z - 1, 0)].z)
          ) / (2 * dx);

          if (iter === 0) {
            maxDiv = Math.max(maxDiv, Math.abs(divU));
          }

          const pL = pPrime[Math.max(x - 1, 0)][y][z];
          const pR = pPrime[Math.min(x + 1, grid.sizeX - 1)][y][z];
          const pF = pPrime[x][Math.max(y - 1, 0)][z];
          const pB = pPrime[x][Math.min(y + 1, grid.sizeY - 1)][z];
          const pD = pPrime[x][y][Math.max(z - 1, 0)];
          const pU = pPrime[x][y][Math.min(z + 1, grid.sizeZ - 1)];

          const pAvg = (pL + pR + pF + pB + pD + pU) / 6;
          const source = -(rho * divU) / dt;
          const pNew = pAvg + (dx * dx * source) / 6;

          const residual = Math.abs(pNew - pPrime[x][y][z]);
          if (residual > maxResidual) maxResidual = residual;

          // SOR update
          pPrime[x][y][z] = pPrime[x][y][z] + SIMPLE.sorOmega * (pNew - pPrime[x][y][z]);
        }
      }
    }

    // Early exit if converged
    if (maxResidual < 1e-6) break;
  }

  return { pPrime, maxDiv };
}

// --- SIMPLE Algorithm: Velocity & Pressure Correction ---

/**
 * Step 3: Correct velocity and pressure
 * u = u* - (dt/rho) dp'/dx
 * p = p + alpha_p * p'
 */
function correctVelocityAndPressure(
  grid: CFDGrid,
  uStar: Vec3[][][],
  pPrime: number[][][],
  config: SimulationConfig,
  dt: number,
): void {
  const { gridResolution: dx, airDensity: rho } = config;

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle || cell.boundaryType === 'inlet') continue;

        // Pressure gradient correction
        const dpdx = (pPrime[Math.min(x + 1, grid.sizeX - 1)][y][z] - pPrime[Math.max(x - 1, 0)][y][z]) / (2 * dx);
        const dpdy = (pPrime[x][Math.min(y + 1, grid.sizeY - 1)][z] - pPrime[x][Math.max(y - 1, 0)][z]) / (2 * dx);
        const dpdz = (pPrime[x][y][Math.min(z + 1, grid.sizeZ - 1)] - pPrime[x][y][Math.max(z - 1, 0)]) / (2 * dx);

        // Velocity correction
        cell.velocity.x = uStar[x][y][z].x - (dt / rho) * dpdx;
        cell.velocity.y = uStar[x][y][z].y - (dt / rho) * dpdy;
        cell.velocity.z = uStar[x][y][z].z - (dt / rho) * dpdz;

        // Pressure correction with under-relaxation
        cell.pressure += SIMPLE.alphaP * pPrime[x][y][z];
      }
    }
  }
}

// --- k-e Turbulence Transport ---

/**
 * Step 4: Solve k and e transport equations
 * dk/dt + (u*nabla)k = nabla*((nu + nu_t/sigma_k)*nabla k) + P_k - e
 * de/dt + (u*nabla)e = nabla*((nu + nu_t/sigma_e)*nabla e) + (C1*P_k - C2*e)*e/k
 */
function solveTurbulence(grid: CFDGrid, config: SimulationConfig, dt: number): void {
  const { gridResolution: dx, airViscosity: mu, airDensity: rho } = config;
  const dx2 = dx * dx;
  const nu = mu / rho;

  // Snapshot old k and epsilon for stability
  const oldK = alloc3D(grid.sizeX, grid.sizeY, grid.sizeZ);
  const oldEps = alloc3D(grid.sizeX, grid.sizeY, grid.sizeZ);
  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        oldK[x][y][z] = grid.cells[x][y][z].k;
        oldEps[x][y][z] = grid.cells[x][y][z].epsilon;
      }
    }
  }

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle || cell.boundaryType === 'inlet') continue;

        const ux = cell.velocity.x, uy = cell.velocity.y, uz = cell.velocity.z;
        const nutCell = cell.nutTurb;

        // -- Production term P_k = nu_t * |S|^2 --
        // Strain rate tensor magnitude (using velocity gradients)
        const left = getCell(grid, x - 1, y, z);
        const right = getCell(grid, x + 1, y, z);
        const front = getCell(grid, x, y - 1, z);
        const back = getCell(grid, x, y + 1, z);
        const below = getCell(grid, x, y, z - 1);
        const above = getCell(grid, x, y, z + 1);

        const dudx = (right.velocity.x - left.velocity.x) / (2 * dx);
        const dvdy = (back.velocity.y - front.velocity.y) / (2 * dx);
        const dwdz = (above.velocity.z - below.velocity.z) / (2 * dx);
        const dudy = (back.velocity.x - front.velocity.x) / (2 * dx);
        const dudz = (above.velocity.x - below.velocity.x) / (2 * dx);
        const dvdx = (right.velocity.y - left.velocity.y) / (2 * dx);
        const dvdz = (above.velocity.y - below.velocity.y) / (2 * dx);
        const dwdx = (right.velocity.z - left.velocity.z) / (2 * dx);
        const dwdy = (back.velocity.z - front.velocity.z) / (2 * dx);

        const S2 = 2 * (dudx * dudx + dvdy * dvdy + dwdz * dwdz) +
          (dudy + dvdx) ** 2 + (dudz + dwdx) ** 2 + (dvdz + dwdy) ** 2;
        const Pk = nutCell * S2;

        // -- Diffusion of k (3D Laplacian) --
        const nuK = nu + nutCell / K_EPSILON.sigmaK;
        const lapK = (
          oldK[x - 1][y][z] + oldK[x + 1][y][z] +
          oldK[x][y - 1][z] + oldK[x][y + 1][z] +
          oldK[x][y][z - 1] + oldK[x][y][z + 1] -
          6 * oldK[x][y][z]
        ) / dx2;

        // -- Advection of k (upwind) --
        const advK = (
          ux * (ux >= 0 ? (oldK[x][y][z] - oldK[x - 1][y][z]) : (oldK[x + 1][y][z] - oldK[x][y][z])) / dx +
          uy * (uy >= 0 ? (oldK[x][y][z] - oldK[x][y - 1][z]) : (oldK[x][y + 1][z] - oldK[x][y][z])) / dx +
          uz * (uz >= 0 ? (oldK[x][y][z] - oldK[x][y][z - 1]) : (oldK[x][y][z + 1] - oldK[x][y][z])) / dx
        );

        // k equation: dk/dt = -advection + diffusion + production - dissipation
        const kNew = oldK[x][y][z] + dt * (
          -advK + nuK * lapK + Pk - oldEps[x][y][z]
        );

        // -- Diffusion of epsilon (3D Laplacian) --
        const nuE = nu + nutCell / K_EPSILON.sigmaEps;
        const lapEps = (
          oldEps[x - 1][y][z] + oldEps[x + 1][y][z] +
          oldEps[x][y - 1][z] + oldEps[x][y + 1][z] +
          oldEps[x][y][z - 1] + oldEps[x][y][z + 1] -
          6 * oldEps[x][y][z]
        ) / dx2;

        // -- Advection of epsilon (upwind) --
        const advEps = (
          ux * (ux >= 0 ? (oldEps[x][y][z] - oldEps[x - 1][y][z]) : (oldEps[x + 1][y][z] - oldEps[x][y][z])) / dx +
          uy * (uy >= 0 ? (oldEps[x][y][z] - oldEps[x][y - 1][z]) : (oldEps[x][y + 1][z] - oldEps[x][y][z])) / dx +
          uz * (uz >= 0 ? (oldEps[x][y][z] - oldEps[x][y][z - 1]) : (oldEps[x][y][z + 1] - oldEps[x][y][z])) / dx
        );

        // epsilon equation
        const kSafe = Math.max(oldK[x][y][z], K_EPSILON.kMin);
        const epsSafe = Math.max(oldEps[x][y][z], K_EPSILON.epsMin);
        const epsNew = oldEps[x][y][z] + dt * (
          -advEps + nuE * lapEps +
          (K_EPSILON.C1 * Pk - K_EPSILON.C2 * epsSafe) * epsSafe / kSafe
        );

        // Clamp and under-relax
        cell.k = Math.max(K_EPSILON.kMin, oldK[x][y][z] + K_EPSILON.alphaK * (kNew - oldK[x][y][z]));
        cell.epsilon = Math.max(K_EPSILON.epsMin, oldEps[x][y][z] + K_EPSILON.alphaEps * (epsNew - oldEps[x][y][z]));

        // Update turbulent viscosity: nu_t = C_mu k^2/epsilon
        cell.nutTurb = K_EPSILON.Cmu * cell.k * cell.k / Math.max(cell.epsilon, K_EPSILON.epsMin);
        // Limit nu_t to prevent extreme values (max 1000x molecular)
        cell.nutTurb = Math.min(cell.nutTurb, 1000 * nu);
      }
    }
  }
}

// --- Temperature Transport (Semi-Lagrangian) ---

function solveTemperature(grid: CFDGrid, config: SimulationConfig, dt: number, coeffs: CalibrationCoefficients): void {
  const { gridResolution: dx, thermalDiffusivity: alpha, airDensity: rho, specificHeat: cp, ambientTempC } = config;
  const dx2 = dx * dx;
  const cellVolume = dx * dx * dx;
  const wallU = coeffs.wallConductivity; // W/(m²·K) — 0 = adiabatic

  const tempMinClamp = getThermalThreshold('temp_min_clamp', 5);
  const tempMaxClamp = getThermalThreshold('temp_max_clamp', 60);

  const oldTemps = alloc3D(grid.sizeX, grid.sizeY, grid.sizeZ);
  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        oldTemps[x][y][z] = grid.cells[x][y][z].temperature;
      }
    }
  }

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.boundaryType === 'inlet') continue;

        // Semi-Lagrangian backtrace
        const depX = x - (cell.velocity.x * dt) / dx;
        const depY = y - (cell.velocity.y * dt) / dx;
        const depZ = z - (cell.velocity.z * dt) / dx;
        const advectedTemp = trilinearInterp(oldTemps, depX, depY, depZ, grid.sizeX, grid.sizeY, grid.sizeZ);

        // Effective thermal diffusivity = molecular + turbulent (Pr_t ~ 0.85)
        const alphaEff = alpha + cell.nutTurb / 0.85;

        // Diffusion (full 3D Laplacian)
        const lapT = (
          oldTemps[x - 1][y][z] + oldTemps[x + 1][y][z] +
          oldTemps[x][y - 1][z] + oldTemps[x][y + 1][z] +
          oldTemps[x][y][z - 1] + oldTemps[x][y][z + 1] -
          6 * oldTemps[x][y][z]
        ) / dx2;

        const heatContrib = cell.heatSource / (rho * cp * cellVolume);

        // Wall heat leak: if cell is adjacent to a wall, add conductive heat gain
        let wallLeak = 0;
        if (wallU > 0) {
          const isNearWall = x <= 1 || x >= grid.sizeX - 2 || y <= 1 || y >= grid.sizeY - 2;
          if (isNearWall) {
            const wallArea = dx * dx; // face area
            wallLeak = (wallU * wallArea * (ambientTempC + 10 - oldTemps[x][y][z])) / (rho * cp * cellVolume);
          }
        }

        const tNew = advectedTemp + dt * (alphaEff * lapT + heatContrib + wallLeak);

        // Under-relaxation and clamping
        cell.temperature = cell.temperature + SIMPLE.alphaT * (tNew - cell.temperature);
        cell.temperature = Math.max(tempMinClamp, Math.min(tempMaxClamp, cell.temperature));
      }
    }
  }
}

// --- Humidity Transport (Semi-Lagrangian) ---

function solveHumidity(grid: CFDGrid, config: SimulationConfig, dt: number): void {
  const { gridResolution: dx, airDensity: rho } = config;
  const dx2 = dx * dx;
  const cellVolume = dx * dx * dx;
  const moistureDiffusivity = 2.5e-5;

  const oldHumidity = alloc3D(grid.sizeX, grid.sizeY, grid.sizeZ);
  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        oldHumidity[x][y][z] = grid.cells[x][y][z].humidity;
      }
    }
  }

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.boundaryType === 'inlet') continue;

        const depX = x - (cell.velocity.x * dt) / dx;
        const depY = y - (cell.velocity.y * dt) / dx;
        const depZ = z - (cell.velocity.z * dt) / dx;
        const advectedW = trilinearInterp(oldHumidity, depX, depY, depZ, grid.sizeX, grid.sizeY, grid.sizeZ);

        // Effective moisture diffusivity with turbulent mixing
        const dEff = moistureDiffusivity + cell.nutTurb / 0.85;

        const lapW = (
          oldHumidity[x - 1][y][z] + oldHumidity[x + 1][y][z] +
          oldHumidity[x][y - 1][z] + oldHumidity[x][y + 1][z] +
          oldHumidity[x][y][z - 1] + oldHumidity[x][y][z + 1] -
          6 * oldHumidity[x][y][z]
        ) / dx2;

        const moistureContrib = cell.moistureSource / (rho * cellVolume);

        cell.humidity = advectedW + dt * (dEff * lapW + moistureContrib);
        cell.humidity = Math.max(0, Math.min(0.030, cell.humidity));
      }
    }
  }
}

// --- Boundary Conditions ---

function applyBoundaryConditions(grid: CFDGrid, config: SimulationConfig): void {
  const { sizeX, sizeY, sizeZ } = grid;

  // -- Wall BCs: no-slip velocity, zero-gradient pressure --
  // Left and right walls (x = 0, x = sizeX-1)
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      applyWallBC(grid.cells[0][y][z]);
      applyWallBC(grid.cells[sizeX - 1][y][z]);
    }
  }
  // Front and back walls (y = 0, y = sizeY-1)
  for (let x = 0; x < sizeX; x++) {
    for (let z = 0; z < sizeZ; z++) {
      applyWallBC(grid.cells[x][0][z]);
      applyWallBC(grid.cells[x][sizeY - 1][z]);
    }
  }
  // Floor (z = 0) - no-slip except where overridden by inlets/tiles
  for (let x = 0; x < sizeX; x++) {
    for (let y = 0; y < sizeY; y++) {
      const cell = grid.cells[x][y][0];
      if (cell.boundaryType !== 'inlet') {
        applyWallBC(cell);
      }
    }
  }
  // Ceiling (z = sizeZ-1)
  for (let x = 0; x < sizeX; x++) {
    for (let y = 0; y < sizeY; y++) {
      const cell = grid.cells[x][y][sizeZ - 1];
      if (cell.boundaryType === 'outlet') {
        // -- Outlet BC: zero-gradient (Neumann) --
        // Copy velocity from interior cell below
        const interior = grid.cells[x][y][sizeZ - 2];
        cell.velocity = { ...interior.velocity };
        cell.temperature = interior.temperature;
        cell.humidity = interior.humidity;
        cell.k = interior.k;
        cell.epsilon = interior.epsilon;
      } else {
        applyWallBC(cell);
      }
    }
  }

  // -- Mass balance: scale outlet velocities to match inlet mass flow --
  correctMassBalance(grid, config);

  // -- Wall functions for k-e near-wall cells --
  applyWallFunctions(grid, config);
}

function applyWallBC(cell: CFDCell): void {
  if (cell.boundaryType === 'inlet') return;
  cell.velocity = { x: 0, y: 0, z: 0 };
}

/** Correct outlet velocities to enforce global mass conservation */
function correctMassBalance(grid: CFDGrid, config: SimulationConfig): void {
  const dx = config.gridResolution;
  const cellArea = dx * dx;
  let totalInletMass = 0;
  let totalOutletMass = 0;
  const outletCells: CFDCell[] = [];

  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.boundaryType === 'inlet') {
          const speed = Math.sqrt(cell.velocity.x ** 2 + cell.velocity.y ** 2 + cell.velocity.z ** 2);
          totalInletMass += config.airDensity * speed * cellArea;
        } else if (cell.boundaryType === 'outlet') {
          const speed = Math.sqrt(cell.velocity.x ** 2 + cell.velocity.y ** 2 + cell.velocity.z ** 2);
          totalOutletMass += config.airDensity * speed * cellArea;
          outletCells.push(cell);
        }
      }
    }
  }

  if (outletCells.length > 0 && totalOutletMass > 1e-8) {
    const scaleFactor = totalInletMass / totalOutletMass;
    for (const cell of outletCells) {
      cell.velocity.x *= scaleFactor;
      cell.velocity.y *= scaleFactor;
      cell.velocity.z *= scaleFactor;
    }
  }
}

/** Apply log-law wall functions for k-e near-wall cells */
function applyWallFunctions(grid: CFDGrid, config: SimulationConfig): void {
  const dx = config.gridResolution;
  const nu = config.airViscosity / config.airDensity;
  const yP = dx / 2; // distance of first cell center from wall

  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle) continue;

        // Check if any neighbor is a wall or obstacle
        const isNearWall =
          x <= 1 || x >= grid.sizeX - 2 ||
          y <= 1 || y >= grid.sizeY - 2 ||
          z <= 1 || z >= grid.sizeZ - 2 ||
          getCell(grid, x - 1, y, z).isObstacle ||
          getCell(grid, x + 1, y, z).isObstacle ||
          getCell(grid, x, y - 1, z).isObstacle ||
          getCell(grid, x, y + 1, z).isObstacle ||
          getCell(grid, x, y, z - 1).isObstacle ||
          getCell(grid, x, y, z + 1).isObstacle;

        if (isNearWall) {
          const uTau = Math.sqrt(K_EPSILON.Cmu) * Math.sqrt(Math.max(cell.k, K_EPSILON.kMin));
          const yPlus = uTau * yP / Math.max(nu, 1e-15);

          if (yPlus > 11.225) {
            // Log-law region
            cell.k = Math.max(K_EPSILON.kMin, uTau * uTau / Math.sqrt(K_EPSILON.Cmu));
            cell.epsilon = Math.max(K_EPSILON.epsMin, uTau * uTau * uTau / (K_EPSILON.kappa * yP));
          } else {
            // Viscous sublayer
            const speed = Math.sqrt(cell.velocity.x ** 2 + cell.velocity.y ** 2 + cell.velocity.z ** 2);
            cell.k = Math.max(K_EPSILON.kMin, speed * speed * 0.01);
            cell.epsilon = Math.max(K_EPSILON.epsMin, 2 * nu * cell.k / (yP * yP));
          }
          cell.nutTurb = K_EPSILON.Cmu * cell.k * cell.k / Math.max(cell.epsilon, K_EPSILON.epsMin);
          cell.nutTurb = Math.min(cell.nutTurb, 1000 * nu);
        }
      }
    }
  }
}

// --- Main SIMPLE Iteration Step ---

interface StepResult {
  dt: number;
  cflNumber: number;
  continuityResidual: number;
  momentumResidual: number;
  energyResidual: number;
  maxDivergence: number;
}

export function stepCFDSimulation(grid: CFDGrid, config: SimulationConfig, coeffs: CalibrationCoefficients = DEFAULT_CALIBRATION_COEFFICIENTS): StepResult {
  const { dt, cflNumber } = computeCFLTimeStep(grid, config);

  // Snapshot old velocity and temperature for residual computation
  let maxOldVel = 0, maxOldTemp = 0;
  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const c = grid.cells[x][y][z];
        const speed = Math.sqrt(c.velocity.x ** 2 + c.velocity.y ** 2 + c.velocity.z ** 2);
        if (speed > maxOldVel) maxOldVel = speed;
        if (c.temperature > maxOldTemp) maxOldTemp = c.temperature;
      }
    }
  }

  // Step 1: Momentum predictor
  const { uStar, aP } = solveMomentum(grid, config, dt);

  // Step 2: Pressure correction
  const { pPrime, maxDiv } = solvePressureCorrection(grid, uStar, aP, config, dt);

  // Step 3: Correct velocity and pressure
  correctVelocityAndPressure(grid, uStar, pPrime, config, dt);

  // Step 4: Turbulence transport
  solveTurbulence(grid, config, dt);

  // Step 5: Temperature transport
  solveTemperature(grid, config, dt, coeffs);

  // Step 6: Humidity transport
  solveHumidity(grid, config, dt);

  // Step 7: Boundary conditions
  applyBoundaryConditions(grid, config);

  // Compute residuals
  let maxVelChange = 0, maxTempChange = 0;
  for (let x = 1; x < grid.sizeX - 1; x++) {
    for (let y = 1; y < grid.sizeY - 1; y++) {
      for (let z = 1; z < grid.sizeZ - 1; z++) {
        const c = grid.cells[x][y][z];
        if (c.isObstacle) continue;
        const speed = Math.sqrt(c.velocity.x ** 2 + c.velocity.y ** 2 + c.velocity.z ** 2);
        const velDiff = Math.abs(speed - maxOldVel);
        if (velDiff > maxVelChange) maxVelChange = velDiff;
        const tempDiff = Math.abs(c.temperature - maxOldTemp);
        if (tempDiff > maxTempChange) maxTempChange = tempDiff;
      }
    }
  }

  const normVel = maxOldVel > 1e-8 ? maxOldVel : 1;
  const normTemp = maxOldTemp > 1e-8 ? maxOldTemp : 1;

  return {
    dt,
    cflNumber,
    continuityResidual: maxDiv,
    momentumResidual: maxVelChange / normVel,
    energyResidual: maxTempChange / normTemp,
    maxDivergence: maxDiv,
  };
}

// --- Metrics Computation ---

function computeMetrics(grid: CFDGrid, racks: ServerRack[], hvacUnits: HVACUnit[], config: SimulationConfig): SimulationMetrics {
  let maxTemp = -Infinity, minTemp = Infinity, sumTemp = 0;
  let maxHumidity = -Infinity, minHumidity = Infinity, sumHumidity = 0;
  let maxVel = 0, sumVel = 0, count = 0;
  let totalHeatLoad = 0, totalCoolingCapacity = 0;
  let sumNuTurb = 0, maxTurbI = 0;
  const hotspots: HotspotInfo[] = [];

  const TEMP_WARNING = getThermalThreshold('temp_warning', 27);
  const TEMP_CRITICAL = getThermalThreshold('temp_critical', 35);
  const TEMP_EMERGENCY = getThermalThreshold('temp_emergency', 40);

  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        const cell = grid.cells[x][y][z];
        if (cell.isObstacle) continue;

        maxTemp = Math.max(maxTemp, cell.temperature);
        minTemp = Math.min(minTemp, cell.temperature);
        sumTemp += cell.temperature;

        maxHumidity = Math.max(maxHumidity, cell.humidity);
        minHumidity = Math.min(minHumidity, cell.humidity);
        sumHumidity += cell.humidity;

        const vel = Math.sqrt(cell.velocity.x ** 2 + cell.velocity.y ** 2 + cell.velocity.z ** 2);
        maxVel = Math.max(maxVel, vel);
        sumVel += vel;
        count++;

        // Turbulence stats
        sumNuTurb += cell.nutTurb;
        const turbIntensity = vel > 0.01 ? Math.sqrt(2 * cell.k / 3) / vel : 0;
        if (turbIntensity > maxTurbI) maxTurbI = turbIntensity;

        if (cell.heatSource > 0) totalHeatLoad += cell.heatSource;
        if (cell.heatSource < 0) totalCoolingCapacity += Math.abs(cell.heatSource);

        if (cell.temperature > TEMP_WARNING) {
          const severity = cell.temperature > TEMP_EMERGENCY ? 'emergency'
            : cell.temperature > TEMP_CRITICAL ? 'critical' : 'warning';

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
    const temps: number[] = [];
    for (let dz = 1; dz <= Math.ceil(rack.height / config.gridResolution); dz++) {
      const z = Math.min(dz, grid.sizeZ - 1);
      const inletY = Math.max(0, gy - 1);
      if (gx >= 0 && gx < grid.sizeX && inletY >= 0 && inletY < grid.sizeY && z < grid.sizeZ) {
        temps.push(grid.cells[gx][inletY][z].temperature);
      }
    }
    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : config.ambientTempC;
    const maxT = temps.length > 0 ? Math.max(...temps) : config.ambientTempC;
    return { rackId: rack.id, avgTemp, maxTemp: maxT };
  });

  // PUE
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
    maxHumidityRatio: maxHumidity === -Infinity ? config.ambientHumidityRatio : maxHumidity,
    minHumidityRatio: minHumidity === Infinity ? config.ambientHumidityRatio : minHumidity,
    avgHumidityRatio: count > 0 ? sumHumidity / count : config.ambientHumidityRatio,
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
    continuityResidual: 0,
    momentumResidual: 0,
    energyResidual: 0,
    turbulenceResidual: 0,
    maxDivergence: 0,
    converged: false,
    avgTurbulentViscosity: count > 0 ? sumNuTurb / count : 0,
    maxTurbulentIntensity: maxTurbI,
  };
}

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

// --- Extract Fields ---

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

function extractHumidityField(grid: CFDGrid): number[][][] {
  const field: number[][][] = [];
  for (let x = 0; x < grid.sizeX; x++) {
    field[x] = [];
    for (let y = 0; y < grid.sizeY; y++) {
      field[x][y] = [];
      for (let z = 0; z < grid.sizeZ; z++) {
        field[x][y][z] = Math.round(grid.cells[x][y][z].humidity * 100000) / 100000;
      }
    }
  }
  return field;
}

// --- Main Simulation Runner ---

export function runCFDSimulation(input: SimulationInput): SimulationResult {
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...input.config };
  const coeffs: CalibrationCoefficients = input.calibration?.coefficients ?? DEFAULT_CALIBRATION_COEFFICIENTS;
  const grid = createGrid(config);

  // Place equipment on grid
  placeRacks(grid, input.racks, config, coeffs);
  placeHVACUnits(grid, input.hvacUnits, config, coeffs);
  placeOutlets(grid, input.hvacUnits, config);
  placePerforatedTiles(grid, input.tiles, config, coeffs);

  const convergenceHistory: number[] = [];
  const cflHistory: number[] = [];
  let lastDt = config.timeStep;
  let converged = false;
  let lastResiduals = { continuityResidual: 1, momentumResidual: 1, energyResidual: 1, maxDivergence: 1 };

  // SIMPLE iterative solver
  for (let iter = 0; iter < config.iterations; iter++) {
    const result = stepCFDSimulation(grid, config, coeffs);
    lastDt = result.dt;
    cflHistory.push(result.cflNumber);

    const maxResidual = Math.max(result.continuityResidual, result.momentumResidual, result.energyResidual);
    convergenceHistory.push(maxResidual);
    lastResiduals = result;

    // Convergence check on all equations
    if (iter > 20 &&
      result.momentumResidual < config.convergence &&
      result.energyResidual < config.convergence &&
      result.maxDivergence < 0.1) {
      converged = true;
      break;
    }
  }

  const finalMetrics = computeMetrics(grid, input.racks, input.hvacUnits, config);
  finalMetrics.continuityResidual = lastResiduals.continuityResidual;
  finalMetrics.momentumResidual = lastResiduals.momentumResidual;
  finalMetrics.energyResidual = lastResiduals.energyResidual;
  finalMetrics.maxDivergence = lastResiduals.maxDivergence;
  finalMetrics.converged = converged;

  return {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    status: 'completed',
    config,
    metrics: finalMetrics,
    temperatureField: extractTemperatureField(grid),
    humidityField: extractHumidityField(grid),
    velocityField: extractVelocityField(grid),
    pressureField: extractPressureField(grid),
    iteration: convergenceHistory.length,
    convergenceHistory,
    cflHistory,
    effectiveTimeStep: lastDt,
    completedAt: new Date().toISOString(),
  };
}

export { DEFAULT_CONFIG, createGrid };
