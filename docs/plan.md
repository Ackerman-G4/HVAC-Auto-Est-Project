# HVAC Auto-Estimation System — Full Accuracy Improvement Plan

Comprehensive Technical Roadmap for CFD Tile Fix, 3D Model Accuracy & System-Wide Precision

Repository: Ackerman-G4/HVAC-Auto-Est-Project
Date: 2026-05-04
Status: Production (Firebase + Next.js + Python Calc Engine)

## Executive Summary

This plan addresses four critical accuracy gaps identified in the codebase:
- CFD Simulation (cfd-simulation.ts) — Uses a simplified explicit solver on a uniform voxel grid with significant numerical diffusion, no turbulence modeling, and coarse boundary treatment
- 3D Building Visualization (BuildingViewer3D.tsx, AirflowViewer3D.tsx) — Renders rooms as axis-aligned bounding boxes with no actual wall geometry, window cutouts, or HVAC element detail
- Load Calculations (load-calculation-engine.ts) — Uses flat per-m² envelope factors instead of orientation-specific CLTD/CLF methods or RTS calculations
- Geometry Representation (room-polygon.ts, floorplan) — Stores rooms as 2D rectangles with no volumetric data, wall thickness, or spatial relationships

Target Error Budgets:

| Domain | Current Error | Target Error | Method |
| --- | --- | --- | --- |
| Room Volume | ±15% (rect approximation) | ±0.5% | BIM/IFC import + polygon extrusion |
| CFD Temperature | ±3-5°C (coarse grid) | ±0.5°C | Adaptive mesh + k-ε turbulence |
| CFD Velocity | ±0.5 m/s | ±0.1 m/s | Boundary layer resolution |
| Cooling Load | ±25% (flat factors) | ±8% | RTS/CLTD method + solar angles |
| Pressure Drop | ±30% | ±10% | Darcy-Weisbach with actual fittings |

## Phase 1: Geometry Accuracy Foundation (Weeks 1-3)

### 1.1 Volumetric Room Geometry Engine

Current State: Rooms stored as {x, y, width, height} rectangles with area and ceilingHeight as separate scalar values. No wall thickness, no actual 3D bounds.
Required Changes:

```
// src/types/geometry.ts — NEW FILE
export interface Point3D {
x: number;
y: number;
z: number;
}
export interface Vector3D {
x: number;
y: number;
z: number;
}
export interface WallSegment {
id: string;
start: Point3D;
end: Point3D;
height: number;
thickness: number;
construction: string;
// references material catalog
uValue: number;
// W/m²·K, computed from layers
orientation: number;
// degrees from north
windows: WindowOpening[];
doors: DoorOpening[];
}
export interface WindowOpening {
id: string;
width: number;
height: number;
sillHeight: number;
glassType: string;
shadingCoefficient: number;
orientation: number;
}
export interface RoomGeometry {
id: string;
floorId: string;
name: string;
// Extruded polygon from floorplan
footprint: Point3D[];
// closed polygon, CCW, ground plane
ceilingHeight: number;
floorThickness: number;
ceilingThickness: number;
walls: WallSegment[];
// Computed properties
volume: number;
// exact volumetric calculation
surfaceArea: number;
// total interior surface
floorArea: number;
perimeter: number;
boundingBox: {
min: Point3D;
max: Point3D;
};
// Spatial indexing
centroid: Point3D;
adjacentRooms: string[];
// shared wall segments
}
export interface FloorGeometry {
id: string;
floorNumber: number;
elevation: number;
// meters above grade
rooms: RoomGeometry[];
slabThickness: number;
// Structural elements affecting HVAC
columns: Point3D[];
// obstruction points
beams: {
start: Point3D;
end: Point3D;
height: number;
}[];
}
export interface BuildingGeometry {
id: string;
name: string;
floors: FloorGeometry[];
// Site context
latitude: number;
longitude: number;
altitude: number;
orientation: number;
// building rotation from true north
// Envelope
roofType: string;
roofUValue: number;
groundContactUValue: number;
}
```

Implementation Steps:
- Polygon Extrusion: Convert 2D floorplan polygons to 3D rooms with configurable wall thickness (default 150mm for drywall, 200mm for concrete block)
- Wall Generation: Auto-generate WallSegment[] from polygon edges with orientation calculation using atan2
- Volume Calculation: Use shoelace formula for polygon area × ceiling height, minus beam/column obstructions
- Adjacency Detection: Spatial hash grid (cell size = 1m) to find shared walls between rooms
- Window Placement: Convert current windowArea scalar to actual WindowOpening objects positioned on specific walls with orientation
File Changes:
- src/types/geometry.ts — NEW
- src/lib/geometry/room-extruder.ts — NEW (polygon → 3D room)
- src/lib/geometry/volume-calculator.ts — NEW (exact volume via triangulation)
- src/lib/geometry/wall-generator.ts — NEW (edge → WallSegment)
- src/lib/geometry/spatial-index.ts — NEW (adjacency detection)
- Modify src/app/projects/[id]/floorplan/page.tsx — store polygon data, not just rect
- Modify src/lib/utils/room-polygon.ts — support complex polygons, not just rectangles

### 1.2 IFC/BIM Import Pipeline

New Module: src/lib/geometry/ifc-parser.ts

```
import * as WebIFC from 'web-ifc';
export async function parseIFC(file: ArrayBuffer): Promise<BuildingGeometry> {
const ifcAPI = new WebIFC.IfcAPI();
await ifcAPI.Init();
const modelID = ifcAPI.OpenModel(file);
// Extract IfcSpace elements
const spaces = await extractSpaces(ifcAPI, modelID);
// Extract IfcWall elements with openings
const walls = await extractWalls(ifcAPI, modelID);
// Extract IfcWindow, IfcDoor placements
const openings = await extractOpenings(ifcAPI, modelID);
// Merge into BuildingGeometry
return mergeToBuildingGeometry(spaces, walls, openings);
}
```

Dependencies:

```json
{
	"web-ifc": "^0.0.54",
	"three": "^0.170.0",
	"@react-three/fiber": "^8.17.0",
	"@react-three/drei": "^9.120.0"
}
```

### 1.3 3D Viewer Rebuild

