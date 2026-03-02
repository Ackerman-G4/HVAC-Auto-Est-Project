/**
 * Psychrometric Chart Calculations
 * ─────────────────────────────────────────────────────────────
 * Based on Carrier Psychrometric Chart (ASHRAE Standard 2021)
 * Reference: https://www.handsdownsoftware.com/CARRIER-Chart.PDF
 *
 * Given any two properties (typically Dry-Bulb & RH), derives all
 * remaining psychrometric state-point values:
 *   • Wet-Bulb Temperature (°C)
 *   • Dew-Point Temperature (°C)
 *   • Humidity Ratio W (kg/kg or gr/lb)
 *   • Enthalpy h (kJ/kg)
 *   • Specific Volume v (m³/kg)
 *   • Partial Pressure of Water Vapor (Pa)
 *
 * Pressure convention: standard atmospheric = 101,325 Pa (sea level)
 * ─────────────────────────────────────────────────────────────
 */

// ─── Constants ────────────────────────────────────────
const P_ATM = 101325; // Standard atmospheric pressure (Pa)
const R_DA = 287.055; // Specific gas constant for dry air (J/kg·K)

// ─── Core Functions ───────────────────────────────────

/**
 * Saturation vapor pressure using the Magnus-Tetens formula (ASHRAE)
 * Valid for 0–60 °C range (tropical HVAC relevant)
 * @param tdb Dry-bulb temperature in °C
 * @returns Saturation pressure in Pa
 */
export function saturationPressure(tdb: number): number {
  // Magnus-Tetens coefficients (WMO/ASHRAE)
  const a = 17.27;
  const b = 237.3;
  return 610.78 * Math.exp((a * tdb) / (tdb + b));
}

/**
 * Humidity Ratio from dry-bulb temperature and relative humidity
 * W = 0.62198 × Pw / (Patm − Pw)
 * @param tdb Dry-bulb temperature °C
 * @param rh  Relative humidity (0–100)
 * @param patm Atmospheric pressure in Pa (default: 101325)
 * @returns Humidity ratio in kg_water / kg_dry_air
 */
export function humidityRatio(tdb: number, rh: number, patm = P_ATM): number {
  const pws = saturationPressure(tdb);
  const pw = (rh / 100) * pws;
  if (pw >= patm) return 0.03; // cap at extreme
  return 0.62198 * pw / (patm - pw);
}

/**
 * Partial pressure of water vapor
 * @returns Pressure in Pa
 */
export function vaporPressure(tdb: number, rh: number): number {
  return (rh / 100) * saturationPressure(tdb);
}

/**
 * Dew-Point Temperature from dry-bulb and RH
 * Inverse Magnus formula: Tdp = b × α / (a − α)
 * where α = ln(RH/100) + (a × Tdb)/(b + Tdb)
 * @returns Dew point in °C
 */
export function dewPoint(tdb: number, rh: number): number {
  const a = 17.27;
  const b = 237.3;
  const alpha = Math.log(rh / 100) + (a * tdb) / (b + tdb);
  return (b * alpha) / (a - alpha);
}

/**
 * Wet-Bulb Temperature (iterative psychrometric relationship)
 * Uses the psychrometric equation:
 *   W = ((2501 - 2.326·Twb) × Wsat(Twb) - 1.006·(Tdb - Twb))
 *       / (2501 + 1.86·Tdb - 4.186·Twb)
 * Solved by bisection.
 * @returns Wet-bulb temperature in °C
 */
export function wetBulb(tdb: number, rh: number, patm = P_ATM): number {
  const w = humidityRatio(tdb, rh, patm);

  // Bisection between dewpoint and drybulb
  let lo = dewPoint(tdb, rh) - 1;
  let hi = tdb;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const wSatMid = humidityRatio(mid, 100, patm);
    // Psychrometric (adiabatic saturation) equation
    const wCalc =
      ((2501 - 2.326 * mid) * wSatMid - 1.006 * (tdb - mid)) /
      (2501 + 1.86 * tdb - 4.186 * mid);
    if (wCalc > w) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (Math.abs(hi - lo) < 0.001) break;
  }
  return (lo + hi) / 2;
}

/**
 * Moist-Air Enthalpy
 * h = 1.006·Tdb + W × (2501 + 1.86·Tdb)  [kJ/kg dry air]
 */
export function enthalpy(tdb: number, rh: number, patm = P_ATM): number {
  const w = humidityRatio(tdb, rh, patm);
  return 1.006 * tdb + w * (2501 + 1.86 * tdb);
}

