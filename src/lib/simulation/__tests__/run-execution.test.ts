import { describe, expect, it, vi } from 'vitest';

/**
 * Thermal diffusivity, the one division in the run-execution path whose
 * denominator comes from outside the function.
 *
 * alpha = k / (rho * cp). Density and specific heat are read off the stored
 * simulation case, so a case saved with either at zero previously produced
 * `Infinity`, which the solver carries through the temperature field as `NaN` —
 * a plausible-looking result rather than a reported failure. The route computed
 * this inline (`thermalConductivity / (density * specificHeat)`) with no guard.
 *
 * The solver modules are stubbed only to keep this file's import cheap; nothing
 * here calls them. The executors that do are covered in
 * `run-execution-lifecycle.test.ts`.
 */

vi.mock('@/lib/functions/cfd-simulation', () => ({ runCFDSimulation: vi.fn() }));
vi.mock('@/lib/functions/building-cfd-simulation', () => ({ runBuildingCFDSimulation: vi.fn() }));
vi.mock('@/lib/simulation/field-snapshot', () => ({
  buildRunFieldSnapshotFromResult: vi.fn(),
}));

const { thermalDiffusivityM2PerS } = await import('../run-execution');
const { CalculationError } = await import('@/lib/engine/numeric-guards');

/** Dry air at roughly 20 °C, the values the default physics setup carries. */
const AIR = {
  thermalConductivityWPerMK: 0.0257,
  densityKgPerM3: 1.204,
  specificHeatJPerKgK: 1005,
};

describe('thermal diffusivity of the working fluid', () => {
  it('matches the accepted value for air at room temperature', () => {
    // Published alpha for dry air at 20 °C is about 2.12e-5 m2/s. Asserting the
    // physical value rather than a recomputation of the same expression is what
    // makes this a check on the identity and not on the code shape.
    const alpha = thermalDiffusivityM2PerS(
      AIR.thermalConductivityWPerMK,
      AIR.densityKgPerM3,
      AIR.specificHeatJPerKgK,
    );
    expect(alpha).toBeCloseTo(2.12e-5, 6);
  });

  it('rises in proportion to conductivity, holding density and specific heat', () => {
    const base = thermalDiffusivityM2PerS(0.0257, 1.204, 1005);
    const conductive = thermalDiffusivityM2PerS(0.0514, 1.204, 1005);
    expect(conductive).toBeCloseTo(base * 2, 12);
  });

  it('falls in proportion to density, holding conductivity and specific heat', () => {
    const base = thermalDiffusivityM2PerS(0.0257, 1.204, 1005);
    const dense = thermalDiffusivityM2PerS(0.0257, 2.408, 1005);
    expect(dense).toBeCloseTo(base / 2, 12);
  });

  it('rejects a zero density instead of returning an infinite diffusivity', () => {
    expect(() => thermalDiffusivityM2PerS(0.0257, 0, 1005)).toThrow(CalculationError);
  });

  it('rejects a zero specific heat', () => {
    expect(() => thermalDiffusivityM2PerS(0.0257, 1.204, 0)).toThrow(CalculationError);
  });

  it('rejects a negative density, which has no physical meaning', () => {
    expect(() => thermalDiffusivityM2PerS(0.0257, -1.204, 1005)).toThrow(CalculationError);
  });

  it('rejects a non-finite property that survived into the stored case', () => {
    expect(() => thermalDiffusivityM2PerS(0.0257, Number.NaN, 1005)).toThrow(CalculationError);
    expect(() => thermalDiffusivityM2PerS(Number.NaN, 1.204, 1005)).toThrow(CalculationError);
  });

  it('names the fluid properties as the cause, not a generic division error', () => {
    // The operator has to know which stored value to correct.
    try {
      thermalDiffusivityM2PerS(0.0257, 0, 1005);
      expect.unreachable('expected the diffusivity guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CalculationError);
      const calculationError = error as InstanceType<typeof CalculationError>;
      expect(calculationError.context).toMatch(/^runExecution\.thermalDiffusivity/);
      expect(calculationError.code).toBe('INVALID_FLUID_PROPERTIES');
    }
  });
});