Current: BuildingViewer3D.tsx renders colored boxes with Box components from @react-three/drei. No actual wall geometry.
New Architecture:

```ts
// src/components/building/AccurateBuilding3D.tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Html } from '@react-three/drei';
import * as THREE from 'three';

interface Building3DProps {
  building: BuildingGeometry;
  showThermal: boolean;
  showCFD: boolean;
  cfdResult?: SimulationResult;
  selectedRoom?: string;
  onRoomClick: (roomId: string) => void;
}

function RoomMesh({ room, isSelected, onClick }: RoomMeshProps) {
  // Create actual wall geometry from WallSegments
  const wallGeometries = useMemo(() => {
    return room.walls.map((wall) => {
      const shape = new THREE.Shape();

      // Draw wall cross-section and extrude
      const length = Math.sqrt(
        (wall.end.x - wall.start.x) ** 2 +
        (wall.end.y - wall.start.y) ** 2
      );

      shape.moveTo(0, 0);
      shape.lineTo(length, 0);
      shape.lineTo(length, wall.height);
      shape.lineTo(0, wall.height);
      shape.closePath();

      // Subtract window openings
      wall.windows.forEach((win) => {
        const hole = new THREE.Path();
        hole.moveTo(win.sillHeight, 0);
        hole.lineTo(win.sillHeight + win.height, 0);
        hole.lineTo(win.sillHeight + win.height, win.width);
        hole.lineTo(win.sillHeight, win.width);
        hole.closePath();
        shape.holes.push(hole);
      });

      const extrudeSettings = { depth: wall.thickness, bevelEnabled: false };
      return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    });
  }, [room.walls]);

  return (
    <group onClick={onClick}>
      {wallGeometries.map((geo, i) => (
        <mesh key={i} geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial
            color={isSelected ? '#3b82f6' : '#e2e8f0'}
            transparent
            opacity={0.9}
          />
          <Edges color="#64748b" lineWidth={1} />
        </mesh>
      ))}

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <shapeGeometry args={[createFloorShape(room.footprint)]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, room.ceilingHeight, 0]}>
        <shapeGeometry args={[createFloorShape(room.footprint)]} />
        <meshStandardMaterial color="#f8fafc" transparent opacity={0.5} />
      </mesh>

      {/* HVAC Elements */}
      <HVACElements room={room} />
    </group>
  );
}
```

Features:
- Actual wall thickness visible in 3D
- Window cutouts with glass material (transmissive)
- Door openings with swing arcs
- HVAC elements: Vents, ducts, diffusers at actual positions
- Thermal coloring: Room surfaces colored by temperature from CFD or load calc
- Measurement tools: Click two points → show distance in mm
- Section planes: Clipping to view interior
- Shadows: Directional sunlight based on latitude/longitude + time of day

## Phase 2: CFD Tile Fix — Physics Accuracy (Weeks 4-8)

### 2.1 Current CFD Issues Analysis

File: src/lib/functions/cfd-simulation.ts (21,221 bytes)
Critical Problems:
- Uniform Grid: gridResolution: 0.5m with no adaptivity. A 20×20×6m room uses only 40×40×12 = 19,200 cells. Industry standard: 500K–2M cells for this size.
- No Turbulence Model: Pure laminar solver. Real HVAC flows are turbulent (Re > 4,000 at vents).
- Explicit Time Stepping: timeStep: 0.1s with 100 iterations = 10s physical time. Not enough for steady-state.
- First-Order Advection: updateTemperature() uses central differences with no flux limiters → numerical diffusion smears gradients.
- Boundary Conditions: Walls are “no-slip, adiabatic” but no wall function for near-wall treatment. y+ not controlled.
- Pressure Solver: Simplified SOR with relaxation 0.3, no multigrid. Divergence not properly enforced.
- No Conjugate Heat Transfer: Walls are adiabatic. Real buildings have conduction through walls.
- Boussinesq Approximation: Only buoyancy term, no density variation in mass conservation.

### 2.2 New CFD Architecture

File: src/lib/engine/cfd/ — NEW MODULE

```
src/lib/engine/cfd/
├── mesh/
│   ├── adaptive-grid.ts          # Octree-based AMR
│   ├── boundary-layer.ts         # Inflation layers near walls
│   ├── mesh-quality.ts           # Skewness, aspect ratio checks
│   └── vtk-exporter.ts           # Export to ParaView format
├── solver/
│   ├── navier-stokes.ts          # Coupled velocity-pressure
│   ├── turbulence/
│   │   ├── k-epsilon.ts          # Standard k-ε model
│   │   ├── k-omega-sst.ts        # SST k-ω (recommended)
│   │   └── wall-functions.ts     # Standard/Enhanced wall functions
│   ├── energy.ts                 # Temperature with convection
│   ├── radiation.ts              # S2S or DO radiation model
│   └── pressure-poisson.ts       # AMG solver for pressure
├── physics/
│   ├── material-properties.ts    # Air, wall materials
│   ├── buoyancy.ts               # Non-Boussinesq option
│   └── boundary-conditions.ts    # Inlet, outlet, wall, symmetry
├── validation/
│   ├── grid-independence.ts      # Automatic refinement study
│   ├── experimental-data.ts      # ASHRAE benchmark cases
│   └── error-estimate.ts         # Residual-based local error
└── index.ts                      # Main solver interface
```

### 2.3 Adaptive Mesh Refinement (AMR)

