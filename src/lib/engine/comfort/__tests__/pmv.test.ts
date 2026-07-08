/**
 * ISO 7730 PMV/PPD validation.
 *
 * The PMV algorithm here IS the ISO 7730 (Fanger) definition, so it is validated
 * three ways: (1) the PPD relation is exact and checked against closed-form
 * values; (2) physical invariants a correct model must satisfy (monotonic in
 * temperature, air speed cools in warm conditions, neutral near comfortable
 * conditions); (3) the anchor the Wave 8 plan cites — 30 °C / 70 %RH lands near
 * PMV 1.6 / PPD 57, NOT the old placeholder's 2.10 / 72.
 */

import { describe, it, expect } from 'vitest';
import { pmvPpd, ppdFromPmv, humidityRatioToRH } from '@/lib/engine/comfort/pmv';

describe('PPD closed form (exact ISO 7730 relation)', () => {
  it('is 5% at PMV 0 and rises symmetrically', () => {
    expect(ppdFromPmv(0)).toBeCloseTo(5, 5);
    expect(ppdFromPmv(1)).toBeCloseTo(26.1, 1);
    expect(ppdFromPmv(-1)).toBeCloseTo(26.1, 1);
    expect(ppdFromPmv(2)).toBeCloseTo(76.8, 1);
    expect(ppdFromPmv(-2)).toBeCloseTo(76.8, 1);
  });
});

describe('PMV physical invariants', () => {
  const base = { vel: 0.1, rh: 50, met: 1.2, clo: 0.5 } as const;

  it('is near-neutral in comfortable conditions (~24 °C, still air)', () => {
    const { pmv, ppd } = pmvPpd({ ta: 24, tr: 24, ...base });
    expect(pmv).toBeGreaterThan(-0.5);
    expect(pmv).toBeLessThan(0.5);
    expect(ppd).toBeLessThan(12);
  });

  it('increases monotonically with air temperature', () => {
    const cool = pmvPpd({ ta: 20, tr: 20, ...base }).pmv;
    const mid = pmvPpd({ ta: 24, tr: 24, ...base }).pmv;
    const warm = pmvPpd({ ta: 28, tr: 28, ...base }).pmv;
    expect(cool).toBeLessThan(mid);
    expect(mid).toBeLessThan(warm);
  });

  it('higher air speed lowers PMV in warm conditions', () => {
    const still = pmvPpd({ ta: 28, tr: 28, vel: 0.1, rh: 50, met: 1.2, clo: 0.5 }).pmv;
    const breezy = pmvPpd({ ta: 28, tr: 28, vel: 0.8, rh: 50, met: 1.2, clo: 0.5 }).pmv;
    expect(breezy).toBeLessThan(still);
  });

  it('PPD is always at least 5%', () => {
    for (const ta of [18, 22, 24, 26, 30]) {
      expect(pmvPpd({ ta, tr: ta, ...base }).ppd).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('Wave 8 anchor: warm/humid Philippine office', () => {
  it('30 °C / 70 %RH lands near PMV 1.6 (not the placeholder 2.1)', () => {
    const { pmv, ppd } = pmvPpd({ ta: 30, tr: 30, vel: 0.15, rh: 70, met: 1.1, clo: 0.5 });
    expect(pmv).toBeGreaterThan(1.3);
    expect(pmv).toBeLessThan(1.9);
    expect(ppd).toBeGreaterThan(40);
    expect(ppd).toBeLessThan(72);
  });
});

describe('humidity ratio → RH conversion', () => {
  it('maps a typical PH indoor humidity ratio to a plausible RH', () => {
    // ~0.0112 kg/kg at 24 °C is roughly 60% RH.
    const rh = humidityRatioToRH(0.0112, 24);
    expect(rh).toBeGreaterThan(50);
    expect(rh).toBeLessThan(70);
  });

  it('clamps to [0, 100]', () => {
    expect(humidityRatioToRH(0, 24)).toBe(0);
    expect(humidityRatioToRH(1, 24)).toBeLessThanOrEqual(100);
  });
});
