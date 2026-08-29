/**
 * ISO 7730 / Fanger PMV–PPD thermal comfort model.
 *
 * Replaces the Wave-6-era placeholder `(T − 24) × 0.35` — which was blind to air
 * speed, humidity, clothing and metabolic rate — with the full Fanger model:
 * an iterative clothing-surface-temperature solve and all six heat-loss terms.
 * The PPD relationship is the exact ISO 7730 formula.
 *
 * Reference: ISO 7730:2005 §4 and Annex D (identical to ASHRAE 55 Normative
 * Appendix). Validated in ./__tests__/pmv.test.ts via the exact PPD relation,
 * physical invariants, and the anchor the Wave 8 plan cites (30 °C / 70 %RH →
 * PMV ≈ 1.6, not the placeholder's 2.1).
 */

import { assertFinite, safeDivide } from '../numeric-guards';

/**
 * CLAUDE.md §8.6: a temperature below absolute zero is a physical
 * impossibility and is rejected at the boundary rather than propagated.
 */
const ABSOLUTE_ZERO_C = -273.15;

function assertPhysicalTemperature(tempC: number, context: string): number {
  assertFinite(tempC, context, 'NON_PHYSICAL_TEMPERATURE');
  if (tempC <= ABSOLUTE_ZERO_C) {
    throw new RangeError(
      context + ': ' + tempC + ' degC is at or below absolute zero.',
    );
  }
  return tempC;
}

export interface PmvInput {
  /** Air (dry-bulb) temperature, °C. */
  ta: number;
  /** Mean radiant temperature, °C (defaults to air temperature). */
  tr?: number;
  /** Relative air velocity, m/s. */
  vel: number;
  /** Relative humidity, %. */
  rh: number;
  /** Metabolic rate, met (1 met = 58.15 W/m²). */
  met: number;
  /** Clothing insulation, clo (1 clo = 0.155 m²·K/W). */
  clo: number;
  /** External work, met (usually 0). */
  wme?: number;
}

export interface PmvResult {
  /** Predicted Mean Vote, roughly −3 (cold) … +3 (hot). */
  pmv: number;
  /** Predicted Percentage of Dissatisfied, 5 … 100 %. */
  ppd: number;
}

/**
 * Exact ISO 7730 PPD from PMV:
 *   PPD = 100 − 95·exp(−0.03353·PMV⁴ − 0.2179·PMV²)
 * Minimum 5 % at PMV = 0; symmetric in ±PMV.
 */
export function ppdFromPmv(pmv: number): number {
  return 100 - 95 * Math.exp(-0.03353 * pmv ** 4 - 0.2179 * pmv ** 2);
}

/**
 * Saturation water-vapour pressure over liquid water, Pa (Magnus form).
 *
 * The Magnus denominator vanishes at -243.04 degC, which is above absolute zero
 * and therefore reachable by an unvalidated input. Guarded at the division
 * rather than by a range check, so the failure is typed instead of Infinity.
 */
export function saturationVaporPressurePa(tempC: number): number {
  assertPhysicalTemperature(tempC, 'saturationVaporPressurePa.tempC');
  const exponent = safeDivide(
    17.625 * tempC,
    tempC + 243.04,
    'saturationVaporPressurePa.magnusDenominator',
  );
  return 610.94 * Math.exp(exponent);
}

/**
 * Convert a humidity ratio W (kg water / kg dry air) to relative humidity (%)
 * at a given temperature and total pressure.
 */
export function humidityRatioToRH(
  humidityRatio: number,
  tempC: number,
  pressurePa = 101325,
): number {
  assertFinite(humidityRatio, 'humidityRatioToRH.humidityRatio');
  assertFinite(pressurePa, 'humidityRatioToRH.pressurePa');
  // Math.max(0, NaN) is NaN, so the clamp below is not itself a guard.
  const w = Math.max(0, humidityRatio);
  const pw = (w * pressurePa) / (0.62198 + w); // partial vapour pressure, Pa
  const pws = saturationVaporPressurePa(tempC);
  if (pws <= 0) return 0;
  return Math.max(0, Math.min(100, (pw / pws) * 100));
}