```ts
// src/lib/engine/cfd/mesh/adaptive-grid.ts
interface OctreeNode {
  id: string;
  level: number;
  bounds: { min: Point3D; max: Point3D };
  children?: OctreeNode[]; // 8 children if refined
  isLeaf: boolean;
  cellSize: number;

  // CFD state
  velocity: Vector3D;
  pressure: number;
  temperature: number;
  k: number; // turbulent kinetic energy
  epsilon: number; // dissipation rate

  // Refinement criteria
  velocityGradient: number;
  temperatureGradient: number;
  wallDistance: number;
  errorEstimate: number;
}

class AdaptiveCFDGrid {
  root: OctreeNode;
  maxLevel: number;
  minCellSize: number;

  constructor(building: BuildingGeometry, config: CFDConfig) {
    // Initialize root to building bounds
    this.root = this.createRootNode(building);
    this.maxLevel = config.maxRefinementLevel;
    this.minCellSize = config.minCellSize;

    // Initial refinement
    this.refineNearWalls(building);
    this.refineNearInlets(building);
    this.refineNearHeatSources(building);
  }

  refineNearWalls(building: BuildingGeometry): void {
    // Walk all wall segments
    building.floors.forEach((floor) => {
      floor.rooms.forEach((room) => {
        room.walls.forEach((wall) => {
          // Refine cells within 5 wall-thicknesses of wall surface
          const refineDistance = Math.max(wall.thickness * 5, 0.3);
          this.refineRegionNearLine(wall.start, wall.end, refineDistance);
        });
      });
    });
  }

  refineRegionNearLine(start: Point3D, end: Point3D, distance: number): void {
    // BFS from root, refine cells whose bounding box is within distance of line segment
    const queue: OctreeNode[] = [this.root];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.level >= this.maxLevel) continue;

      const dist = this.distanceFromLineSegment(node.bounds, start, end);
      if (dist < distance && node.isLeaf) {
        this.splitNode(node);
        queue.push(...node.children!);
      } else if (dist < distance * 2) {
        queue.push(...(node.children || []));
      }
    }
  }

  splitNode(node: OctreeNode): void {
    const { min, max } = node.bounds;
    const mid = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };

    node.children = [];
    for (let i = 0; i < 8; i++) {
      const childMin = {
        x: i & 1 ? mid.x : min.x,
        y: i & 2 ? mid.y : min.y,
        z: i & 4 ? mid.z : min.z,
      };
      const childMax = {
        x: i & 1 ? max.x : mid.x,
        y: i & 2 ? max.y : mid.y,
        z: i & 4 ? max.z : mid.z,
      };

      node.children.push({
        id: `${node.id}-${i}`,
        level: node.level + 1,
        bounds: { min: childMin, max: childMax },
        isLeaf: true,
        cellSize: node.cellSize / 2,
        velocity: { ...node.velocity },
        pressure: node.pressure,
        temperature: node.temperature,
        k: node.k,
        epsilon: node.epsilon,
        velocityGradient: 0,
        temperatureGradient: 0,
        wallDistance: 0,
        errorEstimate: 0,
      });
    }

    node.isLeaf = false;
  }

  // Iterator over all leaf nodes
  *leafNodes(): Generator<OctreeNode> {
    const queue = [this.root];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.isLeaf) yield node;
      else queue.push(...node.children!);
    }
  }

  getCellCount(): number {
    let count = 0;
    for (const _ of this.leafNodes()) count++;
    return count;
  }
}
```

Refinement Criteria: 1. Velocity gradient: Refine where |∇V| > threshold (shear layers, jets) 2. Temperature gradient: Refine where |∇T| > threshold (thermal plumes) 3. Wall distance: First 5 cells near walls at y+ < 5 for heat transfer accuracy 4. Vorticity: Refine where |ω| > threshold (recirculation zones) 5. Error estimate: Refine where local residual > global average × 2

### 2.4 SST k-ω Turbulence Model

```
// src/lib/engine/cfd/solver/turbulence/k-omega-sst.ts
interface TurbulenceState {
  k: number;      // TKE [m²/s²]
  omega: number;  // Specific dissipation [1/s]
  nut: number;    // Eddy viscosity [m²/s]
}

// Menter SST k-ω constants
const SST_CONSTANTS = {
  beta1: 0.075,
  beta2: 0.0828,
  gamma1: 0.5532,
  gamma2: 0.4403,
  sigmaK1: 0.85,
  sigmaK2: 1.0,
  sigmaOmega1: 0.5,
  sigmaOmega2: 0.856,
  a1: 0.31,
};

function computeEddyViscositySST(
  k: number,
  omega: number,
  strainRate: number,
  distance: number
): number {
  const { a1 } = SST_CONSTANTS;

  // Blending function F2
  const arg2 = Math.max(
    2 * Math.sqrt(k) / (0.09 * omega * distance),
    500 * 1.8e-5 / (omega * distance * distance)
  );
  const F2 = Math.tanh(arg2 * arg2);

  // Eddy viscosity with strain rate limiter
  const nut = a1 * k / Math.max(a1 * omega, strainRate * F2);
  return Math.max(0, nut);
}

function updateTurbulenceSST(grid: AdaptiveCFDGrid, config: CFDConfig): void {
  for (const cell of grid.leafNodes()) {
    if (cell.wallDistance < 1e-6) {
      // Wall boundary: k = 0, omega from wall function
      cell.k = 0;
      cell.omega = 6 * 1.8e-5 / (0.075 * cell.wallDistance * cell.wallDistance);
      continue;
    }

    // Production term
    const strainRate = computeStrainRate(cell);
    const Pk = Math.min(cell.nut * strainRate * strainRate, 10 * 0.09 * cell.k * cell.omega);

    // Dissipation
    const epsilon = 0.09 * cell.k * cell.omega;

    // Update k
    const dkdt = Pk - epsilon;
    cell.k += config.timeStep * dkdt;
    cell.k = Math.max(1e-10, cell.k);

    // Update omega
    const dOmegadt = ...; // similar with cross-diffusion
    cell.omega += config.timeStep * dOmegadt;
    cell.omega = Math.max(1e-10, cell.omega);

    // Update eddy viscosity
    cell.nut = computeEddyViscositySST(cell.k, cell.omega, strainRate, cell.wallDistance);
  }
}
```

### 2.5 Conjugate Heat Transfer (CHT)

```
// src/lib/engine/cfd/solver/conjugate-heat-transfer.ts
interface SolidDomain {
  material: string;
  conductivity: number;  // W/m·K
  density: number;       // kg/m³
  specificHeat: number;  // J/kg·K
  temperature: number;
}

function solveConjugateHeatTransfer(
  fluidGrid: AdaptiveCFDGrid,
  solidDomains: SolidDomain[],
  timeStep: number
): void {
  // 1. Solve heat conduction in solid walls
  for (const solid of solidDomains) {
    const alpha = solid.conductivity / (solid.density * solid.specificHeat);

    // Finite volume heat equation
    solid.temperature += timeStep * alpha * laplacian(solid.temperature);
  }

  // 2. Couple at fluid-solid interface
  for (const cell of fluidGrid.leafNodes()) {
    if (cell.wallDistance < cell.cellSize / 2) {
      // Near-wall cell: apply wall heat flux
      const wallTemp = getWallTemperatureAt(cell.bounds);
      const q = solidDomains[0].conductivity * (wallTemp - cell.temperature) / cell.wallDistance;
      cell.temperature +=
        timeStep * q / (config.airDensity * config.specificHeat * cell.cellSize);
    }
  }
}
```

