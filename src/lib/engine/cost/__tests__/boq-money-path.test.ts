import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING_POLICY,
  resolvePricingPolicy,
  serialisePricingPolicy,
} from '../boq-pricing-policy';
import {
  computeBoqTotals,
  roundTotals,
  serialiseBoqRow,
  totalCapacityTr,
  type BoqSummaryRow,
} from '../boq-summary';
import { groupByFloor, requiresDuctwork, type SelectedEquipment } from '../boq-inputs';

/**
 * The bill of quantities money path, extracted from a 469-line route by
 * TASK 3.2. Every figure here is a currency amount shown to a client, and none
 * of it could previously be exercised without an HTTP request against Firestore.
 */

/** Explicit undefined models a column absent from the stored row. */
type Overrides<T> = { [K in keyof T]?: T[K] | undefined };

function row(over: Overrides<BoqSummaryRow> = {}): BoqSummaryRow {
  return {
    id: 'i1', section: 'A', description: 'Unit', quantity: 1, unit: 'set',
    category: 'equipment', unitPrice: 100, suggestedUnitPrice: 100,
    suggestedTotalPrice: 100, userUnitPriceOverride: null, userTotalPriceOverride: null,
    finalUnitPrice: 100, finalTotalPrice: 100, sourceState: 'suggested',
    isOverridden: false, overrideReason: '',
    ...over,
  } as BoqSummaryRow;
}

describe('pricing policy resolution', () => {
  it('falls back to the documented defaults when a project suggests nothing', () => {
    const policy = resolvePricingPolicy(null);
    expect(policy.vatRate.final).toBe(DEFAULT_PRICING_POLICY.vatRate);
    expect(policy.laborMultiplier.final).toBe(DEFAULT_PRICING_POLICY.laborMultiplier);
    expect(policy.vatRate.isOverridden).toBe(false);
  });

  it('prefers an override over a suggestion and records both', () => {
    const policy = resolvePricingPolicy({ suggestedVatRate: 0.12, vatRateOverride: 0.08 });
    expect(policy.vatRate.final).toBe(0.08);
    expect(policy.vatRate.suggested).toBe(0.12);
    expect(policy.vatRate.isOverridden).toBe(true);
  });

  it('keeps a legitimate zero rate instead of replacing it with the default', () => {
    // A VAT-exempt project suggests 0. `||` would silently restore 12% and
    // overstate every total; `??` preserves it.
    const policy = resolvePricingPolicy({ suggestedVatRate: 0 });
    expect(policy.vatRate.final).toBe(0);
  });

  it('keeps a zero override, which means the rate was deliberately removed', () => {
    const policy = resolvePricingPolicy({ suggestedOverheadPercent: 0.15, overheadPercentOverride: 0 });
    expect(policy.overheadPercent.final).toBe(0);
  });

  it('serialises all four multipliers with their provenance', () => {
    const wire = serialisePricingPolicy(resolvePricingPolicy({ vatRateOverride: 0.05 }));
    expect(Object.keys(wire)).toEqual([
      'laborMultiplier', 'overheadPercent', 'contingencyPercent', 'vatRate',
    ]);
    expect(wire.vatRate).toEqual({
      suggested: 0.12, override: 0.05, final: 0.05, isOverridden: true,
    });
  });
});

describe('totals compose in the commercial order', () => {
  const policy = resolvePricingPolicy({
    suggestedOverheadPercent: 0.1,
    suggestedContingencyPercent: 0.05,
    suggestedVatRate: 0.12,
  });

  const rows = [
    row({ id: 'e', category: 'equipment', finalTotalPrice: 1000 }),
    row({ id: 'm', category: 'material', finalTotalPrice: 500 }),
    row({ id: 'l', category: 'labor', finalTotalPrice: 500 }),
  ];

  it('applies overhead and contingency to the subtotal, not to each other', () => {
    const t = computeBoqTotals(rows, policy);
    expect(t.subtotal).toBe(2000);
    expect(t.overhead).toBeCloseTo(200);      // 10% of 2000, not of 2000+contingency
    expect(t.contingency).toBeCloseTo(100);   // 5% of 2000
  });

  it('applies VAT to subtotal plus overhead plus contingency', () => {
    const t = computeBoqTotals(rows, policy);
    // 2300 * 0.12 = 276. Charging VAT on the 2000 subtotal alone understates it.
    expect(t.vat).toBeCloseTo(276);
    expect(t.grandTotal).toBeCloseTo(2576);
  });

  it('separates the three cost categories', () => {
    const t = computeBoqTotals(rows, policy);
    expect(t.equipmentCost).toBe(1000);
    expect(t.materialCost).toBe(500);
    expect(t.laborCost).toBe(500);
  });

  it('rounds every presented figure to whole pesos', () => {
    const t = roundTotals(computeBoqTotals(rows, policy));
    expect(Number.isInteger(t.grandTotal)).toBe(true);
    expect(Number.isInteger(t.vat)).toBe(true);
  });
});

