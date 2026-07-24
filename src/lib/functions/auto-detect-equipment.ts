/**
 * Auto-detect server racks, HVAC units, and perforated tiles from project floor data.
 *
 * Bridges the gap between the project model (Room with spaceType/equipmentLoad) and
 * the simulation model (ServerRack[], HVACUnit[], PerforatedTile[]).
 *
 * Rules:
 * - server_room → generates racks (one per ~5 kW) + CRAC units + perforated tiles
 * - mechanical  → generates AHU/CRAH units
 * - Any room with selected HVAC equipment → generates matching HVACUnit entries
 * - Perforated tiles placed in a grid under every server_room
 */
import type {
  ServerRack,
  HVACUnit,
  PerforatedTile,
  RackDensity,
  HVACUnitType,
} from '@/types/simulation';
import { resolveRoomRects, type RoomRect } from '@/lib/simulation/building-geometry';

/**
 * Structural minimums this detector reads. Both the project `Room`/`Floor`
 * (store path) and the viewer's `DetectedRoom`/`DetectedFloor` satisfy these,
 * so a single implementation serves both callers.
 */
export interface AutoDetectRoom {
  id: string;
  name: string;
  spaceType: string;
  area: number;
  perimeter?: number;
  equipmentLoad: number;
  polygon?: string;
}

export interface AutoDetectFloor {
  id: string;
  floorNumber: number;
  scale: number;
  rooms: AutoDetectRoom[];
}

export interface AutoDetectInput {
  floors: AutoDetectFloor[];
  /** Grid resolution in meters — used to compute tile grid positions */
  gridResolution: number;
}

export interface AutoDetectResult {
  racks: Omit<ServerRack, 'id'>[];
  hvacUnits: Omit<HVACUnit, 'id'>[];
  tiles: PerforatedTile[];
  /** Human-readable summary of what was generated */
  summary: string[];
}

// ─── Rack density thresholds (W/m²) ────────────────────────
function classifyDensity(wattsPerSqM: number): RackDensity {
  if (wattsPerSqM > 2000) return 'ultra';
  if (wattsPerSqM > 1000) return 'high';
  if (wattsPerSqM > 400) return 'medium';
  return 'low';
}

const DENSITY_POWER_MAP: Record<RackDensity, { powerKW: number; airflowCFM: number; filledUnits: number }> = {
  low:    { powerKW: 3,  airflowCFM: 400,  filledUnits: 14 },
  medium: { powerKW: 6,  airflowCFM: 700,  filledUnits: 24 },
  high:   { powerKW: 12, airflowCFM: 1200, filledUnits: 34 },
  ultra:  { powerKW: 20, airflowCFM: 2000, filledUnits: 40 },
};

// Standard 42U rack dimensions (meters)
const RACK_W = 0.6;
const RACK_D = 1.0;
const RACK_H = 2.0;

// Standard perforated tile size (meters)
const TILE_SIZE = 0.6;

/**
 * Auto-detect simulation equipment from project floor/room data.
 */