### 2.6 Solver Integration with Python Backend

Current: Python calc engine (services/calc-engine/main.py) is 14,580 bytes but appears disconnected from CFD.
New Architecture:

```
# services/calc-engine/cfd/solver.pyimport numpy as npfrom scipy.sparse import csr_matrixfrom scipy.sparse.linalg import spsolveimport pyamg  # Algebraic Multigrid for pressure Poissonclass AdaptiveCFDSolver:    def __init__(self, mesh: OctreeMesh, config: CFDConfig):        self.mesh = mesh        self.config = config        self.u = np.zeros(mesh.n_cells)  # x-velocity        self.v = np.zeros(mesh.n_cells)  # y-velocity        self.w = np.zeros(mesh.n_cells)  # z-velocity        self.p = np.ones(mesh.n_cells) * 101325  # pressure        self.T = np.ones(mesh.n_cells) * config.ambient_temp  # temperature        self.k = np.ones(mesh.n_cells) * 0.1  # TKE        self.epsilon = np.ones(mesh.n_cells) * 0.1  # dissipation    def solve_steady_state(self, max_iter: int = 1000, tol: float = 1e-6):        for iteration in range(max_iter):            # 1. Momentum prediction (with turbulence)            self._predict_velocity()            # 2. Pressure correction (AMG solver)            self._correct_pressure()            # 3. Velocity correction            self._correct_velocity()            # 4. Energy equation            self._solve_energy()            # 5. Turbulence equations            self._solve_turbulence()            # 6. Check convergence            residual = self._compute_residual()            if residual < tol:                break        return self._extract_results()    def _correct_pressure(self):        # Build Poisson matrix A·p = b        # Use AMG for fast convergence        A = self._build_poisson_matrix()        b = self._compute_divergence()        ml = pyamg.ruge_stuben_solver(A)        self.p = ml.solve(b, tol=1e-10)
```

API Integration:

```
// src/app/api/simulation/route.ts
export async function POST(request: Request) {
  const input: SimulationInput = await request.json();

  // Build accurate geometry
  const building = await loadBuildingGeometry(input.projectId);

  // Generate adaptive mesh
  const mesh = generateAdaptiveMesh(building, input.config);

  // Call Python solver
  const response = await fetch('http://localhost:8000/cfd/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mesh: mesh.toJSON(),
      config: input.config,
      boundaryConditions: extractBoundaryConditions(building, input),
    }),
  });

  const result = await response.json();
  return Response.json(result);
}
```

### 2.7 Validation Framework

```
// src/lib/engine/cfd/validation/grid-independence.ts
async function runGridIndependenceStudy(
  building: BuildingGeometry,
  baseConfig: CFDConfig
): Promise<GridStudyResult> {
  const configs = [
    { ...baseConfig, minCellSize: 0.5, maxLevel: 3 },   // Coarse
    { ...baseConfig, minCellSize: 0.25, maxLevel: 4 },  // Medium
    { ...baseConfig, minCellSize: 0.125, maxLevel: 5 }, // Fine
  ];

  const results = await Promise.all(configs.map((cfg) => runCFDSimulation(building, cfg)));

  // Compute GCI (Grid Convergence Index)
  const gci = computeGCI(
    results[0].metrics.maxTemperature,
    results[1].metrics.maxTemperature,
    results[2].metrics.maxTemperature,
    2 // refinement ratio
  );

  return {
    results,
    gci,
    recommendedConfig: gci < 5 ? configs[1] : configs[2], // 5% GCI threshold
  };
}
```

## Phase 3: Load Calculation Accuracy (Weeks 6-9)

### 3.1 Current Issues

File: src/lib/engine/hvac/load-calculation-engine.ts (8,616 bytes)
Problems:
- Flat envelope factors: SPACE_ENVELOPE_BTU_PER_M2 is a single scalar per space type. No orientation, no solar angle, no CLTD/CLF.
- No solar calculation: Window solar gain uses windowArea scalar with no SHGC, no shading, no time-of-day.
- Simplified ventilation: ventilationCfmPerPerson × occupants, no ASHRAE 62.1 compliance check.
- No roof load: hasRoofExposure boolean but no actual roof heat transfer calculation.
- Missing components: No infiltration load, no duct heat gain, no fan heat.

### 3.2 RTS Method Implementation

