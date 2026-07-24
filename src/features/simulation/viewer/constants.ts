import type { HVACUnitType } from '@/types/simulation';

export const HVAC_TYPE_DEFAULTS: Record<HVACUnitType, {
  width: number;
  depth: number;
  height: number;
  capacityKW: number;
  airflowCFM: number;
  supplyTempC: number;
}> = {
  crac: { width: 1.2, depth: 1.0, height: 2.2, capacityKW: 30, airflowCFM: 5500, supplyTempC: 13 },
  crah: { width: 1.4, depth: 1.1, height: 2.3, capacityKW: 50, airflowCFM: 7000, supplyTempC: 13 },
  ahu: { width: 1.5, depth: 1.2, height: 2.4, capacityKW: 25, airflowCFM: 4500, supplyTempC: 15 },
  in_row: { width: 0.4, depth: 1.2, height: 2.0, capacityKW: 20, airflowCFM: 3000, supplyTempC: 15 },
  rear_door: { width: 0.6, depth: 0.3, height: 2.1, capacityKW: 8, airflowCFM: 900, supplyTempC: 17 },
  vent_duct: { width: 0.8, depth: 0.8, height: 0.8, capacityKW: 12, airflowCFM: 2000, supplyTempC: 16 },
};

export const HVAC_TYPES: HVACUnitType[] = ['crac', 'crah', 'ahu', 'in_row', 'rear_door', 'vent_duct'];

// HVAC placement constants (grid snap / clearances) now live with the layout
// normalizer in the shared lib layer. Re-exported here for any legacy importer.
export {
  HVAC_PLACEMENT_GRID_M,
  HVAC_MIN_WALL_CLEARANCE_M,
  HVAC_MIN_UNIT_GAP_M,
} from '@/lib/simulation/normalize-room-layout';
