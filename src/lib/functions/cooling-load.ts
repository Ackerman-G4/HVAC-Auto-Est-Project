/**
 * HVAC Cooling Load Calculation Engine
 * Philippine Standard Rule‑of‑Thumb: TR = Area (m²) ÷ factor
 * Component breakdown via ASHRAE CLTD/CLF kept for reference
 */

import type { CoolingLoadInput, CoolingLoadResult } from '@/types/calculation';
import {
  WALL_U_VALUES,
  GLASS_U_VALUES,
  GLASS_SC_VALUES,
  SHGF_BY_ORIENTATION,
  CLTD_WALL,
  CLTD_ROOF,
  CLTD_GLASS,
  HEAT_GAIN_PER_PERSON,
  FRESH_AIR_REQUIREMENTS,
  CLF_LIGHTING,
  CLF_EQUIPMENT,
  ROOF_U_VALUES,
} from '@/constants/ashrae-tables';
import { celsiusToFahrenheit, cfmToLPS, lpsToCSFM } from '@/lib/utils/unit-conversion';
import { deltaHumidityRatio } from '@/lib/functions/psychrometric';

// ─────────────────────────────────────────────────────────────
// Philippine HVAC Rule of Thumb — m² per TR by space type
// Industry standard: 1 HP ≈ 1 TR per ~15 m² for typical office
// Adjusted per space type based on heat load density.
//
//   75 m² office  → 75 / 15 = 5.00 TR
//   60 m² conf    → 60 / 12 = 5.00 TR
//   40 m² server  → 40 /  8 = 5.00 TR
//   90 m² resi    → 90 / 18 = 5.00 TR
// ─────────────────────────────────────────────────────────────
export const SQM_PER_TR: Record<string, number> = {
  office: 15,           // standard commercial office
  conference: 12,       // high occupancy density
  lobby: 18,            // large open area, low density
  retail: 12,           // high foot traffic + lighting
  restaurant: 10,       // cooking + high occupancy
  kitchen: 8,           // heavy heat loads from cooking equip
  hotel_room: 18,       // low occupancy, residential comfort
  server_room: 8,       // 24/7 high-density heat load
  corridor: 25,         // pass-through, minimal load
  restroom: 25,         // minimal conditioning
  storage: 30,          // rarely occupied
  residential: 18,      // standard residential
  classroom: 12,        // high occupancy (students)
  hospital_ward: 12,    // medical equipment + occupants
  operating_room: 8,    // strict temp control + equipment
  gym: 10,              // high activity + body heat
  theater: 10,          // high occupancy, low activity
  warehouse: 35,        // large area, low density
  parking: 40,          // ventilation only usually
};

// ─────────────────────────────────────────────────────────────
// Carrier HAP — Sensible Heat Equation: Q = ṁ × Cp × ΔT
// Q  = Heat transfer rate (kW or W)
// ṁ  = Mass flow rate (kg/s)
// Cp = Specific heat (kJ/kg·K)  → Air: 1.006, Water: 4.186
// ΔT = Temperature difference (K or °C)
// ─────────────────────────────────────────────────────────────

export interface CarrierHAPInput {
  /** Mass flow rate in kg/s */
  massFlowRate: number;
  /** Specific heat capacity in kJ/(kg·K) — default 1.006 for air */
  specificHeat?: number;
  /** Temperature difference in °C (or K) */
  deltaT: number;
  /** Medium: 'air' (Cp=1.006) or 'water' (Cp=4.186) */
  medium?: 'air' | 'water';
}

export interface CarrierHAPResult {
  /** Heat transfer rate in kW */
  heatTransferKW: number;
  /** Heat transfer rate in Watts */
  heatTransferW: number;
  /** Heat transfer rate in BTU/h */
  heatTransferBTU: number;
  /** Required cooling capacity in TR */
  requiredTR: number;
  /** Required cooling capacity in kW */
  requiredKW: number;
  /** Inputs used */
  massFlowRate: number;
  specificHeat: number;
  deltaT: number;
  medium: string;
  formula: string;
}

/**
 * Carrier HAP Cooling Load Calculation
 * Q = ṁ × Cp × ΔT
 *
 * For air systems:
 *   ṁ (kg/s) = airflow (m³/s) × density (≈1.2 kg/m³)
 *   Cp = 1.006 kJ/(kg·K) for dry air
 *
 * For chilled water systems:
 *   ṁ (kg/s) = flow (L/s) × 1.0 (density ~1 kg/L)
 *   Cp = 4.186 kJ/(kg·K) for water
 */
