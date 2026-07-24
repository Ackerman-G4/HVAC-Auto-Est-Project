/**
 * Geometry Builder — Structured Room Workflow
 *
 * Accepts a GeometryInput (room dimensions, HVAC units, racks, tiles, obstructions)
 * and produces a StructuredGrid with hexahedral cells, zone classifications,
 * and named boundary patches suitable for internal solving or OpenFOAM export.
 */

import type {
  GeometryInput,
  StructuredGrid,
  CellZoneType,
  BoundaryPatch,
  Vec3,
  HVACUnit,
  ServerRack,
  PerforatedTile,
  RoomObstruction,
} from '@/types/simulation';

// ─── Configuration ──────────────────────────────────────────────────

/** Minimum cell size in meters (prevents excessively fine grids) */
const MIN_CELL_SIZE = 0.05;
/** Maximum cell count per axis (guards memory usage) */
const MAX_CELLS_PER_AXIS = 200;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Build a structured hexahedral grid from room geometry input.
 *
 * @param input  Complete geometry description
 * @param cellSize  Desired uniform cell size in meters (clamped to safe range)
 * @returns StructuredGrid ready for solver or export
 */
export function buildStructuredGrid(input: GeometryInput, cellSize: number): StructuredGrid {
  const cs = clampCellSize(cellSize, input);
  const nx = Math.ceil(input.lengthM / cs);
  const ny = Math.ceil(input.widthM / cs);
  const nz = Math.ceil(input.heightM / cs);

  // Initialize all cells as fluid
  const zones = allocateZones(nx, ny, nz, 'fluid');

  // Carve solid zones for geometry features
  markRaisedFloor(zones, input, cs, nz);
  markCeilingPlenum(zones, input, cs, nz);
  markRacks(zones, input.racks, cs);
  markHVACUnits(zones, input.hvacUnits, cs);
  markObstructions(zones, input.obstructions, cs);

  // Build boundary patches
  const patches: BoundaryPatch[] = [];
  patches.push(...buildWallPatches(zones, nx, ny, nz));
  patches.push(...buildFloorCeilingPatches(zones, nx, ny, nz));
  patches.push(...buildTileInletPatches(input.tiles, cs, nz, input.raisedFloorHeightM));
  patches.push(...buildHVACPatches(input.hvacUnits, cs, nz));

  // Count cells
  let fluidCellCount = 0;
  let solidCellCount = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        if (zones[i][j][k] === 'fluid') fluidCellCount++;
        else solidCellCount++;
      }
    }
  }

  return {
    nx,
    ny,
    nz,
    cellSizeM: cs,
    extents: { x: nx * cs, y: ny * cs, z: nz * cs },
    zones,
    patches,
    fluidCellCount,
    solidCellCount,
  };
}

/**
 * Compute a recommended cell size based on room dimensions and a target
 * total cell budget.
 */
export function recommendCellSize(input: GeometryInput, targetCellBudget = 500_000): number {
  const volume = input.lengthM * input.widthM * input.heightM;
  const rawSize = Math.cbrt(volume / targetCellBudget);
  return clampCellSize(rawSize, input);
}

// ─── Zone Marking ───────────────────────────────────────────────────

function allocateZones(nx: number, ny: number, nz: number, fill: CellZoneType): CellZoneType[][][] {
  const zones: CellZoneType[][][] = new Array(nx);
  for (let i = 0; i < nx; i++) {
    zones[i] = new Array(ny);
    for (let j = 0; j < ny; j++) {
      zones[i][j] = new Array(nz).fill(fill);
    }
  }
  return zones;
}

function markRaisedFloor(
  zones: CellZoneType[][][],
  input: GeometryInput,
  cs: number,
  _nz: number,
): void {
  if (input.raisedFloorHeightM <= 0) return;
  const kMax = Math.min(Math.ceil(input.raisedFloorHeightM / cs), zones[0][0].length);
  for (let i = 0; i < zones.length; i++) {
    for (let j = 0; j < zones[0].length; j++) {
      for (let k = 0; k < kMax; k++) {
        zones[i][j][k] = 'raised_floor';
      }
    }
  }
}

function markCeilingPlenum(
  zones: CellZoneType[][][],
  input: GeometryInput,
  cs: number,
  nz: number,
): void {
  if (input.ceilingPlenumHeightM <= 0) return;
  const plenumCells = Math.min(Math.ceil(input.ceilingPlenumHeightM / cs), nz);
  const kStart = nz - plenumCells;
  for (let i = 0; i < zones.length; i++) {
    for (let j = 0; j < zones[0].length; j++) {
      for (let k = kStart; k < nz; k++) {
        zones[i][j][k] = 'ceiling_plenum';
      }
    }
  }
}

