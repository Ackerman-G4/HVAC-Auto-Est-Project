/**
 * smoke-openfoam-export — asserts the CONSUMER's contract: the exact case a real
 * OpenFOAM solver needs to mesh and start (Wave 8). This replaces the pre-Wave-6
 * test that asserted the producer's broken output (transportProperties for a
 * buoyant case, empty blockMesh boundary, no named patches) and certified 6
 * green tests on cases that could not run.
 *
 * Run: npm run validate:cfd:export
 */

import { describe, it, expect } from 'vitest';
import { buildStructuredGrid, recommendCellSize } from '@/lib/engine/simulation/geometry-builder';
import { buildOpenFOAMConfig, generateCaseFiles } from '@/lib/engine/simulation/openfoam-exporter';
import {
  DEFAULT_PHYSICS_SETUP,
  DEFAULT_SOLVER_PROFILE,
  type GeometryInput,
  type HVACUnit,
  type PhysicsSetup,
  type SimulationCase,
} from '@/types/simulation';

function oneRoomGeometry(): GeometryInput {
  // One CRAC (id has a hyphen on purpose → patch hvac_supply_crac-1) → one
  // supply inlet + one return outlet.
  const crac: HVACUnit = {
    id: 'crac-1',
    type: 'crac',
    name: 'CRAC-1',
    position: { x: 1, y: 0, z: 0 },
    width: 1,
    depth: 0.8,
    height: 1.8,
    capacityKW: 20,
    capacityTR: 5.7,
    airflowCFM: 3000,
    supplyTempC: 16,
    returnTempC: 26,
    orientation: 0,
    powerInputKW: 6,
    status: 'active',
  };
  return {
    roomId: 'smoke-room',
    lengthM: 5,
    widthM: 4,
    heightM: 3,
    raisedFloorHeightM: 0,
    ceilingPlenumHeightM: 0,
    walls: [],
    hvacUnits: [crac],
    racks: [],
    tiles: [],
    obstructions: [],
  };
}