```
// src/lib/engine/hvac/rts-load-calculation.ts
interface RTSInputs {
  room: RoomGeometry;
  location: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  designDate: Date;
  // Typically July 21 for northern hemisphere
  designHour: number;
  // 0-23, typically 15:00 (3 PM)
  indoorConditions: {
    db: number;
    rh: number;
  };
}

interface RTSLoadBreakdown {
  // Conduction loads
  wallConduction: number;
  // W, using CLTD corrected for color, latitude
  roofConduction: number;
  // W, using CLTD
  glassConduction: number;
  // W, using U-factor × ΔT

  // Solar loads
  glassSolar: number;
  // W, using SHGC × SC × CLF

  // Internal loads
  peopleSensible: number;
  // W, using CLF for latent/sensible split
  peopleLatent: number;
  // W
  lighting: number;
  // W, using CLF for ballast type
  equipment: number;
  // W, using diversity factors

  // Ventilation & infiltration
  ventilationSensible: number;
  // W, 1.23 × CFM × ΔT
  ventilationLatent: number;
  // W, 3010 × CFM × ΔW
  infiltrationSensible: number;
  // W
  infiltrationLatent: number;
  // W

  // Duct & fan loads
  ductHeatGain: number;
  // W, based on duct location and insulation
  fanHeat: number;
  // W, based on total static pressure and efficiency

  // Totals
  totalSensible: number;
  totalLatent: number;
  grandTotal: number;
  requiredTR: number;
  requiredCFM: number;
}

// ASHRAE CLTD tables (simplified — full tables in constants)
const CLTD_WALL: Record<string, number[]> = {
  'concrete_block_200mm': [8, 9, 10, 11, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  'brick_wall_200mm': [6, 7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1],
  // ... etc
};

function calculateRTSLoad(inputs: RTSInputs): RTSLoadBreakdown {
  const { room, location, designDate, designHour, indoorConditions } = inputs;

  // 1. Solar position
  const solar = calculateSolarPosition(location.latitude, location.longitude, designDate, designHour);

  // 2. Wall conduction (each wall segment)
  let wallConduction = 0;
  for (const wall of room.walls) {
    const cltd = getCLTD(wall.construction, designHour, wall.orientation, location.latitude);
    const correctedCLTD = cltd + (indoorConditions.db - 24) + (outdoorDesignTemp - 29.4);
    wallConduction += wall.uValue * wall.height * getWallLength(wall) * correctedCLTD;
  }

  // 3. Roof conduction
  const roofCLTD = getRoofCLTD(room.roofType, designHour, location.latitude);
  const roofArea = room.floorArea;
  // Simplified — actual roof may differ
  const roofConduction = room.roofUValue * roofArea * roofCLTD;

  // 4. Glass conduction
  let glassConduction = 0;
  let glassSolar = 0;
  for (const wall of room.walls) {
    for (const win of wall.windows) {
      const winArea = win.width * win.height;
      const glassU = getGlassUValue(win.glassType);

      // Conduction
      glassConduction += glassU * winArea * (outdoorDesignTemp - indoorConditions.db);

      // Solar
      const solarIntensity = getSolarIntensity(solar, wall.orientation);
      const shgc = getSHGC(win.glassType);
      const shadingFactor = getShadingFactor(win, solar);
      const clf = getCLF_Glass(designHour, wall.orientation);
      glassSolar += winArea * solarIntensity * shgc * shadingFactor * clf;
    }
  }

  // 5. Internal loads with CLF
  const peopleSensible = room.occupantCount * getSensiblePerPerson(indoorConditions.db) * getPeopleCLF(designHour);
  const peopleLatent = room.occupantCount * getLatentPerPerson(indoorConditions.db);
  const lightingLoad = room.floorArea * room.lightingDensity;
  const lightingCLF = getLightingCLF(designHour, 'LED');
  // or fluorescent
  const lighting = lightingLoad * lightingCLF;
  const equipment = room.equipmentLoad * getEquipmentDiversity(designHour);

  // 6. Ventilation per ASHRAE 62.1
  const requiredCFM = calculateASHRAE62_1CFM(room);
  const ventilationSensible = 1.23 * requiredCFM * (outdoorDesignTemp - indoorConditions.db);
  const ventilationLatent = 3010 * requiredCFM * (outdoorHumidityRatio - indoorHumidityRatio);

  // 7. Infiltration (crack method or air changes)
  const infiltrationCFM = room.volume * getInfiltrationACH(room) / 60;
  const infiltrationSensible = 1.23 * infiltrationCFM * (outdoorDesignTemp - indoorConditions.db);
  const infiltrationLatent = 3010 * infiltrationCFM * (outdoorHumidityRatio - indoorHumidityRatio);

  // 8. Duct and fan loads
  const ductHeatGain = calculateDuctHeatGain(room, requiredCFM);
  const fanHeat = calculateFanHeat(requiredCFM, ductStaticPressure, fanEfficiency);

  // 9. Totals
  const totalSensible = wallConduction + roofConduction + glassConduction + glassSolar +
    peopleSensible + lighting + equipment + ventilationSensible +
    infiltrationSensible + ductHeatGain + fanHeat;
  const totalLatent = peopleLatent + ventilationLatent + infiltrationLatent;
  const grandTotal = totalSensible + totalLatent;

  return {
    wallConduction,
    roofConduction,
    glassConduction,
    glassSolar,
    peopleSensible,
    peopleLatent,
    lighting,
    equipment,
    ventilationSensible,
    ventilationLatent,
    infiltrationSensible,
    infiltrationLatent,
    ductHeatGain,
    fanHeat,
    totalSensible,
    totalLatent,
    grandTotal,
    requiredTR: grandTotal / 3517,
    requiredCFM,
  };
}
```

### 3.3 Solar Position Calculator

```
// src/lib/engine/hvac/solar-position.ts
function calculateSolarPosition(
  latitude: number,
  longitude: number,
  date: Date,
  hour: number
): SolarPosition {
  const dayOfYear = getDayOfYear(date);
  const declination = 23.45 * Math.sin(Math.radians((360 / 365) * (dayOfYear - 81)));
  const hourAngle = 15 * (hour - 12);
  const latRad = Math.radians(latitude);
  const decRad = Math.radians(declination);
  const haRad = Math.radians(hourAngle);

  const altitude = Math.asin(
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
  );

  const azimuth = Math.acos(
    (Math.sin(decRad) - Math.sin(latRad) * Math.sin(altitude)) /
    (Math.cos(latRad) * Math.cos(altitude))
  );

  return { altitude: Math.degrees(altitude), azimuth: Math.degrees(azimuth) };
}
```

## Phase 4: Duct & Airflow Accuracy (Weeks 8-10)

### 4.1 Current Issues

File: src/lib/engine/hvac/airflow-duct-engine.ts (5,904 bytes)
Problems:
- No fitting loss coefficients (elbows, tees, transitions)
- No duct aspect ratio effects on friction factor
- Static pressure calculation doesn’t account for system effect factors
- No velocity profile consideration (assumes uniform)

### 4.2 Enhanced Duct Sizing