function markRacks(zones: CellZoneType[][][], racks: ServerRack[], cs: number): void {
  for (const rack of racks) {
    markBox(zones, rack.position, rack.width, rack.depth, rack.height, cs, 'solid_rack');
  }
}

function markHVACUnits(zones: CellZoneType[][][], units: HVACUnit[], cs: number): void {
  for (const unit of units) {
    markBox(zones, unit.position, unit.width, unit.depth, unit.height, cs, 'solid_hvac');
  }
}

function markObstructions(zones: CellZoneType[][][], obstructions: RoomObstruction[], cs: number): void {
  for (const obs of obstructions) {
    markBox(zones, obs.position, obs.width, obs.depth, obs.height, cs, 'solid_obstruction');
  }
}

/** Mark a rectangular box region as a given zone type. */
function markBox(
  zones: CellZoneType[][][],
  position: Vec3,
  width: number,
  depth: number,
  height: number,
  cs: number,
  zoneType: CellZoneType,
): void {
  const nx = zones.length;
  const ny = zones[0].length;
  const nz = zones[0][0].length;

  const iMin = Math.max(0, Math.floor(position.x / cs));
  const iMax = Math.min(nx, Math.ceil((position.x + width) / cs));
  const jMin = Math.max(0, Math.floor(position.y / cs));
  const jMax = Math.min(ny, Math.ceil((position.y + depth) / cs));
  const kMin = Math.max(0, Math.floor(position.z / cs));
  const kMax = Math.min(nz, Math.ceil((position.z + height) / cs));

  for (let i = iMin; i < iMax; i++) {
    for (let j = jMin; j < jMax; j++) {
      for (let k = kMin; k < kMax; k++) {
        zones[i][j][k] = zoneType;
      }
    }
  }
}

// ─── Boundary Patches ───────────────────────────────────────────────

function buildWallPatches(
  zones: CellZoneType[][][],
  nx: number,
  ny: number,
  nz: number,
): BoundaryPatch[] {
  const patches: BoundaryPatch[] = [];

  // Four vertical walls: -x, +x, -y, +y
  const wallDefs: { name: string; face: BoundaryPatch['faces'][0]['face']; iter: () => Generator<{ i: number; j: number; k: number }> }[] = [
    {
      name: 'wall_xMin',
      face: '-x',
      *iter() { for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) yield { i: 0, j, k }; },
    },
    {
      name: 'wall_xMax',
      face: '+x',
      *iter() { for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) yield { i: nx - 1, j, k }; },
    },
    {
      name: 'wall_yMin',
      face: '-y',
      *iter() { for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) yield { i, j: 0, k }; },
    },
    {
      name: 'wall_yMax',
      face: '+y',
      *iter() { for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) yield { i, j: ny - 1, k }; },
    },
  ];

  for (const def of wallDefs) {
    const faces: BoundaryPatch['faces'][0][] = [];
    for (const cell of def.iter()) {
      if (zones[cell.i][cell.j][cell.k] === 'fluid') {
        faces.push({ ...cell, face: def.face });
      }
    }
    if (faces.length > 0) {
      patches.push({
        id: def.name,
        name: def.name,
        type: 'wall',
        faces,
        params: {},
      });
    }
  }

  return patches;
}

function buildFloorCeilingPatches(
  zones: CellZoneType[][][],
  nx: number,
  ny: number,
  nz: number,
): BoundaryPatch[] {
  const patches: BoundaryPatch[] = [];

  // Floor (-z at k=0 or top of raised floor)
  const floorFaces: BoundaryPatch['faces'][0][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      // Find the lowest fluid cell in this column
      for (let k = 0; k < nz; k++) {
        if (zones[i][j][k] === 'fluid') {
          floorFaces.push({ i, j, k, face: '-z' });
          break;
        }
      }
    }
  }
  if (floorFaces.length > 0) {
    patches.push({
      id: 'floor',
      name: 'floor',
      type: 'wall',
      faces: floorFaces,
      params: {},
    });
  }

  // Ceiling (+z at k=nz-1 or bottom of ceiling plenum)
  const ceilingFaces: BoundaryPatch['faces'][0][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      // Find the highest fluid cell in this column
      for (let k = nz - 1; k >= 0; k--) {
        if (zones[i][j][k] === 'fluid') {
          ceilingFaces.push({ i, j, k, face: '+z' });
          break;
        }
      }
    }
  }
  if (ceilingFaces.length > 0) {
    patches.push({
      id: 'ceiling',
      name: 'ceiling',
      type: 'wall',
      faces: ceilingFaces,
      params: {},
    });
  }

  return patches;
}