export function calculateCarrierHAP(input: CarrierHAPInput): CarrierHAPResult {
  const medium = input.medium || 'air';
  const Cp = input.specificHeat ?? (medium === 'water' ? 4.186 : 1.006);
  const Q_kW = input.massFlowRate * Cp * input.deltaT; // kW
  const Q_W = Q_kW * 1000;
  const Q_BTU = Q_W * 3.412;
  const TR = Q_kW / 3.517;

  return {
    heatTransferKW: Math.round(Q_kW * 1000) / 1000,
    heatTransferW: Math.round(Q_W),
    heatTransferBTU: Math.round(Q_BTU),
    requiredTR: Math.round(TR * 100) / 100,
    requiredKW: Math.round(Q_kW * 100) / 100,
    massFlowRate: input.massFlowRate,
    specificHeat: Cp,
    deltaT: input.deltaT,
    medium,
    formula: `Q = ${input.massFlowRate} × ${Cp} × ${input.deltaT} = ${Q_kW.toFixed(3)} kW`,
  };
}

/**
 * Carrier HAP — Air-side calculation from airflow volume
 * Converts CFM or L/s to mass flow rate, then applies Q = ṁ × Cp × ΔT
 */
export function calculateCarrierHAPAirSide(input: {
  airflowCFM?: number;
  airflowLPS?: number;
  supplyTempC: number;
  returnTempC: number;
  airDensity?: number; // kg/m³, default 1.2
}): CarrierHAPResult {
  const density = input.airDensity ?? 1.2;
  let volumeLPS: number;

  if (input.airflowLPS) {
    volumeLPS = input.airflowLPS;
  } else if (input.airflowCFM) {
    volumeLPS = cfmToLPS(input.airflowCFM);
  } else {
    volumeLPS = 0;
  }

  // L/s → m³/s → kg/s
  const volumeM3S = volumeLPS / 1000;
  const massFlowRate = volumeM3S * density;
  const deltaT = Math.abs(input.returnTempC - input.supplyTempC);

  return calculateCarrierHAP({
    massFlowRate,
    deltaT,
    medium: 'air',
  });
}

/**
 * Carrier HAP — Water-side calculation from flow rate
 * For chilled water coils: Q = ṁ × Cp × ΔT
 */
export function calculateCarrierHAPWaterSide(input: {
  flowRateLPS?: number;
  flowRateGPM?: number;
  enteringTempC: number;
  leavingTempC: number;
  waterDensity?: number; // kg/L, default 1.0
}): CarrierHAPResult {
  const density = input.waterDensity ?? 1.0;
  let flowLPS: number;

  if (input.flowRateLPS) {
    flowLPS = input.flowRateLPS;
  } else if (input.flowRateGPM) {
    flowLPS = input.flowRateGPM * 0.0631;
  } else {
    flowLPS = 0;
  }

  // L/s × density(kg/L) → kg/s
  const massFlowRate = flowLPS * density;
  const deltaT = Math.abs(input.enteringTempC - input.leavingTempC);

  return calculateCarrierHAP({
    massFlowRate,
    deltaT,
    medium: 'water',
  });
}

/**
 * CLTD correction factor for latitude and month
 * For Philippine conditions (14°N), the correction is minimal
 */
function correctCLTD(cltd: number, outdoorDB: number, indoorDB: number): number {
  // CLTD_corrected = CLTD + (25.5 - indoor) + (outdoor_mean - 29.4)
  // outdoor_mean = outdoor_design - (daily_range / 2)
  const dailyRange = 8; // typical for Philippines
  const outdoorMean = outdoorDB - dailyRange / 2;
  return cltd + (25.5 - indoorDB) + (outdoorMean - 29.4);
}

/**
 * Calculate wall conduction heat gain
 */
function calculateWallLoad(input: CoolingLoadInput): number {
  const uValue = WALL_U_VALUES[input.wallConstruction] || 3.42;
  const orientation = input.windowOrientation || 'N';
  const cltd = CLTD_WALL[orientation] || 10;
  const correctedCLTD = correctCLTD(cltd, input.outdoorDB, input.indoorDB);
  
  // Wall area = perimeter × ceiling height - window area
  const wallArea = input.wallArea || (input.roomPerimeter * input.ceilingHeight - input.windowArea);
  
  return uValue * wallArea * correctedCLTD;
}

