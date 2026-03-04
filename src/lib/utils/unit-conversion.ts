// HVAC Unit Conversions

// ── Temperature ─────────────────────────────────────────────
export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}
export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

// ── Power / Capacity ────────────────────────────────────────
export function wattsToTR(watts: number): number {
  return watts / 3517;
}
export function trToWatts(tr: number): number {
  return tr * 3517;
}
export function wattsToBTU(watts: number): number {
  return watts * 3.412;
}
export function btuToWatts(btu: number): number {
  return btu / 3.412;
}
export function trToBTU(tr: number): number {
  return tr * 12000;
}
export function btuToTR(btu: number): number {
  return btu / 12000;
}
export function kwToTR(kw: number): number {
  return kw / 3.517;
}
export function trToKW(tr: number): number {
  return tr * 3.517;
}

// ── Area ────────────────────────────────────────────────────
export function sqftToSqm(sqft: number): number {
  return sqft * 0.0929;
}
export function sqmToSqft(sqm: number): number {
  return sqm / 0.0929;
}

// ── Airflow ─────────────────────────────────────────────────
export function lpsToCSFM(lps: number): number {
  return lps * 2.119;
}
export function cfmToLPS(cfm: number): number {
  return cfm / 2.119;
}

// ── Length ───────────────────────────────────────────────────
export function metersToFeet(m: number): number {
  return m * 3.28084;
}
export function feetToMeters(ft: number): number {
  return ft * 0.3048;
}
export function inchesToMm(inches: number): number {
  return inches * 25.4;
}
export function mmToInches(mm: number): number {
  return mm / 25.4;
}

// ── Pressure ────────────────────────────────────────────────
export function paToInWG(pa: number): number {
  return pa * 0.004015;
}
export function inWGToPa(inwg: number): number {
  return inwg / 0.004015;
}

// ── Volume / Flow (for Carrier HAP) ─────────────────────────
export function gpmToLPS(gpm: number): number {
  return gpm * 0.0631;
}
export function lpsToGPM(lps: number): number {
  return lps / 0.0631;
}
export function kgPerSecToGPM(kgps: number): number {
  // Water density ≈ 1 kg/L → kg/s ≈ L/s
  return lpsToGPM(kgps);
}

// ── Room Dimension Conversions (per CSV methodology) ────────
/**
 * Convert room dimensions from feet to area in square meters.
 * Mirrors the CSV: Length(ft) × Width(ft) → sq.ft → sq.m
 */
export function roomFeetToSqm(lengthFt: number, widthFt: number): number {
  const sqft = lengthFt * widthFt;
  return sqftToSqm(sqft);
}

/**
 * Convert room dimensions from feet to area in square feet.
 */
export function roomFeetToSqft(lengthFt: number, widthFt: number): number {
  return lengthFt * widthFt;
}

/**
 * Convert window dimensions from feet to area in square meters.
 * CSV: Qty × Length(ft) × Width(ft) → sq.ft × 0.0929 → sq.m
 */
export function windowFeetToSqm(qty: number, lengthFt: number, widthFt: number): number {
  return qty * sqftToSqm(lengthFt * widthFt);
}

/**
 * Compute room perimeter in meters from length/width in feet.
 */
export function perimeterFeetToMeters(lengthFt: number, widthFt: number): number {
  return feetToMeters(2 * (lengthFt + widthFt));
}

/**
 * Display a measurement with both feet and meters.
 */
export function formatFtM(ft: number, decimals = 2): string {
  const m = feetToMeters(ft);
  return `${ft.toFixed(decimals)} ft (${m.toFixed(decimals)} m)`;
}

/**
 * Display an area with both sq.ft and sq.m.
 */
export function formatSqFtSqM(sqft: number, decimals = 1): string {
  const sqm = sqftToSqm(sqft);
  return `${sqft.toFixed(decimals)} ft² (${sqm.toFixed(decimals)} m²)`;
}

// ── Quick TR Estimate ───────────────────────────────────────
// Quick TR estimate for Philippine conditions
export function quickTREstimate(areaSqm: number, spaceType: string): number {
  const factors: Record<string, number> = {
    office: 180,
    conference: 160,
    lobby: 200,
    retail: 160,
    restaurant: 140,
    kitchen: 100,
    hotel_room: 200,
    server_room: 60,
    corridor: 300,
    restroom: 250,
    storage: 350,
    residential: 200,
    classroom: 160,
    hospital_ward: 170,
    operating_room: 100,
    parking: 500,
  };
  
  // Factor = sq.ft per TR (lower = more cooling needed)
  const factor = factors[spaceType] || 200;
  const areaSqft = sqmToSqft(areaSqm);
  return areaSqft / factor;
}

/**
 * Quick BTU estimate per CSV methodology.
 * Room BTU ≈ area(sq.ft) × BTU-per-sqft factor
 * Window BTU based on orientation and area in sq.m
 * Returns total BTU, TR, kW.
 */
export function quickBTUEstimate(input: {
  lengthFt: number;
  widthFt: number;
  windowNorthSqm: number;
  windowSouthSqm: number;
  windowEastSqm: number;
  windowWestSqm: number;
  hasWindowBlinds: boolean;
  occupantCount: number;
  equipmentWatts: number;
  lightingWatts: number;
}): { roomBTU: number; windowBTU: number; occupantBTU: number; equipmentBTU: number; lightingBTU: number; totalBTU: number; requiredTR: number; requiredKW: number } {
  const areaSqft = input.lengthFt * input.widthFt;
  const btuPerSqft = 31.25; // Tropical climate factor

  // Room envelope load
  const roomBTU = areaSqft * btuPerSqft;

  // Solar gain by orientation (BTU/h per sq.m window)
  const blindsFactor = input.hasWindowBlinds ? 0.55 : 1.0;
  const solarGainFactors = { north: 164, south: 868, east: 560, west: 560 };
  const windowBTU = (
    input.windowNorthSqm * solarGainFactors.north +
    input.windowSouthSqm * solarGainFactors.south +
    input.windowEastSqm * solarGainFactors.east +
    input.windowWestSqm * solarGainFactors.west
  ) * blindsFactor;

  // Occupant heat: ~400 BTU/h sensible per person (office activity)
  const occupantBTU = input.occupantCount * 400;

  // Equipment: Watts → BTU (×3.412)
  const equipmentBTU = input.equipmentWatts * 3.412;

  // Lighting: Watts → BTU (×3.412)
  const lightingBTU = input.lightingWatts * 3.412;

  const totalBTU = roomBTU + windowBTU + occupantBTU + equipmentBTU + lightingBTU;
  const requiredTR = totalBTU / 12000;
  const requiredKW = requiredTR * 3.517;

  return {
    roomBTU,
    windowBTU,
    occupantBTU,
    equipmentBTU,
    lightingBTU,
    totalBTU,
    requiredTR,
    requiredKW,
  };
}