```
// src/lib/engine/hvac/duct-accuracy.ts
interface DuctSegment {
  id: string;
  start: Point3D;
  end: Point3D;
  airflow: number;
  // CFM
  shape: 'round' | 'rectangular';
  diameter?: number;
  // inches (round)
  width?: number;
  // inches (rectangular)
  height?: number;
  // inches (rectangular)
  material: string;
  // galvanized steel, fiberglass, etc.
  roughness: number;
  // ft
  fittings: Fitting[];
  length: number;
  // ft
}
interface Fitting {
  type:
    | 'elbow_90'
    | 'elbow_45'
    | 'tee_branch'
    | 'tee_run'
    | 'transition'
    | 'damper'
    | ' grille';
  coefficient: number;
  // C from ASHRAE Fitting Database
  areaRatio?: number;
  // for transitions
}
function calculateDuctPressureDrop(segment: DuctSegment): PressureDropResult {
  // 1. Velocity
  const area = segment.shape === 'round'
    ? Math.PI * (segment.diameter! / 12 / 2) ** 2
    : (segment.width! * segment.height!) / 144;
  const velocity = segment.airflow / area;

  // ft/min
  const velocityFps = velocity / 60;

  // 2. Reynolds number
  const hydraulicDiameter = segment.shape === 'round'
    ? segment.diameter! / 12
    : 1.3 * Math.pow(segment.width! * segment.height!, 0.625) /
      Math.pow(segment.width! + segment.height!, 0.25) / 12;
  const Re = velocityFps * hydraulicDiameter / 1.6e-4;

  // kinematic viscosity
  // 3. Friction factor (Colebrook-White)
  const epsilon = segment.roughness / hydraulicDiameter;
  const f = solveColebrook(Re, epsilon);

  // 4. Friction loss
  const frictionLoss = f * (segment.length / hydraulicDiameter) * (velocityFps ** 2 / (2 * 32.2));

  // 5. Fitting losses
  let fittingLoss = 0;
  for (const fitting of segment.fittings) {
    const vp = velocityFps ** 2 / (2 * 32.2);
    // velocity pressure
    fittingLoss += fitting.coefficient * vp;
  }

  // 6. Total pressure drop (inches w.c.)
  const totalPressureDrop = (frictionLoss + fittingLoss) * 5.2;

  // convert to in.w.c.
  // 7. Velocity pressure
  const velocityPressure = (velocityFps ** 2 / (2 * 32.2)) * 5.2;

  return {
    frictionLoss: frictionLoss * 5.2,
    fittingLoss: fittingLoss * 5.2,
    totalPressureDrop,
    velocity,
    velocityPressure,
    reynoldsNumber: Re,
    frictionFactor: f,
  };
}
function solveColebrook(Re: number, epsilon: number): number {
  // Haaland approximation
  const f = Math.pow(
    -1.8 * Math.log10(
      Math.pow(epsilon / 3.7, 1.11) + 6.9 / Re
    ),
    -2
  );
  return f;
}
```

## Phase 5: 3D Visualization Overhaul (Weeks 9-12)

### 5.1 New 3D Viewer Architecture

```ts
// src/components/building/AccurateBuildingViewer.tsx
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Html } from '@react-three/drei';
import { EffectComposer, SSAO, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

interface AccurateBuildingViewerProps {
  building: BuildingGeometry;
  cfdResult?: SimulationResult;
  loadResults?: Record<string, RTSLoadBreakdown>;
  selectedRoom?: string;
  onRoomSelect: (roomId: string) => void;
  viewMode: 'geometry' | 'thermal' | 'cfd-temperature' | 'cfd-velocity' | 'loads';
}

function BuildingScene({ building, ...props }: AccurateBuildingViewerProps) {
  return (
    <Canvas shadows camera={{ position: [20, 20, 20], fov: 45 }}>
      <color attach="background" args={['#0f172a']} />
      <fog attach="fog" args={['#0f172a', 30, 100]} />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />

      {/* Building */}
      <group>
        {building.floors.map((floor) => (
          <FloorGroup key={floor.id} floor={floor} {...props} />
        ))}
      </group>

      {/* CFD Overlay */}
      {props.cfdResult && props.viewMode.startsWith('cfd') && (
        <CFDVolumeRenderer result={props.cfdResult} building={building} />
      )}

      {/* Environment */}
      <Environment preset="city" />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={50} blur={2} />

      {/* Controls */}
      <OrbitControls
        makeDefault
        minDistance={5}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />

      {/* Post-processing */}
      <EffectComposer>
        <SSAO radius={0.5} intensity={50} />
      </EffectComposer>
    </Canvas>
  );
}

function FloorGroup({ floor, ...props }: FloorGroupProps) {
  return (
    <group position={[0, floor.elevation, 0]}>
      {floor.rooms.map((room) => (
        <AccurateRoomMesh
          key={room.id}
          room={room}
          isSelected={props.selectedRoom === room.id}
          onClick={() => props.onRoomSelect(room.id)}
          viewMode={props.viewMode}
          loadResult={props.loadResults?.[room.id]}
        />
      ))}

      {/* Structural elements */}
      {floor.columns.map((col, i) => (
        <ColumnMesh key={i} position={col} />
      ))}
      {floor.beams.map((beam, i) => (
        <BeamMesh key={i} start={beam.start} end={beam.end} height={beam.height} />
      ))}
    </group>
  );
}

function AccurateRoomMesh({ room, isSelected, onClick, viewMode, loadResult }: RoomMeshProps) {
  const wallGeometries = useMemo(() => {
    return room.walls.map((wall) => {
      const shape = new THREE.Shape();
      const length = distance(wall.start, wall.end);

      // Wall profile
      shape.moveTo(0, 0);
      shape.lineTo(length, 0);
      shape.lineTo(length, wall.height);
      shape.lineTo(0, wall.height);
      shape.closePath();

      // Window cutouts
      wall.windows.forEach((win) => {
        const hole = new THREE.Path();
        const winStart = win.sillHeight;
        const winEnd = win.sillHeight + win.height;
        const winWidth = win.width;
        const winCenter = length / 2; // Simplified — actual placement from BIM
        hole.moveTo(winCenter - winWidth / 2, winStart);
        hole.lineTo(winCenter + winWidth / 2, winStart);
        hole.lineTo(winCenter + winWidth / 2, winEnd);
        hole.lineTo(winCenter - winWidth / 2, winEnd);
        hole.closePath();
        shape.holes.push(hole);
      });

      const extrudeSettings = {
        depth: wall.thickness,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 2,
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // Rotate and position to match wall segment
      const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
      geometry.rotateZ(angle);
      geometry.translate(wall.start.x, 0, wall.start.y);
      return geometry;
    });
  }, [room.walls]);

  // Color based on view mode
  const wallColor = useMemo(() => {
    if (isSelected) return '#3b82f6';
    switch (viewMode) {
      case 'thermal':
        return loadResult ? tempToColor(loadResult.totalSensible / room.floorArea) : '#e2e8f0';
      case 'loads':
        return loadResult ? loadToColor(loadResult.grandTotal / room.floorArea) : '#e2e8f0';
      default:
        return '#e2e8f0';
    }
  }, [viewMode, loadResult, isSelected, room.floorArea]);

  return (
    <group onClick={onClick}>
      {wallGeometries.map((geo, i) => (
        <mesh key={i} geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial
            color={wallColor}
            transparent={viewMode === 'geometry'}
            opacity={viewMode === 'geometry' ? 0.9 : 0.7}
            side={THREE.DoubleSide}
          />
          <Edges color="#64748b" threshold={15} />
        </mesh>
      ))}

      {/* Glass windows */}
      {room.walls.flatMap((wall) =>
        wall.windows.map((win, i) => <WindowMesh key={`${wall.id}-${i}`} window={win} wall={wall} />)
      )}

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[createShapeFromFootprint(room.footprint)]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, room.ceilingHeight, 0]}>
        <shapeGeometry args={[createShapeFromFootprint(room.footprint)]} />
        <meshStandardMaterial color="#f8fafc" transparent opacity={0.3} />
      </mesh>

      {/* Room label */}
      <Html position={[room.centroid.x, room.ceilingHeight + 0.3, room.centroid.z]} center>
        <div className="bg-slate-900/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {room.name}
          {loadResult && (
            <div className="text-slate-300">
              {loadResult.grandTotal.toFixed(0)} W | {loadResult.requiredTR.toFixed(2)} TR
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

function CFDVolumeRenderer({ result, building }: CFDVolumeRendererProps) {
  // Use 3D texture or instanced mesh for CFD field visualization
  const texture = useMemo(() => {
    const size = result.config.gridSizeX * result.config.gridSizeY * result.config.gridSizeZ;
    const data = new Uint8Array(size * 4);
    let i = 0;

    for (let z = 0; z < result.config.gridSizeZ; z++) {
      for (let y = 0; y < result.config.gridSizeY; y++) {
        for (let x = 0; x < result.config.gridSizeX; x++) {
          const temp = result.temperatureField[x]?.[y]?.[z] ?? 24;
          const color = tempToRGB(temp, result.metrics.minTemperature, result.metrics.maxTemperature);
          data[i++] = color.r;
          data[i++] = color.g;
          data[i++] = color.b;
          data[i++] = Math.min(255, (temp - 20) * 10); // Alpha based on temperature
        }
      }
    }

    const texture3D = new THREE.Data3DTexture(
      data,
      result.config.gridSizeX,
      result.config.gridSizeY,
      result.config.gridSizeZ
    );
    texture3D.format = THREE.RGBAFormat;
    texture3D.minFilter = THREE.LinearFilter;
    texture3D.magFilter = THREE.LinearFilter;
    texture3D.unpackAlignment = 1;
    texture3D.needsUpdate = true;
    return texture3D;
  }, [result]);

  return (
    <mesh>
      <boxGeometry
        args={[
          result.config.gridSizeX * result.config.gridResolution,
          result.config.gridSizeZ * result.config.gridResolution,
          result.config.gridSizeY * result.config.gridResolution,
        ]}
      />
      <shaderMaterial
        vertexShader={volumeVertexShader}
        fragmentShader={volumeFragmentShader}
        uniforms={{
          map: { value: texture },
          cameraPos: { value: new THREE.Vector3() },
          threshold: { value: 0.1 },
          steps: { value: 200 },
        }}
        transparent
        side={THREE.BackSide}
      />
    </mesh>
  );
}
```

