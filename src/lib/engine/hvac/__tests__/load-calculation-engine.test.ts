import { describe, expect, it } from 'vitest';
import {
  calculateLoadScenario,
  defaultLoadInputs,
  defaultOverrides,
  type LoadCalculationInputs,
} from '../load-calculation-engine';

/**
 * The load calculation engine behind `/load-calculation`, the reports cards and
 * the workspace stores — nine importers, and until now zero test coverage.
 *
 * Coverage measurement (TASK 5.1) is what surfaced that. This is the file F2
 * names, so it was reasonable to assume the golden money-path test reached it;
 * it does not. That test exercises `lib/functions/cooling-load.ts` and
 * `pricing-engine.ts`, which are a different path through the product.
 *
 * These assert physical relationships rather than the specific numbers the
 * engine happens to produce today. A test that pins `totalBtuAfterFactors` to a
 * literal only proves the code has not changed; one that asserts the total
 * scales with area proves it still computes a load.
 */

const inputs = (overrides: Partial<LoadCalculationInputs> = {}): LoadCalculationInputs => ({
  ...defaultLoadInputs,
  ...overrides,
});

const run = (overrides: Partial<LoadCalculationInputs> = {}) =>
  calculateLoadScenario(inputs(overrides), defaultOverrides);

describe('the breakdown sums to the total', () => {
  it('sensible and latent components add up to the pre-factor total', () => {
    const { breakdown: b } = run();
    const sensible =
      b.envelopeBtu + b.peopleSensibleBtu + b.lightingBtu + b.equipmentBtu + b.ventilationSensibleBtu;
    const latent = b.peopleLatentBtu + b.ventilationLatentBtu;

    expect(b.totalSensibleBtu).toBeCloseTo(sensible, 6);
    expect(b.totalLatentBtu).toBeCloseTo(latent, 6);
    expect(b.totalBtuBeforeFactors).toBeCloseTo(sensible + latent, 6);
  });

  it('produces a positive load for a realistic office', () => {
    const { breakdown } = run();
    expect(breakdown.totalBtuAfterFactors).toBeGreaterThan(0);
    expect(breakdown.trRequired).toBeGreaterThan(0);
    expect(breakdown.cfmRequired).toBeGreaterThan(0);
  });

  it('keeps every component finite', () => {
    // A NaN anywhere in the breakdown reaches the UI as a rendered figure.
    const { breakdown } = run();
    for (const [field, value] of Object.entries(breakdown)) {
      expect(Number.isFinite(value), `${field} is not finite`).toBe(true);
    }
  });
});

describe('loads respond to their drivers', () => {
  it('a larger room carries a larger load', () => {
    expect(run({ areaM2: 240 }).breakdown.totalBtuAfterFactors).toBeGreaterThan(
      run({ areaM2: 120 }).breakdown.totalBtuAfterFactors,
    );
  });

  it('more occupants raise both sensible and latent load', () => {
    const few = run({ occupants: 5 }).breakdown;
    const many = run({ occupants: 50 }).breakdown;

    expect(many.peopleSensibleBtu).toBeGreaterThan(few.peopleSensibleBtu);
    expect(many.peopleLatentBtu).toBeGreaterThan(few.peopleLatentBtu);
  });

  it('raises the ventilation load when the outdoor design condition is hotter', () => {
    expect(run({ outdoorTempC: 40 }).breakdown.ventilationSensibleBtu).toBeGreaterThan(
      run({ outdoorTempC: 30 }).breakdown.ventilationSensibleBtu,
    );
  });

  it('computes the envelope load from area and space type alone, independent of ΔT', () => {
    // Asserting what the engine does, not what I first assumed it did.
    //
    // `envelope_load_formula` is `area × factor(spaceType)`; deltaTF is
    // computed two lines above and used for ventilation and supply airflow,
    // but never for the envelope. So a Manila design day at 40°C produces the
    // same fabric gain as one at 30°C.
    //
    // That is a modelling choice — a W/m² estimator with an assumed ΔT baked
    // into the factor — not obviously a defect, and it lives in a configurable
    // rule set. Pinning it here so a future change to that formula is a
    // deliberate decision rather than a silent one. Flagged for domain review;
    // not changed on my own judgement.
    expect(run({ outdoorTempC: 40 }).breakdown.envelopeBtu).toBe(
      run({ outdoorTempC: 30 }).breakdown.envelopeBtu,
    );
  });

  it('zero lighting density contributes no lighting load', () => {
    // The rooms endpoint used to substitute 15 W/m² for a supplied 0; this is
    // what that substitution was inflating.
    expect(run({ lightingWPerM2: 0 }).breakdown.lightingBtu).toBe(0);
  });

  it('zero equipment load contributes no equipment heat', () => {
    expect(run({ equipmentLoadW: 0 }).breakdown.equipmentBtu).toBe(0);
  });
});

