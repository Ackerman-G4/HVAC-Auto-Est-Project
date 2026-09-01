import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The tonnage conversion is the one denominator on this path that the engine
 * does not write itself.
 *
 * `btuPerTr` is read out of the rules layer, then divides the post-factor load
 * to give `trRequired`. That figure sets equipment quantity, which multiplies
 * into the bill of quantities total (CLAUDE.md §8.4). IEEE 754 makes the
 * failure quiet: a zero denominator yields `Infinity`, which survives
 * `Math.ceil` and `Math.max` and lands in a currency figure with nothing
 * thrown anywhere in the stack.
 *
 * `rule-schema.ts` rejects a constant that is missing, non-numeric or
 * non-finite. It cannot reject `0`, because zero is a legitimate value for
 * most constants and the schema has no way to know which ones are divisors.
 * That case is what the `safeDivide` at the division covers, and this file is
 * what drives it — the guard is unreachable through the bundled rules, so
 * without an injected rule set it would never execute in the suite.
 */

const tonnageConstant = vi.hoisted(() => ({ value: 12000 }));

vi.mock('@/lib/engine/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine/rules')>();

  return {
    ...actual,
    /**
     * Returns the real bundled rule set with `btu_per_tr` replaced.
     *
     * Everything else — the envelope lookup, the CFM formula, the other
     * constants — stays exactly as shipped, so a failure here is the tonnage
     * constant and nothing else. The set is deep-cloned first: the store
     * memoises bundled rule sets, and mutating one in place would leak the
     * corrupt value into every other test file in the run.
     */
    getRuleSetSync: (category: Parameters<typeof actual.getRuleSetSync>[0]) => {
      const real = actual.getRuleSetSync(category);
      if (category !== 'cooling_load') return real;

      const clone = structuredClone(real);
      for (const rule of clone.rules) {
        if (rule.type === 'constants' && rule.id === 'cooling_load_constants') {
          rule.values.btu_per_tr = tonnageConstant.value;
        }
      }
      return clone;
    },
  };
});

const { calculateLoadScenario, defaultLoadInputs, defaultOverrides } = await import(
  '../load-calculation-engine'
);
const { CalculationError } = await import('../../numeric-guards');

const run = () => calculateLoadScenario(defaultLoadInputs, defaultOverrides);

beforeEach(() => {
  tonnageConstant.value = 12000;
});

/**
 * Asserts that the tonnage division is what rejected the input.
 *
 * Checking the error type alone is not enough. A corrupt tonnage propagates,
 * and the equipment-selection guards downstream raise `CalculationError` too —
 * so `toThrow(CalculationError)` passes even with the tonnage guard removed.
 * Pinning the context is what makes these tests fail when the guard is gone,
 * which was verified by removing it.
 */
function expectTonnageGuardToReject(): void {
  try {
    run();
    expect.unreachable('expected the tonnage guard to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(CalculationError);
    // A prefix match, not equality: `safeDivide` suffixes the context with
    // `(denominator)` when the value is non-finite rather than zero. The
    // prefix is still unique to this division, which is what has to be pinned.
    expect((error as InstanceType<typeof CalculationError>).context).toMatch(
      /^loadCalculation\.trRequired/,
    );
  }
}

describe('required tonnage is guarded against a corrupt conversion constant', () => {
  it('computes normally when the constant is the documented 12000 Btu/h per ton', () => {
    // Establishes that the mock is wired correctly, so the rejections below
    // are the guard firing rather than the substitution failing.
    const { breakdown } = run();
    expect(breakdown.trRequired).toBeGreaterThan(0);
    expect(Number.isFinite(breakdown.trRequired)).toBe(true);
  });

  it('rejects a zero conversion constant instead of returning Infinity tons', () => {
    tonnageConstant.value = 0;
    expectTonnageGuardToReject();
  });

  it('reports a zero constant with the dedicated code, not a generic one', () => {
    tonnageConstant.value = 0;
    try {
      run();
      expect.unreachable('expected the tonnage guard to throw');
    } catch (error) {
      expect((error as InstanceType<typeof CalculationError>).code).toBe('INVALID_BTU_PER_TR');
    }
  });

  it('rejects a negative conversion constant, which has no physical meaning', () => {
    // A sign error would otherwise yield negative tonnage, and Math.ceil on a
    // negative gives a quantity of zero — an estimate with no equipment on it.
    tonnageConstant.value = -12000;
    expectTonnageGuardToReject();
  });

  it('rejects a non-finite constant that survived into the calculation', () => {
    tonnageConstant.value = Number.NaN;
    expectTonnageGuardToReject();
  });

  it('scales tonnage inversely with the conversion constant while it stays valid', () => {
    // Confirms the guard did not change the arithmetic for good input.
    const atTwelveThousand = run().breakdown.trRequired;
    tonnageConstant.value = 24000;
    const atTwentyFourThousand = run().breakdown.trRequired;

    expect(atTwentyFourThousand).toBeCloseTo(atTwelveThousand / 2, 6);
  });
});