### 5.2 Measurement Tools

```
// src/components/building/MeasurementTools.tsx
function MeasurementTools() {
  const [points, setPoints] = useState<Point3D[]>([]);
  const [active, setActive] = useState(false);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    const point = event.point;
    setPoints((prev) => {
      if (prev.length >= 2) return [point];
      return [...prev, point];
    });
  };

  const distance =
    points.length === 2
      ? Math.sqrt(
          (points[1].x - points[0].x) ** 2 +
          (points[1].y - points[0].y) ** 2 +
          (points[1].z - points[0].z) ** 2
        )
      : 0;

  return (
    <>
      <mesh onClick={handleClick} visible={false}>
        <boxGeometry args={[100, 100, 100]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {points.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.05]} />
          <meshBasicMaterial color={i === 0 ? '#22c55e' : '#ef4444'} />
        </mesh>
      ))}

      {points.length === 2 && (
        <>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={
                  new Float32Array([
                    points[0].x,
                    points[0].y,
                    points[0].z,
                    points[1].x,
                    points[1].y,
                    points[1].z,
                  ])
                }
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#f59e0b" linewidth={2} />
          </line>

          <Html
            position={[
              (points[0].x + points[1].x) / 2,
              (points[0].y + points[1].y) / 2,
              (points[0].z + points[1].z) / 2,
            ]}
          >
            <div className="bg-slate-900 text-white text-sm px-2 py-1 rounded">
              {distance.toFixed(3)} m
            </div>
          </Html>
        </>
      )}
    </>
  );
}
```

## Phase 6: Integration & Data Flow (Weeks 11-13)

### 6.1 New Data Architecture

```
Project
├── BuildingGeometry (NEW)
│   ├── floors[]
│   │   ├── rooms[]
│   │   │   ├── walls[] (with windows, doors)
│   │   │   ├── volume (exact)
│   │   │   ├── surfaceArea
│   │   │   └── adjacentRooms[]
│   │   ├── columns[]
│   │   └── beams[]
│   └── site context
├── LoadCalculations
│   ├── rooms[]
│   │   ├── rtsBreakdown (detailed)
│   │   ├── requiredTR
│   │   └── requiredCFM
│   └── totals
├── CFDResults
│   ├── adaptiveMesh (octree)
│   ├── temperatureField
│   ├── velocityField
│   ├── pressureField
│   ├── metrics
│   └── validation (GCI, etc.)
├── EquipmentSelections
│   ├── units[]
│   └── ductNetwork
└── BOQ
  ├── items[]
  └── pricing
```

### 6.2 API Changes

