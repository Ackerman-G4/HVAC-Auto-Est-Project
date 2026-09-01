/**
 * Turning selected equipment into the inputs the cost engine compiles.
 *
 * Extracted from the BOQ route (TASK 3.2). Deciding that a ducted unit needs
 * sheet metal, that each unit gets a thermostat and three BMS points, and how
 * long a refrigerant run is assumed to be, are estimating rules — not HTTP
 * concerns (CLAUDE.md rule 7).
 */

import { estimateDiffusersFromDucts } from '@/lib/functions/cost-engine';
import { sizeRefrigerantPipe, sizeCondensatePipe } from '@/lib/functions/pipe-sizing';
import { sizeElectrical } from '@/lib/functions/electrical';
import { sizeDuct } from '@/lib/functions/duct-sizing';
import { btuPerHourToKilowatts } from '@/lib/engine/units';
import { safeDivide } from '@/lib/engine/numeric-guards';
import { CFM_PER_TR } from '@/lib/utils/constants';

/**
 * Assumed run lengths, in metres, where the drawing does not give one.
 *
 * These are estimating allowances, not measurements. They are named and
 * grouped so a reviewer can see every assumption that inflates a material
 * quantity in one place.
 */
export const DEFAULT_REFRIGERANT_RUN_M = 10;
export const DEFAULT_ELEVATION_DIFF_M = 3;
export const DEFAULT_ELECTRICAL_RUN_M = 15;
export const DEFAULT_CONDENSATE_RUN_M = 5;
export const DEFAULT_DUCT_RUN_M = 8;

/** Design ambient for cable derating, °C. */
const CABLE_AMBIENT_TEMP_C = 35;

/** Assumed power factor for the connected load. */
const ASSUMED_POWER_FACTOR = 0.9;

/** Above this capacity a unit is taken to be three-phase at 380 V. */
const THREE_PHASE_THRESHOLD_TR = 3;

/** Supplier price spread applied around the catalogue figure. */
const PRICE_SPREAD = 0.1;

/** BMS points per unit: supply temperature, return temperature, status. */
const BMS_POINTS_PER_UNIT = 3;

/** Equipment types that carry sheet-metal ductwork, unlike splits and cassettes. */
const DUCTED_EQUIPMENT_TYPES = new Set(['ducted_split', 'ducted', 'ahu', 'fcu', 'concealed']);

export function requiresDuctwork(type: string): boolean {
  return DUCTED_EQUIPMENT_TYPES.has(type) || type.toLowerCase().includes('duct');
}

/** One equipment selection, as the BOQ builder needs it. */
export interface SelectedEquipmentInput {
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

/**
 * Electrical input power, kW, from cooling capacity and EER.
 *
 * EER is energy efficiency ratio in Btu/h per watt, so input power is
 * capacity divided by EER. Both operands come from a stored catalogue record
 * rather than being written here, so the denominator is external and guarded
 * (CLAUDE.md rule 6).
 *
 * The route wrote `capacityBTU * 0.000293 / (eer || 10)`. Two defects: the
 * inline factor is an unnamed Btu/h-to-kW conversion, which rule 5 forbids and
 * which drifts 0.024% from the exact value; and `|| 10` silently substitutes a
 * plausible efficiency for a missing one, so a catalogue record with `eer: 0`
 * produced a wrong input power, a wrong breaker and a wrong cable size with
 * nothing reported.
 */
export function electricalInputPowerKw(capacityBtuPerHour: number, eerBtuPerWatt: number): number {
  return safeDivide(
    btuPerHourToKilowatts(capacityBtuPerHour),
    eerBtuPerWatt,
    'boqInputs.electricalInputPower',
    { requirePositive: true, code: 'INVALID_EQUIPMENT_EER' },
  );
}

/**
 * Build every sizing input the cost engine needs from a set of selections.
 *
 * Ductwork is sized on the aggregate airflow for a selection, so a floor with
 * four identical units gets one duct sized for four units rather than four
 * ducts — matching how a riser is actually run.
 */
export function buildBoqInputs(selections: SelectedEquipmentInput[]) {
  const ducts = selections
    .filter((selection) => requiresDuctwork(selection.equipment.type))
    .map((selection) => ({
      result: sizeDuct({
        cfm: Math.max(1, selection.equipment.capacityTR * CFM_PER_TR * selection.quantity),
      }),
      runLengthM: DEFAULT_DUCT_RUN_M * selection.quantity,
    }));

  // Controls (BOQ Section G, plan §7): one thermostat per cooled unit, a CO2
  // sensor per selection for demand-controlled ventilation, and three BMS
  // points per unit.
  const totalUnits = selections.reduce((sum, selection) => sum + selection.quantity, 0);

  return {
    diffusers: estimateDiffusersFromDucts(ducts),
    controls: {
      zones: totalUnits,
      co2Sensors: selections.length,
      bmsPoints: totalUnits * BMS_POINTS_PER_UNIT,
    },
    ducts,
    equipment: selections.map((selection) => ({
      brand: selection.equipment.manufacturer,
      model: selection.equipment.model,
      type: selection.equipment.type,
      quantity: selection.quantity,
      unitPriceMin: selection.equipment.unitPricePHP * (1 - PRICE_SPREAD),
      unitPriceMax: selection.equipment.unitPricePHP * (1 + PRICE_SPREAD),
      capacityTR: selection.equipment.capacityTR,
    })),
    refrigerantPipes: selections.map((selection) => ({
      result: sizeRefrigerantPipe({
        capacityBTU: selection.equipment.capacityBTU,
        refrigerantType:
          (selection.equipment.refrigerant as 'R410A' | 'R32' | 'R22' | 'R134a') || 'R32',
        lineLength: DEFAULT_REFRIGERANT_RUN_M,
        elevationDiff: DEFAULT_ELEVATION_DIFF_M,
      }),
      runLengthM: DEFAULT_REFRIGERANT_RUN_M,
    })),
    electrical: selections.map((selection) => {
      const isThreePhase = selection.equipment.capacityTR > THREE_PHASE_THRESHOLD_TR;
      return sizeElectrical({
        equipmentPowerKW: electricalInputPowerKw(
          selection.equipment.capacityBTU,
          selection.equipment.eer,
        ),
        voltage: isThreePhase ? 380 : 220,
        phase: isThreePhase ? 3 : 1,
        powerFactor: ASSUMED_POWER_FACTOR,
        runLength: DEFAULT_ELECTRICAL_RUN_M,
        ambientTemp: CABLE_AMBIENT_TEMP_C,
        conduitType: 'PVC',
      });
    }),
    condensate: selections.map((selection) => ({
      result: sizeCondensatePipe(selection.equipment.capacityTR),
      runLengthM: DEFAULT_CONDENSATE_RUN_M,
    })),
  };
}

/** Group selections by the floor they sit on, preserving encounter order. */
export function groupByFloor(
  selections: SelectedEquipmentInput[],
): Map<string, SelectedEquipmentInput[]> {
  const groups = new Map<string, SelectedEquipmentInput[]>();
  for (const selection of selections) {
    const existing = groups.get(selection.floorName);
    if (existing) {
      existing.push(selection);
    } else {
      groups.set(selection.floorName, [selection]);
    }
  }
  return groups;
}