/**
 * Calculate roof conduction heat gain (if top floor)
 */
function calculateRoofLoad(input: CoolingLoadInput): number {
  if (!input.roofArea || input.roofArea <= 0) return 0;
  
  const uValue = ROOF_U_VALUES['concrete_slab_150mm'];
  const correctedCLTD = correctCLTD(CLTD_ROOF, input.outdoorDB, input.indoorDB);
  
  return uValue * input.roofArea * correctedCLTD;
}

/**
 * Calculate glass solar heat gain
 */
function calculateGlassSolarLoad(input: CoolingLoadInput): number {
  if (!input.windowArea || input.windowArea <= 0) return 0;
  
  const sc = GLASS_SC_VALUES[input.windowType] || 0.95;
  const shgf = SHGF_BY_ORIENTATION[input.windowOrientation] || 300;
  
  return input.windowArea * sc * shgf;
}

/**
 * Calculate glass conduction heat gain
 */
function calculateGlassConductionLoad(input: CoolingLoadInput): number {
  if (!input.windowArea || input.windowArea <= 0) return 0;
  
  const uValue = GLASS_U_VALUES[input.windowType] || 5.80;
  const correctedCLTD = correctCLTD(CLTD_GLASS, input.outdoorDB, input.indoorDB);
  
  return uValue * input.windowArea * correctedCLTD;
}

/**
 * Calculate lighting heat gain
 */
function calculateLightingLoad(input: CoolingLoadInput): number {
  return input.lightingDensity * input.roomArea * CLF_LIGHTING;
}

/**
 * Calculate people heat gain (sensible and latent)
 */
function calculatePeopleLoad(input: CoolingLoadInput): { sensible: number; latent: number } {
  const heatGain = HEAT_GAIN_PER_PERSON[input.spaceType] || HEAT_GAIN_PER_PERSON['office'];
  const count = input.occupantCount;
  
  return {
    sensible: count * heatGain.sensible,
    latent: count * heatGain.latent,
  };
}

/**
 * Calculate equipment heat gain.
 * equipmentLoad is already total watts for the room (not a density).
 */
function calculateEquipmentLoad(input: CoolingLoadInput): number {
  return input.equipmentLoad * CLF_EQUIPMENT;
}

/**
 * Shared airflow‑based sensible + latent load calculation.
 * Used by both ventilation and infiltration load calcs.
 */
function airflowLoad(
  airflowCFM: number,
  outdoorDB: number,
  outdoorRH: number,
  indoorDB: number,
  indoorRH: number,
): { sensible: number; latent: number } {
  const deltaT = celsiusToFahrenheit(outdoorDB) - celsiusToFahrenheit(indoorDB);
  const deltaW = deltaHumidityRatio(outdoorDB, outdoorRH, indoorDB, indoorRH);

  // Sensible: Q = 1.08 × CFM × ΔT (BTU/h) → Watts
  const sensible = 1.08 * airflowCFM * deltaT * 0.293;

  // Latent: Q = 0.68 × CFM × ΔW × 7000 (BTU/h) → Watts
  const latent = 0.68 * airflowCFM * deltaW * 7000 * 0.293;

  return { sensible: Math.max(0, sensible), latent: Math.max(0, latent) };
}

/**
 * Calculate ventilation loads
 */
function calculateVentilationLoad(input: CoolingLoadInput): { sensible: number; latent: number } {
  const freshAirReq = FRESH_AIR_REQUIREMENTS[input.spaceType] || FRESH_AIR_REQUIREMENTS['office'];
  const freshAirLPS = freshAirReq.perPerson * input.occupantCount + freshAirReq.perArea * input.roomArea;
  const freshAirCFM = lpsToCSFM(freshAirLPS);
  const outdoorRH = input.outdoorRH ?? 65;
  return airflowLoad(freshAirCFM, input.outdoorDB, outdoorRH, input.indoorDB, input.indoorRH);
}

/**
 * Calculate infiltration loads
 */