describe('a stored zero means unset, not free', () => {
  it('falls back to unitPrice when the final price has not been resolved', () => {
    const t = computeBoqTotals(
      [row({ finalTotalPrice: 0, finalUnitPrice: 0, unitPrice: 250, quantity: 2 })],
      resolvePricingPolicy(null),
    );
    // 0 would report the line as free; the fallback charges 250 x 2.
    expect(t.equipmentCost).toBe(500);
  });

  it('prefers a user override over the catalogue price when final is unset', () => {
    const serialised = serialiseBoqRow(
      row({
        finalUnitPrice: 0, finalTotalPrice: 0,
        userUnitPriceOverride: 400, unitPrice: 100, quantity: 3,
      }),
    );
    expect(serialised.finalUnitPrice).toBe(400);
    expect(serialised.finalTotalPrice).toBe(1200);
  });

  it('reports the floor name from the notes column', () => {
    expect(serialiseBoqRow(row({ notes: 'Level 3' })).floorName).toBe('Level 3');
    expect(serialiseBoqRow(row({ notes: undefined })).floorName).toBe('');
  });
});

describe('cost per ton of refrigeration', () => {
  it('divides the grand total by the parsed capacity', () => {
    const rows = [row({ description: '5.0 TR Split Unit', quantity: 2, finalTotalPrice: 1000 })];
    const t = computeBoqTotals(rows, resolvePricingPolicy({
      suggestedOverheadPercent: 0, suggestedContingencyPercent: 0, suggestedVatRate: 0,
    }));
    expect(totalCapacityTr(rows)).toBe(10);
    expect(t.costPerTR).toBeCloseTo(100);
  });

  it('reports zero rather than Infinity when no capacity can be parsed', () => {
    const rows = [row({ description: 'Ductwork', category: 'material', finalTotalPrice: 5000 })];
    const t = computeBoqTotals(rows, resolvePricingPolicy(null));
    expect(t.costPerTR).toBe(0);
    expect(Number.isFinite(t.costPerTR)).toBe(true);
  });

  it('counts only equipment rows toward capacity', () => {
    const rows = [
      row({ description: '5 TR Unit', category: 'equipment' }),
      row({ description: '3 TR of pipe insulation', category: 'material' }),
    ];
    expect(totalCapacityTr(rows)).toBe(5);
  });

  it('silently omits a description that does not spell the unit as TR', () => {
    // Capacity is recovered from prose rather than a column, so this understates
    // the total. Pinned as a known limitation of the inherited format.
    expect(totalCapacityTr([row({ description: '5 tons Split Unit' })])).toBe(0);
  });
});

describe('ductwork detection and floor grouping', () => {
  it('recognises the ducted equipment families', () => {
    expect(requiresDuctwork('ahu')).toBe(true);
    expect(requiresDuctwork('fcu')).toBe(true);
    expect(requiresDuctwork('ducted_split')).toBe(true);
  });

  it('recognises anything naming itself ducted, case-insensitively', () => {
    expect(requiresDuctwork('Concealed Ducted Type')).toBe(true);
  });

  it('excludes ductless equipment, which carries no sheet metal', () => {
    expect(requiresDuctwork('wall_mounted')).toBe(false);
    expect(requiresDuctwork('cassette')).toBe(false);
  });

  it('groups selections by floor, preserving order', () => {
    const sel = (floorName: string, model: string): SelectedEquipment => ({
      equipment: {
        manufacturer: 'X', model, type: 'cassette', capacityTR: 3, capacityBTU: 36000,
        capacityKW: 10, refrigerant: 'R32', eer: 12, unitPricePHP: 100000,
      },
      quantity: 1,
      floorName,
    });

    const groups = groupByFloor([sel('L1', 'a'), sel('L2', 'b'), sel('L1', 'c')]);
    expect([...groups.keys()]).toEqual(['L1', 'L2']);
    expect(groups.get('L1')).toHaveLength(2);
  });
});