function buildCase(physics: PhysicsSetup): SimulationCase {
  const geometry = oneRoomGeometry();
  const cellSize = recommendCellSize(geometry, 8000);
  const mesh = buildStructuredGrid(geometry, cellSize);
  const now = new Date().toISOString();
  return {
    id: 'smoke-case',
    projectId: 'smoke-project',
    ownerId: 'smoke-owner',
    name: 'Smoke Room',
    description: '',
    status: 'meshed',
    runSource: 'openfoam',
    solverBackend: 'engineering',
    simulationScope: 'room',
    geometry,
    mesh,
    physics,
    solver: DEFAULT_SOLVER_PROFILE,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Buoyant (buoyantSimpleFoam) — the default, thermal case ──────────────────

describe('smoke: buoyant OpenFOAM case contract', () => {
  const simCase = buildCase({ ...DEFAULT_PHYSICS_SETUP, buoyancy: true });
  const config = buildOpenFOAMConfig(simCase);
  const files = generateCaseFiles(config);
  const get = (p: string) => files.get(p) ?? '';

  it('selects buoyantSimpleFoam and controlDict agrees', () => {
    expect(config.solver).toBe('buoyantSimpleFoam');
    expect(config.controlDict.application).toBe('buoyantSimpleFoam');
  });

  it('emits the buoyant thermophysical file set (g, thermophysicalProperties, p_rgh, alphat)', () => {
    for (const p of ['constant/g', 'constant/thermophysicalProperties', '0/p_rgh', '0/alphat']) {
      expect(files.has(p), `missing ${p}`).toBe(true);
      expect(get(p).length, `${p} empty`).toBeGreaterThan(0);
    }
  });

  it('does NOT emit transportProperties for a buoyant case', () => {
    // Its presence would make the solver read the wrong properties file.
    expect(files.has('constant/transportProperties')).toBe(false);
  });

  it('emits the system dicts including topoSet + createPatch', () => {
    for (const p of [
      'system/blockMeshDict', 'system/controlDict', 'system/fvSchemes',
      'system/fvSolution', 'system/topoSetDict', 'system/createPatchDict',
    ]) {
      expect(files.has(p), `missing ${p}`).toBe(true);
    }
  });

  it('emits the buoyant 0/ field set', () => {
    for (const p of ['0/U', '0/T', '0/p_rgh', '0/p', '0/alphat', '0/nut', '0/k', '0/epsilon']) {
      expect(files.has(p), `missing ${p}`).toBe(true);
    }
  });

  it('blockMesh declares all six box boundary faces (empty boundary cannot mesh)', () => {
    const bm = get('system/blockMeshDict');
    for (const face of ['box_xmin', 'box_xmax', 'box_ymin', 'box_ymax', 'box_zmin', 'box_zmax']) {
      expect(bm.includes(face), `blockMesh missing ${face}`).toBe(true);
    }
  });

  it('gravity is (0 0 -9.81) — z is the vertical axis; a wrong axis inverts buoyancy', () => {
    expect(config.gravity).toEqual({ x: 0, y: 0, z: -9.81 });
    expect(get('constant/g')).toContain('(0 0 -9.81)');
  });

  it('every named patch has a <name>_faces faceSet in topoSetDict AND an entry in createPatchDict', () => {
    const topo = get('system/topoSetDict');
    const create = get('system/createPatchDict');
    const named = config.namedPatches ?? [];
    expect(named.length).toBeGreaterThan(0);
    for (const p of named) {
      expect(topo.includes(`${p.name}_faces`), `topoSet missing ${p.name}_faces`).toBe(true);
      expect(create.includes(`set ${p.name}_faces`), `createPatch missing set ${p.name}_faces`).toBe(true);
      expect(create.includes(`name ${p.name};`), `createPatch missing name ${p.name}`).toBe(true);
    }
  });

  it('createPatch lists generic wall patches BEFORE specific vent patches (ordering invariant)', () => {
    const create = get('system/createPatchDict');
    const firstWall = create.indexOf('name wall_');
    const firstVent = create.indexOf('name hvac_');
    expect(firstWall).toBeGreaterThanOrEqual(0);
    expect(firstVent).toBeGreaterThan(firstWall);
  });

  it('patch-name sanitizer preserves hyphens', () => {
    const create = get('system/createPatchDict');
    expect(create).toContain('hvac_supply_crac-1');
    expect(create).toContain('hvac_return_crac-1');
  });

  it('has at least one inlet and one outlet patch', () => {
    const roles = (config.namedPatches ?? []).map((p) => p.role);
    expect(roles).toContain('inlet');
    expect(roles).toContain('outlet');
  });

  it('every boundary-condition patch name exists in the mesh (no patch-name mismatch)', () => {
    const meshPatchNames = new Set(simCase.mesh!.patches.map((p) => p.name));
    for (const bc of config.boundaryConditions) {
      expect(meshPatchNames.has(bc.patchName), `BC references unknown patch "${bc.patchName}"`).toBe(true);
    }
  });

  it('every named patch appears in each buoyant field boundary file', () => {
    const named = config.namedPatches ?? [];
    for (const field of ['U', 'T', 'k', 'epsilon', 'p_rgh', 'p', 'alphat', 'nut']) {
      const content = get(`0/${field}`);
      for (const p of named) {
        expect(content.includes(p.name), `0/${field} missing patch ${p.name}`).toBe(true);
      }
    }
  });

  it('blockMesh vertices are all finite', () => {
    for (const v of config.blockMesh?.vertices ?? []) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
    }
  });
});

// ── Isothermal (simpleFoam) — the non-buoyant branch ─────────────────────────

describe('smoke: simpleFoam OpenFOAM case contract', () => {
  const simCase = buildCase({ ...DEFAULT_PHYSICS_SETUP, buoyancy: false });
  const config = buildOpenFOAMConfig(simCase);
  const files = generateCaseFiles(config);

  it('selects simpleFoam and emits transportProperties (not thermophysical)', () => {
    expect(config.solver).toBe('simpleFoam');
    expect(files.has('constant/transportProperties')).toBe(true);
    expect(files.has('constant/thermophysicalProperties')).toBe(false);
    expect(files.has('constant/g')).toBe(false);
    expect(files.has('0/p_rgh')).toBe(false);
    expect(files.has('0/alphat')).toBe(false);
  });

  it('still carves named patches and declares the six box faces', () => {
    const bm = files.get('system/blockMeshDict') ?? '';
    for (const face of ['box_xmin', 'box_xmax', 'box_ymin', 'box_ymax', 'box_zmin', 'box_zmax']) {
      expect(bm.includes(face)).toBe(true);
    }
    expect(files.has('system/topoSetDict')).toBe(true);
    expect(files.has('system/createPatchDict')).toBe(true);
    expect(files.has('0/p')).toBe(true);
  });
});