/**
 * Compute PMV and PPD per ISO 7730 (Fanger). The clothing-surface temperature
 * is found by fixed-point iteration; PMV then follows from the thermal load on
 * the body.
 */
export function pmvPpd(input: PmvInput): PmvResult {
  const ta = assertPhysicalTemperature(input.ta, 'pmvPpd.ta');
  const tr = assertPhysicalTemperature(input.tr ?? input.ta, 'pmvPpd.tr');
  const vel = Math.max(0, input.vel);
  const rh = Math.max(0, Math.min(100, input.rh));
  const met = assertFinite(input.met, 'pmvPpd.met');
  // clo drives icl, and icl sets the denominators at the clothing-surface
  // solve. A negative clo has no physical meaning and can zero them.
  const clo = assertFinite(input.clo, 'pmvPpd.clo');
  if (clo < 0) {
    throw new RangeError('pmvPpd.clo: clothing insulation cannot be negative, received ' + clo + '.');
  }
  const wme = assertFinite(input.wme ?? 0, 'pmvPpd.wme');

  // Water-vapour partial pressure in air, Pa.
  // Denominator vanishes at -235 degC, above absolute zero and so reachable.
  const pa = rh * 10 * Math.exp(16.6536 - safeDivide(4030.183, ta + 235, 'pmvPpd.paDenominator'));

  const icl = 0.155 * clo;          // clothing insulation, m²·K/W
  const m = met * 58.15;            // metabolic rate, W/m²
  const w = wme * 58.15;            // external work, W/m²
  const mw = m - w;

  const fcl = icl <= 0.078 ? 1.0 + 1.29 * icl : 1.05 + 0.645 * icl;
  const hcf = 12.1 * Math.sqrt(vel); // forced convective heat transfer coeff
  const taa = ta + 273;
  const tra = tr + 273;

  // Iterative solve for clothing surface temperature.
  // icl >= 0 is enforced above, so this denominator is >= 0.1. Routed through
  // the guard anyway: the invariant lives three statements away from its use.
  const tcla = taa + safeDivide(35.5 - ta, 3.5 * icl + 0.1, 'pmvPpd.clothingSurfaceSolve');
  const p1 = icl * fcl;
  const p2 = p1 * 3.96;
  const p3 = p1 * 100;
  const p4 = p1 * taa;
  const p5 = 308.7 - 0.028 * mw + p2 * (tra / 100) ** 4;

  let xn = tcla / 100;
  let xf = xn;
  let hc = hcf;
  const eps = 0.00015;
  for (let n = 0; n < 150; n++) {
    xf = (xf + xn) / 2;
    const hcn = 2.38 * Math.abs(100 * xf - taa) ** 0.25;
    hc = hcf > hcn ? hcf : hcn;
    xn = (p5 + p4 * hc - p2 * xf ** 4) / (100 + p3 * hc);
    if (Math.abs(xn - xf) <= eps) break;
  }
  const tcl = 100 * xn - 273;

  // Heat-loss components (W/m²).
  const hl1 = 3.05e-3 * (5733 - 6.99 * mw - pa);         // skin diffusion
  const hl2 = mw > 58.15 ? 0.42 * (mw - 58.15) : 0;      // sweat
  const hl3 = 1.7e-5 * m * (5867 - pa);                  // latent respiration
  const hl4 = 0.0014 * m * (34 - ta);                    // dry respiration
  const hl5 = 3.96 * fcl * (xn ** 4 - (tra / 100) ** 4); // radiation
  const hl6 = fcl * hc * (tcl - ta);                     // convection

  const ts = 0.303 * Math.exp(-0.036 * m) + 0.028;
  const pmv = ts * (mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6);
  const ppd = ppdFromPmv(pmv);

  return { pmv, ppd };
}

/** ISO 7730 applicability ceiling for air speed driving comfort (m/s). */
export const PMV_MAX_AIR_SPEED = 1.0;

/** Typical Philippine office defaults (documented in the plan). */
export const DEFAULT_MET = 1.1;
export const DEFAULT_CLO = 0.5;
