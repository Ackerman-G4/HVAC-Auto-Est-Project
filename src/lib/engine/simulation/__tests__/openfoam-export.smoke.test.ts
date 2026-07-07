/**
 * smoke-openfoam-export (plan §10) — structural checks on the generated
 * OpenFOAM case package. Catches the class of bug the Wave 6 version caught: a
 * boundary-field patch name that doesn't match the mesh patch names, which a
 * real solver only discovers at runtime.
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
  type SimulationCase,
} from '@/types/simulation';

function oneRoomGeometry(): GeometryInput {
  // A small real room: one CRAC unit → one supply (inlet) + one return (outlet).
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

function buildCase(): SimulationCase {
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
    physics: DEFAULT_PHYSICS_SETUP,
    solver: DEFAULT_SOLVER_PROFILE,
    createdAt: now,
    updatedAt: now,
  };
}

describe('smoke: openfoam export structural integrity', () => {
  const simCase = buildCase();
  const config = buildOpenFOAMConfig(simCase);
  const files = generateCaseFiles(config);

  it('emits all required case files', () => {
    const required = [
      'system/blockMeshDict',
      'system/controlDict',
      'system/fvSchemes',
      'system/fvSolution',
      'constant/turbulenceProperties',
      'constant/transportProperties',
      '0/U',
      '0/p',
      '0/T',
      '0/k',
      '0/epsilon',
    ];
    for (const path of required) {
      expect(files.has(path), `missing ${path}`).toBe(true);
      expect((files.get(path) ?? '').length, `${path} is empty`).toBeGreaterThan(0);
    }
  });

  it('has at least one inlet and one outlet patch', () => {
    const types = simCase.mesh!.patches.map((p) => p.type);
    expect(types).toContain('inlet');
    expect(types).toContain('outlet');
  });

  it('every boundary-condition patch name exists in the mesh (no patch-name mismatch)', () => {
    const meshPatchNames = new Set(simCase.mesh!.patches.map((p) => p.name));
    const bcPatchNames = new Set(config.boundaryConditions.map((bc) => bc.patchName));
    for (const name of bcPatchNames) {
      expect(meshPatchNames.has(name), `BC references unknown patch "${name}"`).toBe(true);
    }
  });

  it('every mesh patch appears in each field boundary file', () => {
    for (const field of ['U', 'p', 'T', 'k', 'epsilon']) {
      const content = files.get(`0/${field}`) ?? '';
      for (const patch of simCase.mesh!.patches) {
        expect(content.includes(patch.name), `0/${field} missing patch ${patch.name}`).toBe(true);
      }
    }
  });

  it('selects a buoyant/simple solver and controlDict application agrees', () => {
    expect(config.solver).toMatch(/Foam$/);
    expect(config.controlDict.application).toBe(config.solver);
  });

  it('blockMesh vertices are all finite', () => {
    for (const v of config.blockMesh?.vertices ?? []) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
    }
  });
});