/**
 * Specific Volume of moist air
 * v = Ra × TK / (Patm − Pw)  [m³/kg dry air]
 */
export function specificVolume(tdb: number, rh: number, patm = P_ATM): number {
  const pw = vaporPressure(tdb, rh);
  const TK = tdb + 273.15;
  return R_DA * TK / (patm - pw);
}

/**
 * Air Density from psychrometric state
 * ρ = (1 + W) / v  [kg moist air / m³]
 */
export function airDensity(tdb: number, rh: number, patm = P_ATM): number {
  const w = humidityRatio(tdb, rh, patm);
  const v = specificVolume(tdb, rh, patm);
  return (1 + w) / v;
}

// ─── Full State Point ─────────────────────────────────

export interface PsychrometricState {
  /** Dry-bulb temperature °C */
  dryBulb: number;
  /** Relative humidity % */
  relativeHumidity: number;
  /** Wet-bulb temperature °C */
  wetBulb: number;
  /** Dew-point temperature °C */
  dewPoint: number;
  /** Humidity ratio kg/kg */
  humidityRatio: number;
  /** Humidity ratio grains/lb (imperial) */
  humidityRatioGrains: number;
  /** Enthalpy kJ/kg dry air */
  enthalpy: number;
  /** Enthalpy BTU/lb */
  enthalpyBTU: number;
  /** Specific volume m³/kg */
  specificVolume: number;
  /** Air density kg/m³ */
  density: number;
  /** Vapor pressure Pa */
  vaporPressure: number;
  /** Saturation pressure Pa */
  saturationPressure: number;
}

/**
 * Compute full psychrometric state from Dry-Bulb and RH
 * Carrier chart — single entry point
 */
export function psychrometricState(tdb: number, rh: number, patm = P_ATM): PsychrometricState {
  const pws = saturationPressure(tdb);
  const pw = (rh / 100) * pws;
  const w = humidityRatio(tdb, rh, patm);
  const wb = wetBulb(tdb, rh, patm);
  const dp = dewPoint(tdb, rh);
  const h = enthalpy(tdb, rh, patm);
  const v = specificVolume(tdb, rh, patm);
  const rho = airDensity(tdb, rh, patm);

  return {
    dryBulb: round(tdb, 2),
    relativeHumidity: round(rh, 1),
    wetBulb: round(wb, 2),
    dewPoint: round(dp, 2),
    humidityRatio: round(w, 6),
    humidityRatioGrains: round(w * 7000, 1), // 1 lb = 7000 grains
    enthalpy: round(h, 2),
    enthalpyBTU: round(h * 0.4299, 2), // kJ/kg → BTU/lb
    specificVolume: round(v, 4),
    density: round(rho, 4),
    vaporPressure: round(pw, 1),
    saturationPressure: round(pws, 1),
  };
}

// ─── Delta Calculations for Load Calcs ────────────────

/**
 * Compute the humidity-ratio difference between outdoor & indoor air.
 * This replaces the hardcoded ΔW = 0.020 − 0.009 in ventilation calcs.
 *
 * @param outdoorDB Outdoor dry-bulb °C
 * @param outdoorRH Outdoor relative humidity % (typically from project settings)
 * @param indoorDB  Indoor dry-bulb °C
 * @param indoorRH  Indoor relative humidity %
 * @returns ΔW in kg/kg
 */
export function deltaHumidityRatio(
  outdoorDB: number, outdoorRH: number,
  indoorDB: number, indoorRH: number,
  patm = P_ATM
): number {
  const wOut = humidityRatio(outdoorDB, outdoorRH, patm);
  const wIn = humidityRatio(indoorDB, indoorRH, patm);
  return Math.max(0, wOut - wIn);
}

/**
 * Compute enthalpy difference between outdoor and indoor air.
 * Used for total heat (sensible + latent) in ventilation.
 * @returns Δh in kJ/kg
 */
export function deltaEnthalpy(
  outdoorDB: number, outdoorRH: number,
  indoorDB: number, indoorRH: number,
  patm = P_ATM
): number {
  const hOut = enthalpy(outdoorDB, outdoorRH, patm);
  const hIn = enthalpy(indoorDB, indoorRH, patm);
  return Math.max(0, hOut - hIn);
}

// ─── AC Unit Sizing from Psychrometric State ──────────

