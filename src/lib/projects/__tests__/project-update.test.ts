import { describe, expect, it } from 'vitest';
import { buildProjectUpdate, toNullableNumber, type StoredProject } from '../project-update';

/**
 * The project update merge, extracted from a 282-line route by TASK 3.2.
 *
 * The rule under test is the one with money consequences: changing any pricing
 * input invalidates the stored bill of quantities. Get that comparison wrong
 * and a quotation keeps being served from figures the project no longer uses,
 * with nothing anywhere reporting it.
 */

function stored(over: Partial<StoredProject> = {}): StoredProject {
  return {
    name: 'HQ', clientName: 'Acme', buildingType: 'office',
    location: 'Manila', city: 'Manila',
    totalFloorArea: 500, floorsAboveGrade: 3, floorsBelowGrade: 1,
    outdoorDB: 34, outdoorRH: 70, indoorDB: 24, indoorRH: 50,
    safetyFactor: 1.1, diversityFactor: 0.95,
    suggestedLaborMultiplier: 0.35, laborMultiplierOverride: null,
    suggestedOverheadPercent: 0.15, overheadPercentOverride: null,
    suggestedContingencyPercent: 0.05, contingencyPercentOverride: null,
    suggestedVatRate: 0.12, vatRateOverride: null,
    isBoqStale: false, lastBoqGeneratedAt: '2026-01-01T00:00:00.000Z',
    notes: '', status: 'active',
    ...over,
  };
}

describe('a pricing change invalidates the stored bill of quantities', () => {
  it('leaves the bill valid when nothing pricing-related moves', () => {
    const { pricingChanged, patch } = buildProjectUpdate({ name: 'New Name' }, stored());

    expect(pricingChanged).toBe(false);
    expect(patch.isBoqStale).toBe(false);
    expect(patch.lastBoqGeneratedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it.each([
    ['suggestedLaborMultiplier', 0.4],
    ['suggestedOverheadPercent', 0.2],
    ['suggestedContingencyPercent', 0.1],
    ['suggestedVatRate', 0.08],
  ])('marks the bill stale when %s changes', (field, value) => {
    const { pricingChanged, patch } = buildProjectUpdate({ [field]: value }, stored());

    expect(pricingChanged).toBe(true);
    expect(patch.isBoqStale).toBe(true);
    // Cleared, because the timestamp would otherwise claim the stored bill
    // was generated from the new figures.
    expect(patch.lastBoqGeneratedAt).toBeNull();
  });

  it('marks the bill stale when an override is added', () => {
    const { pricingChanged } = buildProjectUpdate({ vatRateOverride: 0.05 }, stored());
    expect(pricingChanged).toBe(true);
  });

  it('marks the bill stale when an override is cleared', () => {
    // null is the user removing an override, and it changes the effective rate
    // just as much as setting one.
    const { pricingChanged, patch } = buildProjectUpdate(
      { vatRateOverride: null },
      stored({ vatRateOverride: 0.05 }),
    );

    expect(pricingChanged).toBe(true);
    expect(patch.vatRateOverride).toBeNull();
  });

  it('keeps an existing override when the field is simply absent', () => {
    // Absent is not the same as cleared: a partial update must not silently
    // drop an override the user set earlier.
    const { pricingChanged, patch } = buildProjectUpdate({ name: 'X' }, stored({ vatRateOverride: 0.05 }));

    expect(patch.vatRateOverride).toBe(0.05);
    expect(pricingChanged).toBe(false);
  });

  it('keeps the bill stale once it is stale, even on an unrelated edit', () => {
    const { patch } = buildProjectUpdate({ notes: 'hello' }, stored({ isBoqStale: true }));
    expect(patch.isBoqStale).toBe(true);
  });

  it('treats a zero rate as a real change, not as absent', () => {
    const { pricingChanged, patch } = buildProjectUpdate({ suggestedVatRate: 0 }, stored());
    expect(pricingChanged).toBe(true);
    expect(patch.suggestedVatRate).toBe(0);
  });
});

describe('wet bulb is derived, never accepted', () => {
  it('recomputes from the submitted dry bulb and humidity', () => {
    const { patch } = buildProjectUpdate({ outdoorDB: 35, outdoorRH: 60 }, stored());

    expect(patch.outdoorDB).toBe(35);
    expect(patch.outdoorRH).toBe(60);
    // Wet bulb sits below dry bulb for any humidity under saturation.
    expect(patch.outdoorWB).toBeLessThan(35);
    expect(patch.outdoorWB).toBeGreaterThan(0);
  });

  it('ignores a client-supplied wet bulb', () => {
    // Accepting it would let a caller store a psychrometrically impossible pair.
    const { patch } = buildProjectUpdate(
      { outdoorDB: 34, outdoorRH: 70, outdoorWB: 999 } as Record<string, unknown>,
      stored(),
    );
    expect(patch.outdoorWB).toBeLessThan(34);
  });

  it('reports wet bulb to two decimals', () => {
    const { patch } = buildProjectUpdate({ outdoorDB: 33.7, outdoorRH: 64 }, stored());
    expect(patch.outdoorWB).toBe(Math.round(patch.outdoorWB * 100) / 100);
  });
});

describe('absent fields fall back to what is stored', () => {
  it('leaves every unmentioned field untouched', () => {
    const before = stored();
    const { patch } = buildProjectUpdate({}, before);

    expect(patch.name).toBe(before.name);
    expect(patch.totalFloorArea).toBe(before.totalFloorArea);
    expect(patch.floorsAboveGrade).toBe(before.floorsAboveGrade);
    expect(patch.status).toBe(before.status);
  });

  it('coerces a floor count to a whole number', () => {
    const { patch } = buildProjectUpdate({ floorsAboveGrade: 4.8 }, stored());
    expect(Number.isInteger(patch.floorsAboveGrade)).toBe(true);
  });
});

describe('nullable numbers distinguish cleared from absent', () => {
  it('returns null for an explicit null', () => {
    expect(toNullableNumber(null, 5)).toBeNull();
  });

  it('returns the fallback for undefined', () => {
    expect(toNullableNumber(undefined, 5)).toBe(5);
  });

  it('returns the fallback for a value that is not a finite number', () => {
    expect(toNullableNumber('abc', 5)).toBe(5);
    expect(toNullableNumber(Number.NaN, 5)).toBe(5);
  });

  it('accepts a real number, including zero', () => {
    expect(toNullableNumber(0, 5)).toBe(0);
    expect(toNullableNumber(0.08, 5)).toBe(0.08);
  });
});
