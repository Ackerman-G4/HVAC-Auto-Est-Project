import { describe, expect, it, vi } from 'vitest';
import { CalculationError } from '../numeric-guards';

/**
 * Guards added by REMEDIATION_PLAN.md TASK 2.3, the sweep of engine divisions.
 *
 * Each test drives a denominator to zero, negative or non-finite and asserts a
 * typed error, per CLAUDE.md §6.2. The point of every one of these is the same:
 * IEEE 754 division by zero yields Infinity rather than raising, and Infinity
 * survives Math.ceil, Math.max and multiplication, so the corrupt value arrives
 * downstream wearing the shape of a real answer.
 */

// The rule set is loaded data, not a literal, so `btu_per_tr` can arrive as 0
// from a bad rule document. Only that one constant is intercepted; every other
// lookup runs the real implementation.
const state = vi.hoisted(() => ({ btuPerTrOverride: null as number | null }));

vi.mock('@/lib/engine/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine/rules')>();
  return {
    ...actual,
    constantFromRuleSet: (ruleSet: Parameters<typeof actual.constantFromRuleSet>[0], ruleId: string, name: string) =>
      name === 'btu_per_tr' && state.btuPerTrOverride !== null
        ? state.btuPerTrOverride
        : actual.constantFromRuleSet(ruleSet, ruleId, name),
  };
});

const { calculateLoadScenario, defaultLoadInputs, defaultOverrides } = await import(
  '../hvac/load-calculation-engine'
);
const { saturationVaporPressurePa, pmvPpd, humidityRatioToRH } = await import('../comfort/pmv');
const { recommendCellSize, buildStructuredGrid } = await import('../simulation/geometry-builder');

function runLoad() {
  return calculateLoadScenario(defaultLoadInputs, defaultOverrides);
}

describe('a rule set carrying a zero Btu-per-ton cannot reach the bill of quantities', () => {
  it('produces a real result when the rule set is sound', () => {
    state.btuPerTrOverride = null;
    const result = runLoad();
    expect(Number.isFinite(result.breakdown.trRequired)).toBe(true);
    expect(result.breakdown.trRequired).toBeGreaterThan(0);
  });

  it('throws instead of returning Infinity tons when the constant is zero', () => {
    // Without the guard: Infinity tons -> Infinity units of equipment ->
    // a currency total that is Infinity, with no error raised anywhere.
    state.btuPerTrOverride = 0;
    expect(() => runLoad()).toThrow(CalculationError);
    state.btuPerTrOverride = null;
  });

  it('names the division so the fault is locatable', () => {
    state.btuPerTrOverride = 0;
    try {
      runLoad();
      expect.unreachable('expected the guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CalculationError);
      expect((error as CalculationError).context).toBe('loadCalculation.trRequired');
      expect((error as CalculationError).code).toBe('DIVISION_BY_ZERO');
    } finally {
      state.btuPerTrOverride = null;
    }
  });

  it('rejects a negative Btu-per-ton, which would invert the sign of the load', () => {
    state.btuPerTrOverride = -12000;
    try {
      runLoad();
      expect.unreachable('expected the guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CalculationError);
      expect((error as CalculationError).code).toBe('NEGATIVE_DENOMINATOR');
    } finally {
      state.btuPerTrOverride = null;
    }
  });
});

describe('the comfort model rejects a temperature that cannot exist', () => {
  it('computes saturation pressure for a real room temperature', () => {
    expect(saturationVaporPressurePa(24)).toBeGreaterThan(0);
  });

  it('rejects a temperature at or below absolute zero', () => {
    expect(() => saturationVaporPressurePa(-273.15)).toThrow(RangeError);
    expect(() => saturationVaporPressurePa(-300)).toThrow(RangeError);
  });

  it('rejects a non-finite temperature rather than returning NaN', () => {
    expect(() => saturationVaporPressurePa(Number.NaN)).toThrow(CalculationError);
    expect(() => saturationVaporPressurePa(Number.POSITIVE_INFINITY)).toThrow(CalculationError);
  });

  it('throws at the Magnus singularity, which sits above absolute zero', () => {
    // -243.04 degC zeroes the denominator and is a legal temperature, so a
    // range check against absolute zero alone would not catch it.
    expect(() => saturationVaporPressurePa(-243.04)).toThrow(CalculationError);
  });
});

describe('the PMV solve rejects inputs that would zero its denominators', () => {
  const base = { vel: 0.15, rh: 50, met: 1.2, clo: 0.5 };

  it('still solves for an ordinary office condition', () => {
    const { pmv, ppd } = pmvPpd({ ta: 24, tr: 24, ...base });
    expect(Number.isFinite(pmv)).toBe(true);
    expect(ppd).toBeGreaterThanOrEqual(5);
  });

  it('rejects a non-finite air temperature instead of returning NaN comfort', () => {
    expect(() => pmvPpd({ ta: Number.NaN, ...base })).toThrow(CalculationError);
  });

  it('rejects an air temperature below absolute zero', () => {
    expect(() => pmvPpd({ ta: -400, ...base })).toThrow(RangeError);
  });

  it('rejects a non-finite mean radiant temperature', () => {
    expect(() => pmvPpd({ ta: 24, tr: Number.NaN, ...base })).toThrow(CalculationError);
  });

  it('rejects negative clothing insulation, which can zero the surface solve', () => {
    // icl = 0.155 * clo, and the clothing-surface denominator is 3.5*icl + 0.1.
    expect(() => pmvPpd({ ta: 24, ...base, clo: -1 })).toThrow(RangeError);
  });

  it('rejects a non-finite metabolic rate', () => {
    expect(() => pmvPpd({ ta: 24, ...base, met: Number.NaN })).toThrow(CalculationError);
  });

  it('rejects a non-finite humidity ratio rather than clamping it to NaN', () => {
    // Math.max(0, NaN) is NaN, so the existing clamp was never a guard.
    expect(() => humidityRatioToRH(Number.NaN, 24)).toThrow(CalculationError);
  });
});

describe('the grid builder refuses a room that would make every cell index NaN', () => {
  const room = { lengthM: 10, widthM: 8, heightM: 3 };

  it('recommends a usable cell size for a real room', () => {
    const cs = recommendCellSize(room as Parameters<typeof recommendCellSize>[0]);
    expect(cs).toBeGreaterThan(0);
    expect(Number.isFinite(cs)).toBe(true);
  });

  it('rejects a zero cell budget', () => {
    expect(() => recommendCellSize(room as Parameters<typeof recommendCellSize>[0], 0)).toThrow(
      CalculationError,
    );
  });

  it('rejects a negative cell budget', () => {
    expect(() => recommendCellSize(room as Parameters<typeof recommendCellSize>[0], -1)).toThrow(
      CalculationError,
    );
  });

  it('rejects a non-finite cell budget', () => {
    expect(() =>
      recommendCellSize(room as Parameters<typeof recommendCellSize>[0], Number.NaN),
    ).toThrow(CalculationError);
  });

  it('rejects a zero room dimension instead of dividing by it', () => {
    const flat = { ...room, heightM: 0 };
    expect(() => recommendCellSize(flat as Parameters<typeof recommendCellSize>[0])).toThrow(
      CalculationError,
    );
  });

  it('rejects a non-finite room dimension, which would silently NaN the grid', () => {
    // Math.min and Math.max both propagate NaN, so the clamp that bounds the
    // cell size could not catch this on its own.
    const broken = { ...room, lengthM: Number.NaN };
    expect(() =>
      buildStructuredGrid(broken as Parameters<typeof buildStructuredGrid>[0], 0.1),
    ).toThrow(CalculationError);
  });
});