export interface ACRecommendation {
  /** Required cooling capacity in TR */
  requiredTR: number;
  /** Required cooling capacity in BTU/h */
  requiredBTU: number;
  /** Required cooling capacity in kW */
  requiredKW: number;
  /** Recommended AC unit type */
  recommendedType: string;
  /** Recommended minimum EER for the conditions */
  recommendedMinEER: number;
  /** Outdoor conditions severity label */
  conditionsSeverity: 'mild' | 'moderate' | 'hot' | 'extreme';
  /** Derating factor based on outdoor temperature */
  deratingFactor: number;
  /** Adjusted capacity needed (after derating) */
  adjustedTR: number;
  /** Psychrometric state for outdoor air */
  outdoorState: PsychrometricState;
  /** Psychrometric state for indoor air */
  indoorState: PsychrometricState;
  /** Notes/warnings */
  notes: string[];
}

/**
 * Generate AC sizing recommendation using psychrometric analysis
 * Carrier methodology: accounts for actual outdoor humidity
 */
export function psychrometricACRecommendation(
  roomLoadWatts: number,
  roomTR: number,
  outdoorDB: number,
  outdoorRH: number,
  indoorDB: number,
  indoorRH: number
): ACRecommendation {
  const outdoorState = psychrometricState(outdoorDB, outdoorRH);
  const indoorState = psychrometricState(indoorDB, indoorRH);
  const notes: string[] = [];

  // Determine severity & derating
  let severity: ACRecommendation['conditionsSeverity'] = 'mild';
  let derating = 1.0;

  if (outdoorDB >= 43) {
    severity = 'extreme';
    derating = 0.82;
    notes.push('Extreme outdoor temp — capacity derated by 18%. Consider oversizing.');
  } else if (outdoorDB >= 38) {
    severity = 'hot';
    derating = 0.90;
    notes.push('High outdoor temp — capacity derated by 10%.');
  } else if (outdoorDB >= 33) {
    severity = 'moderate';
    derating = 0.95;
    notes.push('Moderate tropical conditions — slight derating applied.');
  } else {
    severity = 'mild';
    derating = 1.0;
  }

  // High humidity further derates latent performance
  if (outdoorRH >= 80) {
    derating *= 0.97;
    notes.push(`High outdoor RH (${outdoorRH}%) — additional 3% latent load derating.`);
  }

  const adjustedTR = roomTR / derating;
  const adjustedBTU = adjustedTR * 12000;
  const adjustedKW = adjustedTR * 3.517;

  // Recommend unit type based on capacity
  let recType = 'Wall Split';
  if (adjustedTR <= 2.5) recType = 'Wall Split';
  else if (adjustedTR <= 5) recType = 'Ceiling Cassette';
  else if (adjustedTR <= 10) recType = 'Ducted Split';
  else if (adjustedTR <= 20) recType = 'Floor Standing';
  else recType = 'Chiller + AHU';

  // Minimum EER based on conditions
  let minEER = 9.0;
  if (severity === 'extreme') minEER = 10.5;
  else if (severity === 'hot') minEER = 10.0;
  else if (severity === 'moderate') minEER = 9.5;

  // Psychrometric notes
  const deltaH = deltaEnthalpy(outdoorDB, outdoorRH, indoorDB, indoorRH);
  const deltaW = deltaHumidityRatio(outdoorDB, outdoorRH, indoorDB, indoorRH);
  notes.push(
    `ΔW = ${(deltaW * 1000).toFixed(2)} g/kg | Δh = ${deltaH.toFixed(1)} kJ/kg`
  );

  if (outdoorState.dewPoint > indoorDB) {
    notes.push('⚠ Outdoor dew point exceeds indoor DB — condensation risk on surfaces.');
  }

  return {
    requiredTR: round(roomTR, 2),
    requiredBTU: Math.round(roomTR * 12000),
    requiredKW: round(roomTR * 3.517, 2),
    recommendedType: recType,
    recommendedMinEER: minEER,
    conditionsSeverity: severity,
    deratingFactor: round(derating, 3),
    adjustedTR: round(adjustedTR, 2),
    outdoorState,
    indoorState,
    notes,
  };
}

// ─── Helpers ──────────────────────────────────────────

function round(v: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/**
 * Format a psychrometric state into a human-readable summary string
 */
export function formatPsychrometricSummary(state: PsychrometricState): string {
  return [
    `DB: ${state.dryBulb}°C`,
    `WB: ${state.wetBulb}°C`,
    `DP: ${state.dewPoint}°C`,
    `RH: ${state.relativeHumidity}%`,
    `W: ${(state.humidityRatio * 1000).toFixed(2)} g/kg`,
    `h: ${state.enthalpy} kJ/kg`,
    `v: ${state.specificVolume} m³/kg`,
    `ρ: ${state.density} kg/m³`,
  ].join(' | ');
}