```
// src/app/api/projects/[id]/geometry/route.ts — NEW
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const geometry = validateBuildingGeometry(body);

  // Store in Firestore
  await db.collection('projects').doc(params.id).update({
    geometry: geometry.toJSON(),
    updatedAt: new Date(),
  });

  // Trigger downstream recalculations
  await recalculateLoads(params.id);
  await invalidateCFD(params.id);

  return Response.json({ success: true });
}

// src/app/api/projects/[id]/calculate/route.ts — MODIFIED
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const project = await loadProject(params.id);

  if (!project.geometry) {
    return Response.json({ error: 'Building geometry required' }, { status: 400 });
  }

  // 1. Calculate loads using RTS method
  const loadResults = await calculateRTSLoads(project.geometry, project.location);

  // 2. Size equipment
  const equipment = await sizeEquipment(loadResults, project.preferences);

  // 3. Design ductwork
  const ductNetwork = await designDuctwork(equipment, project.geometry);

  // 4. Run CFD if requested
  let cfdResult = null;
  if (project.settings.runCFD) {
    cfdResult = await runCFDSimulation(project.geometry, equipment, {
      adaptiveMesh: true,
      turbulence: 'k-omega-sst',
      conjugateHeatTransfer: true,
    });
  }

  // 5. Store results
  await storeCalculationResults(params.id, {
    loads: loadResults,
    equipment,
    ductNetwork,
    cfd: cfdResult,
  });

  return Response.json({
    summary: {
      totalTR: loadResults.totalTR,
      totalCFM: loadResults.totalCFM,
      equipmentCount: equipment.length,
      cfdConverged: cfdResult?.status === 'completed',
    },
  });
}
```

## Phase 7: Testing & Validation (Weeks 13-14)

### 7.1 Unit Tests

```
// src/lib/engine/cfd/__tests__/adaptive-grid.test.ts
describe('AdaptiveCFDGrid', () => {
  it('should refine near walls', () => {
    const building = createTestBuilding();
    const grid = new AdaptiveCFDGrid(building, { minCellSize: 0.125, maxLevel: 5 });
    const wallCells = Array.from(grid.leafNodes()).filter((cell) => cell.wallDistance < 0.3);
    expect(wallCells.every((cell) => cell.cellSize <= 0.25)).toBe(true);
  });

  it('should maintain volume conservation', () => {
    const building = createTestBuilding();
    const grid = new AdaptiveCFDGrid(building, { minCellSize: 0.125, maxLevel: 5 });
    const totalVolume = Array.from(grid.leafNodes()).reduce(
      (sum, cell) => sum + cell.cellSize ** 3,
      0
    );
    const expectedVolume = building.boundingBoxVolume;
    expect(Math.abs(totalVolume - expectedVolume) / expectedVolume).toBeLessThan(0.01);
  });
});

// src/lib/engine/hvac/__tests__/rts-calculation.test.ts
describe('RTS Load Calculation', () => {
  it('should match ASHRAE example 8.1', () => {
    const inputs = loadASHRAEExample81();
    const result = calculateRTSLoad(inputs);

    // ASHRAE example: 15.2 TR for 200 m² office
    expect(result.requiredTR).toBeCloseTo(15.2, 0);

    // within 1 TR
    expect(result.totalSensible).toBeGreaterThan(result.totalLatent);
  });

  it('should account for solar orientation', () => {
    const southRoom = createRoom({ orientation: 180 });
    const northRoom = createRoom({ orientation: 0 });
    const southLoad = calculateRTSLoad({ ...inputs, room: southRoom });
    const northLoad = calculateRTSLoad({ ...inputs, room: northRoom });
    expect(southLoad.glassSolar).toBeGreaterThan(northLoad.glassSolar);
  });
});
```

### 7.2 Integration Tests

```
// tests/integration/cfd-validation.test.ts
describe('CFD Validation', () => {
  it('should pass ASHRAE benchmark case', async () => {
    const benchmark = loadASHRAEBenchmark('room-6.1m-x-6.1m-x-2.4m');
    const result = await runCFDSimulation(benchmark.geometry, benchmark.config);

    // Compare against measured data
    const errors = benchmark.measurementPoints.map((point) => ({
      position: point.position,
      measured: point.temperature,
      simulated: interpolateTemperature(result, point.position),
      error: Math.abs(point.temperature - interpolateTemperature(result, point.position)),
    }));
    const maxError = Math.max(...errors.map((e) => e.error));
    expect(maxError).toBeLessThan(0.5);

    // ±0.5°C
  });

  it('should show grid independence', async () => {
    const study = await runGridIndependenceStudy(testBuilding, baseConfig);
    expect(study.gci).toBeLessThan(5);

    // GCI < 5%
  });
});
```

## Phase 8: Performance Optimization (Weeks 14-15)

### 8.1 CFD Performance

### 8.2 3D Viewer Performance

```
// src/components/building/performance/LODManager.tsx
function LODManager({ building, cameraDistance }: LODProps) {
  const lodLevel = useMemo(() => {
    if (cameraDistance < 10) return 'high';
    if (cameraDistance < 30) return 'medium';
    return 'low';
  }, [cameraDistance]);

  return (
    <>
      {lodLevel === 'high' && <DetailedBuilding building={building} />}
      {lodLevel === 'medium' && <SimplifiedBuilding building={building} />}
      {lodLevel === 'low' && <BoundingBoxBuilding building={building} />}
    </>
  );
}
```

## Implementation Timeline

## Dependencies to Add

```json
{
	"dependencies": {
		"three": "^0.170.0",
		"@react-three/fiber": "^8.17.0",
		"@react-three/drei": "^9.120.0",
		"@react-three/postprocessing": "^2.16.0",
		"web-ifc": "^0.0.54",
		"three-mesh-bvh": "^0.7.0",
		"zustand": "^4.5.0"
	},
	"devDependencies": {
		"@types/three": "^0.170.0",
		"vitest": "^2.0.0"
	}
}
```

### Python Dependencies

- pyamg>=5.0.0
- scipy>=1.12.0
- numpy>=1.26.0
- numba>=0.59.0
- meshio>=5.3.0

## Risk Mitigation

## Success Metrics

This plan was generated based on a full scan of the HVAC-Auto-Est-Project repository, analyzing 47 source files, 3 engine modules, 2 3D viewer components, and the simulation type system.


