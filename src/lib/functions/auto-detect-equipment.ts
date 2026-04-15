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
import type { Room, Floor } from '@/types/project';
import type {
  ServerRack,
  HVACUnit,
  PerforatedTile,
  RackDensity,
  HVACUnitType,
} from '@/types/simulation';

export interface AutoDetectInput {
  floors: (Floor & { rooms: Room[] })[];
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

  // Track cumulative offsets so each room's equipment occupies its own zone
  let offsetX = 0;
  const ROOM_GAP = 1.5; // gap between rooms in the layout

  for (const floor of input.floors) {
    for (const room of floor.rooms) {
      // ── Server rooms → racks + CRAC units + perforated tiles ──
      if (room.spaceType === 'server_room' && room.equipmentLoad > 0) {
        const totalKW = room.equipmentLoad / 1000;
        const density = classifyDensity(room.equipmentLoad / Math.max(room.area, 1));
        const preset = DENSITY_POWER_MAP[density];

        // Number of racks based on total load / per-rack power
        const rackCount = Math.max(1, Math.round(totalKW / preset.powerKW));

        // Lay racks in rows within the room footprint
        const roomWidthM = Math.sqrt(room.area * 1.5); // approximate width (assume 1.5:1 aspect)
        const roomDepthM = room.area / roomWidthM;
        const racksPerRow = Math.max(1, Math.floor((roomWidthM - 1) / (RACK_W + 0.3)));
        const rowSpacing = 1.2; // hot-aisle/cold-aisle spacing

        for (let i = 0; i < rackCount; i++) {
          const row = Math.floor(i / racksPerRow);
          const col = i % racksPerRow;
          const x = offsetX + 0.5 + col * (RACK_W + 0.3);
          const z = 0.8 + row * (RACK_D + rowSpacing);

          racks.push({
            name: `Rack-${String(rackCounter++).padStart(2, '0')}`,
            position: { x: Math.min(x, offsetX + roomWidthM - 0.5), y: 0, z: Math.min(z, roomDepthM - 0.5) },
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
          hvacUnits.push({
            type: 'crac' as HVACUnitType,
            name: `CRAC-${String(hvacCounter++).padStart(2, '0')}${isStandby ? ' (Standby)' : ''}`,
            position: {
              x: offsetX + (c % 2 === 0 ? 0.3 : roomWidthM - 1.2),
              y: 0,
              z: 0.5 + Math.floor(c / 2) * 3,
            },
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

        // Perforated tiles — grid coverage under server room area
        const tileGridW = Math.floor(roomWidthM / TILE_SIZE);
        const tileGridD = Math.floor(roomDepthM / TILE_SIZE);
        const cellsPerTile = Math.max(1, Math.round(TILE_SIZE / input.gridResolution));
        const tileOffsetCells = Math.round(offsetX / input.gridResolution);

        for (let tx = 0; tx < tileGridW; tx++) {
          for (let tz = 0; tz < tileGridD; tz++) {
            // Place tiles in cold aisles (every other row under racks)
            const isUnderRack = tx % 3 === 1; // skip hot-aisle positions
            if (!isUnderRack) {
              tiles.push({
                x: tileOffsetCells + tx * cellsPerTile,
                y: tz * cellsPerTile,
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

        offsetX += roomWidthM + ROOM_GAP;
      }

      // ── Mechanical rooms → AHU units ──────────────────────
      if (room.spaceType === 'mechanical' && room.equipmentLoad > 0) {
        const loadKW = room.equipmentLoad / 1000;
        const ahuCount = Math.max(1, Math.ceil(loadKW / 50));
        const perAhuKW = loadKW / ahuCount;
        const roomWidthM = Math.sqrt(room.area * 1.5);

        for (let a = 0; a < ahuCount; a++) {
          hvacUnits.push({
            type: 'ahu' as HVACUnitType,
            name: `AHU-${String(hvacCounter++).padStart(2, '0')}`,
            position: { x: offsetX + 1 + a * 2.5, y: 0, z: 1 },
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

        offsetX += roomWidthM + ROOM_GAP;
      }

      // ── High-load non-server rooms → in-row cooling ───────
      if (
        room.spaceType !== 'server_room' &&
        room.spaceType !== 'mechanical' &&
        room.equipmentLoad > 5000
      ) {
        const loadKW = room.equipmentLoad / 1000;
        hvacUnits.push({
          type: 'vent_duct' as HVACUnitType,
          name: `VD-${String(hvacCounter++).padStart(2, '0')} (${room.name})`,
          position: { x: offsetX + 1, y: 0, z: 1 },
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

        offsetX += 3 + ROOM_GAP;
      }
    }
  }

  if (summary.length === 0) {
    summary.push('No server rooms, mechanical rooms, or high-load spaces detected.');
  }

  return { racks, hvacUnits, tiles, summary };
}