function calculateInfiltrationLoad(input: CoolingLoadInput): { sensible: number; latent: number } {
  const ach = 0.5; // Air Changes per Hour for typical construction
  const volume = input.roomArea * input.ceilingHeight;
  const infiltrationLPS = (ach * volume) / 3600 * 1000;
  const infiltrationCFM = lpsToCSFM(infiltrationLPS);
  const outdoorRH = input.outdoorRH ?? 65;
  return airflowLoad(infiltrationCFM, input.outdoorDB, outdoorRH, input.indoorDB, input.indoorRH);
}

/**
 * Main cooling load calculation function
 *
 * Primary sizing uses the Philippine HVAC rule of thumb:
 *   TR = Area (m²) ÷ SQM_PER_TR[spaceType]
 *   e.g. 75 m² office → 75 / 15 = 5 TR
 *
 * Component‑level loads (wall, glass, lighting, etc.) are still
 * calculated via ASHRAE CLTD/CLF for the detailed breakdown.
 */
export function calculateCoolingLoad(input: CoolingLoadInput, roomId: string, roomName: string): CoolingLoadResult {
  // ── Primary TR estimation — area ÷ factor ──────────────────
  const sqmPerTR = SQM_PER_TR[input.spaceType] || 15;
  const trValue = Math.round((input.roomArea / sqmPerTR) * 100) / 100;
  const totalLoad = Math.round(trValue * 3517);       // Watts
  const btuPerHour = Math.round(trValue * 12000);      // BTU/h

  // ── Component breakdown (reference) ────────────────────────
  const wallLoad = calculateWallLoad(input);
  const roofLoad = calculateRoofLoad(input);
  const glassSolarLoad = calculateGlassSolarLoad(input);
  const glassConductionLoad = calculateGlassConductionLoad(input);
  const lightingLoad = calculateLightingLoad(input);
  const peopleLoad = calculatePeopleLoad(input);
  const equipmentLoadSensible = calculateEquipmentLoad(input);
  const ventilationLoad = calculateVentilationLoad(input);
  const infiltrationLoad = calculateInfiltrationLoad(input);

  const totalSensibleLoad = (
    wallLoad + roofLoad + glassSolarLoad + glassConductionLoad +
    lightingLoad + peopleLoad.sensible + equipmentLoadSensible +
    ventilationLoad.sensible + infiltrationLoad.sensible
  );
  const totalLatentLoad = (
    peopleLoad.latent + ventilationLoad.latent + infiltrationLoad.latent
  );

  // ── Airflow calculations ───────────────────────────────────
  const deltaT_supply = 20; // °F supply‑air ΔT
  const cfmSupply = (totalSensibleLoad * 3.412) / (1.08 * deltaT_supply);
  const freshAirReq = FRESH_AIR_REQUIREMENTS[input.spaceType] || FRESH_AIR_REQUIREMENTS['office'];
  const freshAirLPS = freshAirReq.perPerson * input.occupantCount + freshAirReq.perArea * input.roomArea;
  const cfmFreshAir = lpsToCSFM(freshAirLPS);
  const cfmReturn = cfmSupply * 0.9;
  const cfmExhaust = cfmSupply * 0.1;

  return {
    roomId,
    roomName,
    wallLoad: Math.round(wallLoad),
    roofLoad: Math.round(roofLoad),
    glassSolarLoad: Math.round(glassSolarLoad),
    glassConductionLoad: Math.round(glassConductionLoad),
    lightingLoad: Math.round(lightingLoad),
    peopleLoadSensible: Math.round(peopleLoad.sensible),
    peopleLoadLatent: Math.round(peopleLoad.latent),
    equipmentLoadSensible: Math.round(equipmentLoadSensible),
    infiltrationLoadSensible: Math.round(infiltrationLoad.sensible),
    infiltrationLoadLatent: Math.round(infiltrationLoad.latent),
    ventilationLoadSensible: Math.round(ventilationLoad.sensible),
    ventilationLoadLatent: Math.round(ventilationLoad.latent),
    totalSensibleLoad: Math.round(totalSensibleLoad),
    totalLatentLoad: Math.round(totalLatentLoad),
    totalLoad,
    trValue,
    btuPerHour,
    cfmSupply: Math.round(cfmSupply),
    cfmFreshAir: Math.round(cfmFreshAir),
    cfmReturn: Math.round(cfmReturn),
    cfmExhaust: Math.round(cfmExhaust),
    safetyFactor: input.safetyFactor,
    diversityFactor: input.diversityFactor,
    calculationMethod: 'AREA_RULE_OF_THUMB',
    timestamp: new Date().toISOString(),
  };
}
