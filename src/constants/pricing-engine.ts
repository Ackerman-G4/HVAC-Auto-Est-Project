// HVAC Pricing Engine Constants
// Philippine market benchmarks for equipment, materials, and labor costing

/** Brand tier classification for markup/quality differentiation */
export type BrandTier = 'high' | 'mid' | 'entry';

export const BRAND_TIERS: Record<string, BrandTier> = {
  Daikin: 'high',
  Mitsubishi: 'high',
  Carrier: 'high',
  Panasonic: 'mid',
  Samsung: 'mid',
  LG: 'mid',
  Koppel: 'entry',
  Hisense: 'entry',
  TCL: 'entry',
};

/** Tier-based multipliers applied to base equipment pricing */
export const TIER_MULTIPLIERS: Record<BrandTier, number> = {
  high: 1.0,
  mid: 0.85,
  entry: 0.65,
};

/** Installation material unit costs in PHP */
export const MATERIAL_PRICES = {
  copperPipeLiquidPerMeter: 180,
  copperPipeGasPerMeter: 280,
  insulationPerMeter: 65,
  drainPipePerMeter: 45,
  electricalWirePerMeter: 55,
  circuitBreakerPerUnit: 850,
  condensatePumpPerUnit: 2500,
  wallBracketPerSet: 1200,
  ceilingBracketPerSet: 2800,
  ductTapePerRoll: 120,
  refrigerantTopUpPerKg: 1800,
} as const;

/** Default pipe run lengths per system type (meters) */
export const DEFAULT_PIPE_RUNS: Record<string, number> = {
  wall_split: 5,
  ceiling_cassette: 8,
  ducted_split: 12,
  vrf: 25,
};

/** Labor cost ranges as percentage of equipment cost */
export const LABOR_RATES = {
  minPercent: 0.20,
  maxPercent: 0.40,
  defaultPercent: 0.30,
} as const;

/** Overhead and contingency defaults */
export const PROJECT_OVERHEAD = {
  overheadPercent: 0.10,
  contingencyPercent: 0.05,
  vatPercent: 0.12,
} as const;