export function autoDetectEquipment(input: AutoDetectInput): AutoDetectResult {
  const racks: Omit<ServerRack, 'id'>[] = [];
  const hvacUnits: Omit<HVACUnit, 'id'>[] = [];
  const tiles: PerforatedTile[] = [];
  const summary: string[] = [];

  let rackCounter = 1;
  let hvacCounter = 1;

  for (const floor of input.floors) {
    // Equipment places itself inside the SAME room rects the solver builds, so
    // it aligns with the room walls. Canonical coords: x = floor horizontal,
    // y = floor depth, z = elevation (0 for floor-mounted). Depth must go to
    // `y`, never `z` — writing depth to z made every unit float off the grid.
    const rects = resolveRoomRects(floor);
    const rectFor = (room: AutoDetectRoom): RoomRect => {
      const r = rects.get(room.id);
      if (r) return r;
      const side = Math.sqrt(Math.max(room.area, 1) * 1.5);
      return { minX: 0, minY: 0, width: side, length: Math.max(room.area, 1) / side };
    };

    for (const room of floor.rooms) {
      // ── Server rooms → racks + CRAC units + perforated tiles ──
      if (room.spaceType === 'server_room' && room.equipmentLoad > 0) {
        const totalKW = room.equipmentLoad / 1000;
        const density = classifyDensity(room.equipmentLoad / Math.max(room.area, 1));
        const preset = DENSITY_POWER_MAP[density];
        const rackCount = Math.max(1, Math.round(totalKW / preset.powerKW));

        const rect = rectFor(room);
        const maxX = rect.minX + rect.width - 0.5;
        const maxY = rect.minY + rect.length - 0.5;
        const racksPerRow = Math.max(1, Math.floor((rect.width - 1) / (RACK_W + 0.3)));
        const rowSpacing = 1.2; // hot-aisle/cold-aisle spacing

        for (let i = 0; i < rackCount; i++) {
          const row = Math.floor(i / racksPerRow);
          const col = i % racksPerRow;
          const x = rect.minX + 0.5 + col * (RACK_W + 0.3);
          const yDepth = rect.minY + 0.8 + row * (RACK_D + rowSpacing);

          racks.push({
            name: `Rack-${String(rackCounter++).padStart(2, '0')}`,
            position: { x: Math.min(x, maxX), y: Math.min(yDepth, maxY), z: 0 },
            width: RACK_W,
            depth: RACK_D,
            height: RACK_H,
            powerDensity: density,
            powerKW: preset.powerKW,
            airflowCFM: preset.airflowCFM,
            orientation: row % 2 === 0 ? 0 : 180, // alternating hot/cold aisle
            rackUnits: 42,
            filledUnits: preset.filledUnits,
          });
        }

        // CRAC units — one per ~30 kW cooling demand (N+1 redundancy)
        const cracCount = Math.max(2, Math.ceil(totalKW / 30) + 1);
        const cracCapacityKW = (totalKW * 1.15) / (cracCount - 1); // N+1
        const cracCapacityTR = cracCapacityKW / 3.517;

        for (let c = 0; c < cracCount; c++) {
          const isStandby = c === cracCount - 1;
          const x = c % 2 === 0 ? rect.minX + 0.45 : rect.minX + rect.width - 0.9;
          const yDepth = rect.minY + 0.5 + Math.floor(c / 2) * 3;
          hvacUnits.push({
            type: 'crac' as HVACUnitType,
            name: `CRAC-${String(hvacCounter++).padStart(2, '0')}${isStandby ? ' (Standby)' : ''}`,
            position: { x: Math.min(Math.max(x, rect.minX + 0.45), maxX), y: Math.min(yDepth, maxY), z: 0 },
            width: 0.9,
            depth: 0.9,
            height: 2.1,
            capacityKW: Math.round(cracCapacityKW * 10) / 10,
            capacityTR: Math.round(cracCapacityTR * 10) / 10,
            airflowCFM: Math.round(cracCapacityKW * 150),
            supplyTempC: 14,
            returnTempC: 28,
            orientation: 0,
            powerInputKW: Math.round(cracCapacityKW * 0.35 * 10) / 10,
            status: isStandby ? 'standby' : 'active',
          });
        }

        // Perforated tiles — cold-aisle grid, in GRID-CELL indices relative to
        // this room's rect (matches the CFD tile frame: cellIndex * res = m).
        const tileGridW = Math.floor(rect.width / TILE_SIZE);
        const tileGridD = Math.floor(rect.length / TILE_SIZE);
        const cellsPerTile = Math.max(1, Math.round(TILE_SIZE / input.gridResolution));
        const baseCellX = Math.round(rect.minX / input.gridResolution);
        const baseCellY = Math.round(rect.minY / input.gridResolution);

        for (let tx = 0; tx < tileGridW; tx++) {
          for (let tz = 0; tz < tileGridD; tz++) {
            const isColdAisle = tx % 3 === 1; // skip hot-aisle positions
            if (isColdAisle) {
              tiles.push({
                x: baseCellX + tx * cellsPerTile,
                y: baseCellY + tz * cellsPerTile,
                openArea: 0.25,
                tileSize: TILE_SIZE,
              });
            }
          }
        }

        summary.push(
          `Floor ${floor.floorNumber} "${room.name}": ${rackCount} rack(s) [${density}], ` +
          `${cracCount} CRAC unit(s), ${tiles.length} perforated tile(s)`,
        );
      }

      // ── Mechanical rooms → AHU units ──────────────────────
      if (room.spaceType === 'mechanical' && room.equipmentLoad > 0) {
        const loadKW = room.equipmentLoad / 1000;
        const ahuCount = Math.max(1, Math.ceil(loadKW / 50));
        const perAhuKW = loadKW / ahuCount;
        const rect = rectFor(room);
        const maxX = rect.minX + rect.width - 1;

        for (let a = 0; a < ahuCount; a++) {
          hvacUnits.push({
            type: 'ahu' as HVACUnitType,
            name: `AHU-${String(hvacCounter++).padStart(2, '0')}`,
            position: { x: Math.min(rect.minX + 1 + a * 2.5, maxX), y: rect.minY + rect.length / 2, z: 0 },
            width: 2.0,
            depth: 1.5,
            height: 2.2,
            capacityKW: Math.round(perAhuKW * 10) / 10,
            capacityTR: Math.round((perAhuKW / 3.517) * 10) / 10,
            airflowCFM: Math.round(perAhuKW * 200),
            supplyTempC: 13,
            returnTempC: 26,
            orientation: 0,
            powerInputKW: Math.round(perAhuKW * 0.3 * 10) / 10,
            status: 'active',
          });
        }

        summary.push(
          `Floor ${floor.floorNumber} "${room.name}": ${ahuCount} AHU(s) @ ${perAhuKW.toFixed(1)} kW each`,
        );
      }

      // ── High-load non-server rooms → in-row cooling ───────
      if (
        room.spaceType !== 'server_room' &&
        room.spaceType !== 'mechanical' &&
        room.equipmentLoad > 5000
      ) {
        const loadKW = room.equipmentLoad / 1000;
        const rect = rectFor(room);
        hvacUnits.push({
          type: 'vent_duct' as HVACUnitType,
          name: `VD-${String(hvacCounter++).padStart(2, '0')} (${room.name})`,
          position: { x: Math.min(rect.minX + 1, rect.minX + rect.width - 0.3), y: rect.minY + rect.length / 2, z: 0 },
          width: 0.6,
          depth: 0.6,
          height: 0.3,
          capacityKW: Math.round(loadKW * 10) / 10,
          capacityTR: Math.round((loadKW / 3.517) * 10) / 10,
          airflowCFM: Math.round(loadKW * 120),
          supplyTempC: 16,
          returnTempC: 24,
          orientation: 0,
          powerInputKW: Math.round(loadKW * 0.25 * 10) / 10,
          status: 'active',
        });
        summary.push(
          `Floor ${floor.floorNumber} "${room.name}": 1 vent-duct unit @ ${loadKW.toFixed(1)} kW`,
        );
      }
    }
  }

  if (summary.length === 0) {
    summary.push('No server rooms, mechanical rooms, or high-load spaces detected.');
  }

  return { racks, hvacUnits, tiles, summary };
}
