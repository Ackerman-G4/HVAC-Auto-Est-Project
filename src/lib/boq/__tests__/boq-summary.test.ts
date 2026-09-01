import { describe, expect, it } from 'vitest';
import {
  boqTotals,
  finalTotalPriceOf,
  finalUnitPriceOf,
  suggestedTotalPriceOf,
  suggestedUnitPriceOf,
  toBoqItemView,
  totalCapacityTrFromDescriptions,
  type StoredBoqItem,
} from '../boq-summary';
import { resolvePricingPolicy } from '../pricing-policy';
import { CalculationError } from '@/lib/engine/numeric-guards';

/**
 * The BOQ read model — every figure here lands in a quotation.
 *
 * This lived inside a 470-line route handler, reachable only through an
 * authenticated request against a live Firestore, so none of it had ever been
 * asserted. These test the arithmetic and the fallback semantics rather than
 * pinning today's numbers.
 */

function item(overrides: Partial<StoredBoqItem> = {}): StoredBoqItem {
  return {
    id: 'item-1',
    section: 'A',
    description: 'Split type unit',
    quantity: 1,
    unit: 'set',
    suggestedUnitPrice: 100,
    suggestedTotalPrice: 100,
    userUnitPriceOverride: null,
    userTotalPriceOverride: null,
    finalUnitPrice: 100,
    finalTotalPrice: 100,
    unitPrice: 100,
    totalPrice: 100,
    sourceState: 'suggested',
    isOverridden: false,
    overrideReason: '',
    category: 'equipment',
    notes: '',
    ...overrides,
  };
}

/** Zero rates isolate the line arithmetic from the markup arithmetic. */
const noMarkup = resolvePricingPolicy({
  suggestedLaborMultiplier: 0,
  laborMultiplierOverride: null,
  suggestedOverheadPercent: 0,
  overheadPercentOverride: null,
  suggestedContingencyPercent: 0,
  contingencyPercentOverride: null,
  suggestedVatRate: 0,
  vatRateOverride: null,
});

describe('a stored zero means not-yet-computed, not free', () => {
  it('falls back to the legacy unit price when the suggested column is zero', () => {
    // Rows written before the dual-price columns existed carry zero there.
    // Reading it literally prices the line at nothing.
    expect(suggestedUnitPriceOf(item({ suggestedUnitPrice: 0, unitPrice: 250 }))).toBe(250);
  });

  it('derives a suggested total from unit price and quantity when absent', () => {
    expect(
      suggestedTotalPriceOf(item({ suggestedTotalPrice: 0, suggestedUnitPrice: 50, quantity: 4 })),
    ).toBe(200);
  });

  it('prefers an estimator override over the legacy price when the final is zero', () => {
    expect(finalUnitPriceOf(item({ finalUnitPrice: 0, userUnitPriceOverride: 900, unitPrice: 100 })))
      .toBe(900);
  });

  it('falls back to the legacy price when there is no override either', () => {
    expect(finalUnitPriceOf(item({ finalUnitPrice: 0, userUnitPriceOverride: null, unitPrice: 100 })))
      .toBe(100);
  });

  it('treats a genuine zero override as an override, not as absent', () => {
    // An estimator zeroing a line is a real decision — a supplied item, say.
    // `??` rather than `||` is what makes this work.
    expect(finalUnitPriceOf(item({ finalUnitPrice: 0, userUnitPriceOverride: 0, unitPrice: 100 })))
      .toBe(0);
  });

  it('derives a final total from the resolved unit price and quantity', () => {
    expect(
      finalTotalPriceOf(item({ finalTotalPrice: 0, finalUnitPrice: 0, unitPrice: 75, quantity: 3 })),
    ).toBe(225);
  });
});