function buildTileInletPatches(
  tiles: PerforatedTile[],
  cs: number,
  _nz: number,
  raisedFloorHeight: number,
): BoundaryPatch[] {
  if (tiles.length === 0) return [];

  const patches: BoundaryPatch[] = [];
  for (const tile of tiles) {
    // Tile grid position maps to cell indices
    const tileCs = tile.tileSize || 0.6;
    const iCenter = Math.floor((tile.x * tileCs) / cs);
    const jCenter = Math.floor((tile.y * tileCs) / cs);
    const kLevel = raisedFloorHeight > 0 ? Math.ceil(raisedFloorHeight / cs) : 0;

    // Cover the tile area
    const tileCells = Math.max(1, Math.round(tileCs / cs));
    const faces: BoundaryPatch['faces'][0][] = [];
    for (let di = 0; di < tileCells; di++) {
      for (let dj = 0; dj < tileCells; dj++) {
        faces.push({ i: iCenter + di, j: jCenter + dj, k: kLevel, face: '-z' });
      }
    }

    patches.push({
      id: `tile_${tile.x}_${tile.y}`,
      name: `tile_${tile.x}_${tile.y}`,
      type: 'inlet',
      faces,
      params: {
        velocity: { x: 0, y: 0, z: tile.openArea * 2.0 },  // Approximate upward velocity
        temperature: 15,  // Typical supply air temperature
        openAreaFraction: tile.openArea,
      },
    });
  }

  return patches;
}

function buildHVACPatches(
  units: HVACUnit[],
  cs: number,
  _nz: number,
): BoundaryPatch[] {
  const patches: BoundaryPatch[] = [];

  for (const unit of units) {
    if (unit.status === 'failed') continue;

    // Supply patch (outlet face of the HVAC unit)
    const supplyFaces: BoundaryPatch['faces'][0][] = [];
    const iMin = Math.floor(unit.position.x / cs);
    const iMax = Math.ceil((unit.position.x + unit.width) / cs);
    const jFront = Math.floor(unit.position.y / cs);
    const kMin = Math.floor(unit.position.z / cs);
    const kMax = Math.ceil((unit.position.z + unit.height) / cs);

    for (let i = iMin; i < iMax; i++) {
      for (let k = kMin; k < kMax; k++) {
        supplyFaces.push({ i, j: jFront, k, face: '-y' });
      }
    }

    if (supplyFaces.length > 0) {
      // Convert CFM to m/s using the face area
      const faceArea = unit.width * unit.height;
      const velocityMs = faceArea > 0
        ? (unit.airflowCFM * 0.000471947) / faceArea  // CFM to m³/s / area
        : 1.0;

      patches.push({
        id: `hvac_supply_${unit.id}`,
        name: `hvac_supply_${unit.id}`,
        type: 'inlet',
        faces: supplyFaces,
        params: {
          velocity: { x: 0, y: -velocityMs, z: 0 },
          temperature: unit.supplyTempC,
        },
      });
    }

    // Return patch (back face of the HVAC unit, outlet)
    const returnFaces: BoundaryPatch['faces'][0][] = [];
    const jBack = Math.ceil((unit.position.y + unit.depth) / cs);
    for (let i = iMin; i < iMax; i++) {
      for (let k = kMin; k < kMax; k++) {
        returnFaces.push({ i, j: jBack - 1, k, face: '+y' });
      }
    }

    if (returnFaces.length > 0) {
      patches.push({
        id: `hvac_return_${unit.id}`,
        name: `hvac_return_${unit.id}`,
        type: 'outlet',
        faces: returnFaces,
        params: {},
      });
    }
  }

  return patches;
}

// ─── Utilities ──────────────────────────────────────────────────────

function clampCellSize(raw: number, input: GeometryInput): number {
  const minDim = Math.min(input.lengthM, input.widthM, input.heightM);
  const maxFromAxis = minDim / 2; // At least 2 cells along smallest dimension
  const clamped = Math.max(MIN_CELL_SIZE, Math.min(raw, maxFromAxis));

  // Ensure we don't exceed max cells per axis
  const maxCsFromBudget = Math.max(
    input.lengthM / MAX_CELLS_PER_AXIS,
    input.widthM / MAX_CELLS_PER_AXIS,
    input.heightM / MAX_CELLS_PER_AXIS,
  );

  return Math.max(clamped, maxCsFromBudget);
}