describe('the dimensionless factors scale the result', () => {
  it('a higher safety factor raises the total', () => {
    expect(run({ safetyFactor: 1.3 }).breakdown.totalBtuAfterFactors).toBeGreaterThan(
      run({ safetyFactor: 1.0 }).breakdown.totalBtuAfterFactors,
    );
  });

  it('a lower diversity factor reduces the total', () => {
    expect(run({ diversityFactor: 0.7 }).breakdown.totalBtuAfterFactors).toBeLessThan(
      run({ diversityFactor: 1.0 }).breakdown.totalBtuAfterFactors,
    );
  });

  it('applies both factors multiplicatively', () => {
    const base = run({ safetyFactor: 1, diversityFactor: 1 }).breakdown;
    const scaled = run({ safetyFactor: 1.2, diversityFactor: 0.5 }).breakdown;

    // Tolerance rather than exactness: the engine rounds its published totals,
    // so the product of two factors lands within a hundredth, not a millionth.
    expect(scaled.totalBtuAfterFactors).toBeCloseTo(base.totalBtuAfterFactors * 1.2 * 0.5, 1);
  });
});

describe('manual overrides replace the computed figures', () => {
  it('a manual total drives the tonnage instead of the computed load', () => {
    const computed = calculateLoadScenario(inputs(), defaultOverrides);
    const overridden = calculateLoadScenario(inputs(), {
      ...defaultOverrides,
      useManualTotalBtu: true,
      manualTotalBtu: 120_000,
    });

    expect(overridden.breakdown.trRequired).not.toBeCloseTo(computed.breakdown.trRequired, 3);
    // 12,000 Btu/h per ton (CLAUDE.md §8.2).
    expect(overridden.breakdown.trRequired).toBeCloseTo(10, 6);
  });

  it('ignores a manual total when the flag is off', () => {
    const withFlagOff = calculateLoadScenario(inputs(), {
      ...defaultOverrides,
      useManualTotalBtu: false,
      manualTotalBtu: 999_999,
    });

    expect(withFlagOff.breakdown.trRequired).toBeCloseTo(
      calculateLoadScenario(inputs(), defaultOverrides).breakdown.trRequired,
      6,
    );
  });

  it('a manual airflow replaces the computed CFM', () => {
    const overridden = calculateLoadScenario(inputs(), {
      ...defaultOverrides,
      useManualCfm: true,
      manualCfm: 2500,
    });

    expect(overridden.breakdown.cfmRequired).toBe(2500);
  });
});

describe('equipment sizing', () => {
  it('offers every catalogue option with a quantity of at least one', () => {
    const { equipmentOptions } = run();

    expect(equipmentOptions.length).toBeGreaterThan(0);
    for (const option of equipmentOptions) {
      expect(option.quantity).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(option.quantity)).toBe(true);
    }
  });

  it('sizes enough units to meet the requirement', () => {
    const { breakdown, equipmentOptions } = run();

    for (const option of equipmentOptions) {
      expect(option.quantity * option.capacityTr).toBeGreaterThanOrEqual(breakdown.trRequired);
    }
  });

  it('needs more of a smaller unit than of a larger one', () => {
    const { equipmentOptions } = run();
    const sorted = [...equipmentOptions].sort((a, b) => a.capacityTr - b.capacityTr);

    expect(sorted[0].quantity).toBeGreaterThanOrEqual(sorted[sorted.length - 1].quantity);
  });

  it('keeps utilization and annual energy finite and non-negative', () => {
    for (const option of run().equipmentOptions) {
      expect(Number.isFinite(option.utilization)).toBe(true);
      expect(Number.isFinite(option.annualEnergyKwh)).toBe(true);
      expect(option.annualEnergyKwh).toBeGreaterThan(0);
      expect(option.utilization).toBeGreaterThanOrEqual(0);
    }
  });

  it('scales quantity with the load', () => {
    const small = run({ areaM2: 40, occupants: 4 }).equipmentOptions;
    const large = run({ areaM2: 600, occupants: 120 }).equipmentOptions;
    const smallest = (opts: typeof small) => [...opts].sort((a, b) => a.capacityTr - b.capacityTr)[0];

    expect(smallest(large).quantity).toBeGreaterThan(smallest(small).quantity);
  });
});

describe('airflow and formulas', () => {
  it('distributes the required airflow across the map', () => {
    const { airflowMap, breakdown } = run();

    expect(airflowMap.length).toBeGreaterThan(0);
    for (const node of airflowMap) {
      expect(Number.isFinite(node.cfm)).toBe(true);
      expect(node.cfm).toBeGreaterThanOrEqual(0);
      expect(node.cfm).toBeLessThanOrEqual(breakdown.cfmRequired * 1.0001);
    }
  });

  it('publishes the formulas behind the result, which is what makes it defensible', () => {
    const { formulas } = run();

    expect(formulas.length).toBeGreaterThan(0);
    for (const row of formulas) {
      expect(row.expression.length).toBeGreaterThan(0);
      expect(row.value.length).toBeGreaterThan(0);
    }
  });
});

describe('alerts', () => {
  it('returns an array for a normal scenario', () => {
    expect(Array.isArray(run().alerts)).toBe(true);
  });

  it('flags a diversity factor above one, which is valid only in documented cases', () => {
    // CLAUDE.md §8.5.
    const alerts = run({ diversityFactor: 1.4 }).alerts;
    expect(alerts.length).toBeGreaterThan(0);
  });
});
