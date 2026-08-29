/**
 * Build the sizing inputs a bill of quantities is compiled from.
 *
 * Extracted from the BOQ route by REMEDIATION_PLAN.md TASK 3.2. The POST path
 * called this twice — once per floor group and once for the overall summary —
 * so every duct, pipe, cable and condensate run in the estimate came through
 * here, untested, inside a 469-line handler.
 */

import { estimateDiffusersFromDucts } from '@/lib/functions/cost-engine';
import { sizeRefrigerantPipe, sizeCondensatePipe } from '@/lib/functions/pipe-sizing';
import { sizeElectrical } from '@/lib/functions/electrical';
import { sizeDuct } from '@/lib/functions/duct-sizing';
import { btuPerHourToKilowatts } from '@/lib/engine/units';
import { CFM_PER_TR } from '@/lib/utils/constants';

/**
 * Estimated run lengths in metres, applied when a project has no measured
 * routing. They are assumptions, not measurements, and every one of them
 * multiplies into a material quantity and therefore into the price.
 */
const DEFAULT_REFRIGERANT_RUN_M = 10;
const DEFAULT_ELEVATION_DIFF_M = 3;
const DEFAULT_ELECTRICAL_RUN_M = 15;
const DEFAULT_CONDENSATE_RUN_M = 5;
const DEFAULT_DUCT_RUN_M = 8;

/** Above this capacity a unit is wired three-phase at 380 V rather than single-phase at 220 V. */
const THREE_PHASE_THRESHOLD_TR = 3;
const SINGLE_PHASE_VOLTAGE = 220;
const THREE_PHASE_VOLTAGE = 380;
const ASSUMED_POWER_FACTOR = 0.9;
const ASSUMED_AMBIENT_C = 35;
/** Fallback EER when a catalogue record carries none. Guards the division below. */
const FALLBACK_EER = 10;

/** Equipment that carries sheet-metal ductwork, as against ductless splits and cassettes. */
const DUCTED_EQUIPMENT_TYPES = new Set([
  'ducted_split',
  'ducted',
  'ahu',
  'fcu',
  'concealed',
]);

export function requiresDuctwork(type: string): boolean {
  return DUCTED_EQUIPMENT_TYPES.has(type) || type.toLowerCase().includes('duct');
}

/** One selected unit and how many of it a floor carries. */
export interface SelectedEquipment {
  equipment: {
    manufacturer: string;
    model: string;
    type: string;
    capacityTR: number;
    capacityBTU: number;
    capacityKW: number;
    refrigerant: string;
    eer: number;
    unitPricePHP: number;
  };
  quantity: number;
  floorName: string;
}

/** The catalogue price is banded ±10 % so the estimate carries a range, not a point. */
const PRICE_BAND = 0.1;

export function buildBoqInputs(selections: readonly SelectedEquipment[]) {
  const ducts = selections
    .filter((s) => requiresDuctwork(s.equipment.type))
    .map((s) => ({
      // Math.max(1, …) keeps sizeDuct off a zero area. A catalogue record with
      // capacityTR 0 would otherwise ask for a duct carrying no air.
      result: sizeDuct({ cfm: Math.max(1, s.equipment.capacityTR * CFM_PER_TR * s.quantity) }),
      runLengthM: DEFAULT_DUCT_RUN_M * s.quantity,
    }));

  // Controls (BOQ Section G, plan §7): one thermostat per cooled unit, a CO₂
  // sensor per selection for demand-controlled ventilation, and ~3 BMS points
  // per unit (supply temp, return temp, status).
  const totalUnits = selections.reduce((sum, s) => sum + s.quantity, 0);

  return {
    diffusers: estimateDiffusersFromDucts(ducts),
    controls: {
      zones: totalUnits,
      co2Sensors: selections.length,
      bmsPoints: totalUnits * 3,
    },
    ducts,
    equipment: selections.map((s) => ({
      brand: s.equipment.manufacturer,
      model: s.equipment.model,
      type: s.equipment.type,
      quantity: s.quantity,
      unitPriceMin: s.equipment.unitPricePHP * (1 - PRICE_BAND),
      unitPriceMax: s.equipment.unitPricePHP * (1 + PRICE_BAND),
      capacityTR: s.equipment.capacityTR,
    })),
    refrigerantPipes: selections.map((s) => ({
      result: sizeRefrigerantPipe({
        capacityBTU: s.equipment.capacityBTU,
        refrigerantType: (s.equipment.refrigerant as 'R410A' | 'R32' | 'R22' | 'R134a') || 'R32',
        lineLength: DEFAULT_REFRIGERANT_RUN_M,
        elevationDiff: DEFAULT_ELEVATION_DIFF_M,
      }),
      runLengthM: DEFAULT_REFRIGERANT_RUN_M,
    })),
    electrical: selections.map((s) => {
      // Electrical input power = cooling capacity / EER, both in the same unit.
      // The route multiplied by a bare 0.000293 here; that is the Btu/h to kW
      // conversion and it now comes from units.ts, which carries it to full
      // precision (1/3.412142) with its derivation stated.
      const isThreePhase = s.equipment.capacityTR > THREE_PHASE_THRESHOLD_TR;
      const equipmentPowerKW =
        btuPerHourToKilowatts(s.equipment.capacityBTU) / (s.equipment.eer || FALLBACK_EER);

      return sizeElectrical({
        equipmentPowerKW,
        voltage: isThreePhase ? THREE_PHASE_VOLTAGE : SINGLE_PHASE_VOLTAGE,
        phase: isThreePhase ? 3 : 1,
        powerFactor: ASSUMED_POWER_FACTOR,
        runLength: DEFAULT_ELECTRICAL_RUN_M,
        ambientTemp: ASSUMED_AMBIENT_C,
        conduitType: 'PVC',
      });
    }),
    condensate: selections.map((s) => ({
      result: sizeCondensatePipe(s.equipment.capacityTR),
      runLengthM: DEFAULT_CONDENSATE_RUN_M,
    })),
  };
}

/** Group selections by the floor they sit on, preserving insertion order. */
export function groupByFloor(
  selections: readonly SelectedEquipment[],
): Map<string, SelectedEquipment[]> {
  const groups = new Map<string, SelectedEquipment[]>();
  for (const selection of selections) {
    const existing = groups.get(selection.floorName);
    if (existing) existing.push(selection);
    else groups.set(selection.floorName, [selection]);
  }
  return groups;
}