describe('rolling lines up into a quotation', () => {
  it('sums each category independently', () => {
    const totals = boqTotals(
      [
        item({ category: 'equipment', finalTotalPrice: 1000 }),
        item({ category: 'material', finalTotalPrice: 400 }),
        item({ category: 'labor', finalTotalPrice: 300 }),
      ],
      noMarkup,
    );

    expect(totals.equipmentCost).toBe(1000);
    expect(totals.materialCost).toBe(400);
    expect(totals.laborCost).toBe(300);
    expect(totals.subtotal).toBe(1700);
  });

  it('ignores a category the bill does not price', () => {
    const totals = boqTotals([item({ category: 'note', finalTotalPrice: 999 })], noMarkup);
    expect(totals.subtotal).toBe(0);
  });

  it('applies VAT to the marked-up subtotal, not to the bare subtotal', () => {
    // The ordering is the whole point: VAT on overhead is correct, overhead on
    // VAT is not. With 10% overhead, 10% contingency and 12% VAT on 1000:
    // subtotal 1000, overhead 100, contingency 100, beforeVat 1200, vat 144.
    const policy = resolvePricingPolicy({
      suggestedLaborMultiplier: 0,
      laborMultiplierOverride: null,
      suggestedOverheadPercent: 0.1,
      overheadPercentOverride: null,
      suggestedContingencyPercent: 0.1,
      contingencyPercentOverride: null,
      suggestedVatRate: 0.12,
      vatRateOverride: null,
    });

    const totals = boqTotals([item({ finalTotalPrice: 1000 })], policy);

    expect(totals.overhead).toBeCloseTo(100, 9);
    expect(totals.contingency).toBeCloseTo(100, 9);
    expect(totals.vat).toBeCloseTo(144, 9);
    expect(totals.grandTotal).toBeCloseTo(1344, 9);
  });

  it('computes overhead and contingency from the subtotal, not from each other', () => {
    const policy = resolvePricingPolicy({
      suggestedLaborMultiplier: 0,
      laborMultiplierOverride: null,
      suggestedOverheadPercent: 0.5,
      overheadPercentOverride: null,
      suggestedContingencyPercent: 0.5,
      contingencyPercentOverride: null,
      suggestedVatRate: 0,
      vatRateOverride: null,
    });

    const totals = boqTotals([item({ finalTotalPrice: 100 })], policy);
    // Both 50, not 50 and 75.
    expect(totals.overhead).toBeCloseTo(50, 9);
    expect(totals.contingency).toBeCloseTo(50, 9);
  });

  it('honours an estimator override of a rate', () => {
    const policy = resolvePricingPolicy({
      suggestedLaborMultiplier: 0,
      laborMultiplierOverride: null,
      suggestedOverheadPercent: 0.15,
      overheadPercentOverride: 0.05,
      suggestedContingencyPercent: 0,
      contingencyPercentOverride: null,
      suggestedVatRate: 0,
      vatRateOverride: null,
    });

    const totals = boqTotals([item({ finalTotalPrice: 1000 })], policy);
    expect(totals.overhead).toBeCloseTo(50, 9);
  });
});

describe('cost per ton of refrigeration', () => {
  it('reads capacity out of the equipment descriptions', () => {
    const items = [
      item({ category: 'equipment', description: '3.5 TR ducted split', quantity: 2 }),
      item({ category: 'equipment', description: '5 TR AHU', quantity: 1 }),
    ];
    expect(totalCapacityTrFromDescriptions(items)).toBeCloseTo(12, 9);
  });

  it('counts only equipment lines', () => {
    const items = [
      item({ category: 'equipment', description: '3 TR unit', quantity: 1 }),
      item({ category: 'material', description: '10 TR of pipe insulation', quantity: 1 }),
    ];
    expect(totalCapacityTrFromDescriptions(items)).toBeCloseTo(3, 9);
  });

  it('contributes nothing for a description that names no TR figure', () => {
    // Documents the fragility rather than implying it is safe: a line described
    // "3.5 Ton" is silently worth zero capacity.
    const items = [item({ category: 'equipment', description: '3.5 Ton cassette' })];
    expect(totalCapacityTrFromDescriptions(items)).toBe(0);
  });

  it('divides the grand total by the parsed capacity', () => {
    const totals = boqTotals(
      [item({ category: 'equipment', description: '2 TR unit', finalTotalPrice: 1000 })],
      noMarkup,
    );
    expect(totals.costPerTR).toBeCloseTo(500, 9);
  });

  it('reports zero rather than Infinity for a bill with no capacity', () => {
    // A materials-only bill is normal, not a fault — so this is guarded and
    // returns zero rather than raising.
    const totals = boqTotals([item({ category: 'material', finalTotalPrice: 500 })], noMarkup);
    expect(totals.costPerTR).toBe(0);
    expect(Number.isFinite(totals.costPerTR)).toBe(true);
  });

  it('never returns a non-finite cost per ton', () => {
    const totals = boqTotals([], noMarkup);
    expect(Number.isFinite(totals.costPerTR)).toBe(true);
    expect(() => boqTotals([], noMarkup)).not.toThrow(CalculationError);
  });
});

describe('the row a client renders', () => {
  it('mirrors the final figures onto the legacy single-price columns', () => {
    const view = toBoqItemView(item({ finalUnitPrice: 250, finalTotalPrice: 500, quantity: 2 }));
    expect(view.unitPrice).toBe(250);
    expect(view.totalPrice).toBe(500);
  });

  it('surfaces the stored note as the floor name', () => {
    expect(toBoqItemView(item({ notes: 'Second Floor' })).floorName).toBe('Second Floor');
  });

  it('returns an empty floor name rather than undefined when unset', () => {
    expect(toBoqItemView(item({ notes: '' })).floorName).toBe('');
  });
});
