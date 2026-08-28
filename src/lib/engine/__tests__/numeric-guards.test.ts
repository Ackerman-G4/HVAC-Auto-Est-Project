import { describe, expect, it } from 'vitest';
import {
  safeDivide,
  assertFinite,
  assertPositive,
  CalculationError,
} from '../numeric-guards';

/**
 * The guards exist because IEEE 754 division by zero yields Infinity rather
 * than raising, and Infinity survives Math.ceil, Math.max and multiplication —
 * so a single zero-capacity catalogue record reaches a currency total with no
 * error anywhere in the stack.
 */

describe('a zero denominator is refused, not turned into Infinity', () => {
  it('throws instead of returning Infinity', () => {
    expect(() => safeDivide(42, 0, 'equipmentQuantity')).toThrow(CalculationError);
    // What the unguarded expression does today.
    expect(42 / 0).toBe(Infinity);
  });

  it('reports where it happened and what the value was', () => {
    try {
      safeDivide(42, 0, 'equipmentQuantity');
      expect.unreachable('should have thrown');
    } catch (error) {
      const e = error as CalculationError;
      expect(e.context).toBe('equipmentQuantity');
      expect(e.code).toBe('DIVISION_BY_ZERO');
      expect(e.value).toBe(0);
    }
  });

  it('refuses negative zero too, which also divides to Infinity', () => {
    expect(-42 / -0).toBe(Infinity);
    expect(() => safeDivide(-42, -0, 'ctx')).toThrow(CalculationError);
  });
});

describe('non-finite inputs are refused', () => {
  it('rejects a NaN denominator rather than propagating NaN', () => {
    expect(42 / NaN).toBeNaN();
    expect(() => safeDivide(42, NaN, 'ctx')).toThrow(CalculationError);
  });

  it('rejects a NaN numerator', () => {
    expect(() => safeDivide(NaN, 42, 'ctx')).toThrow(CalculationError);
  });

  it('rejects an Infinity denominator, which silently yields zero', () => {
    // This one is insidious: it produces a plausible 0 rather than a visible
    // Infinity, so nothing downstream looks wrong.
    expect(42 / Infinity).toBe(0);
    expect(() => safeDivide(42, Infinity, 'ctx')).toThrow(CalculationError);
  });

  it('distinguishes numerator from denominator in the message', () => {
    expect(() => safeDivide(NaN, 1, 'ctx')).toThrow(/numerator/);
    expect(() => safeDivide(1, NaN, 'ctx')).toThrow(/denominator/);
  });
});

describe('negative denominators', () => {
  it('is allowed by default, since some quotients are legitimately signed', () => {
    // A temperature difference may run either way.
    expect(safeDivide(10, -2, 'deltaT')).toBe(-5);
  });

  it('is refused where physics forbids it', () => {
    expect(() => safeDivide(10, -2, 'capacity', { requirePositive: true })).toThrow(
      CalculationError,
    );
  });

  it('carries a distinct code, so a caller can tell the two apart', () => {
    try {
      safeDivide(10, -2, 'capacity', { requirePositive: true });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CalculationError).code).toBe('NEGATIVE_DENOMINATOR');
    }
  });
});

describe('valid input passes through unchanged', () => {
  it('returns the quotient', () => {
    expect(safeDivide(12, 4, 'ctx')).toBe(3);
    expect(safeDivide(7, 2, 'ctx')).toBe(3.5);
  });

  it('does not round, so callers keep control of precision', () => {
    expect(safeDivide(1, 3, 'ctx')).toBeCloseTo(0.3333333333333333, 15);
  });

  it('accepts a zero numerator, which is a real quotient', () => {
    expect(safeDivide(0, 5, 'ctx')).toBe(0);
  });
});

describe('assertFinite', () => {
  it('passes a finite value straight through', () => {
    expect(assertFinite(3.5, 'ctx')).toBe(3.5);
    expect(assertFinite(0, 'ctx')).toBe(0);
    expect(assertFinite(-1, 'ctx')).toBe(-1);
  });

  it('rejects NaN and both infinities', () => {
    expect(() => assertFinite(NaN, 'ctx')).toThrow(CalculationError);
    expect(() => assertFinite(Infinity, 'ctx')).toThrow(CalculationError);
    expect(() => assertFinite(-Infinity, 'ctx')).toThrow(CalculationError);
  });

  it('names the value in the message rather than printing [object]', () => {
    expect(() => assertFinite(NaN, 'roomArea')).toThrow(/roomArea: expected a finite number, received NaN/);
  });
});

describe('assertPositive', () => {
  it('passes a positive value through', () => {
    expect(assertPositive(0.5, 'ctx')).toBe(0.5);
  });

  it('rejects zero, which is the capacity case that started this', () => {
    expect(() => assertPositive(0, 'unitCapacityTr')).toThrow(CalculationError);
  });

  it('rejects a negative value', () => {
    expect(() => assertPositive(-1, 'ctx')).toThrow(CalculationError);
  });

  it('rejects NaN before the comparison, since NaN <= 0 is false', () => {
    // Without the finite check first, NaN would slip past `value <= 0`.
    expect(NaN <= 0).toBe(false);
    expect(() => assertPositive(NaN, 'ctx')).toThrow(CalculationError);
  });
});
