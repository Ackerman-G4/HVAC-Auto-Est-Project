/**
 * Bill of quantities totals, as read back for display.
 *
 * Extracted from the BOQ route by REMEDIATION_PLAN.md TASK 3.2. This is the
 * money path: every figure here is a currency amount shown to a client, and it
 * was computed inside a route handler where none of it could be tested without
 * an HTTP request against Firestore.
 *
 * The zero-means-unset convention below is inherited, not invented. Stored rows
 * carry 0 in the "final" columns until a price is resolved, so a 0 has to be
 * read as absent rather than as free.
 */

import { safeDivide } from '@/lib/engine/numeric-guards';
import type { ResolvedPricingPolicy } from './boq-pricing-policy';

/** The stored columns the summary reads. Structural, so the store type is free to carry more. */
export interface BoqSummaryRow {
  readonly id: string;
  readonly section: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit: string;
  readonly category: string;
  readonly unitPrice: number;
  readonly suggestedUnitPrice: number;
  readonly suggestedTotalPrice: number;
  readonly userUnitPriceOverride: number | null;
  readonly userTotalPriceOverride: number | null;
  readonly finalUnitPrice: number;
  readonly finalTotalPrice: number;
  readonly sourceState: string;
  readonly isOverridden: boolean;
  readonly overrideReason: string;
  readonly notes?: string;
}

/** A stored 0 means "not yet resolved", so fall back rather than charge nothing. */
function suggestedUnitPriceOf(row: BoqSummaryRow): number {
  return row.suggestedUnitPrice === 0 ? row.unitPrice : row.suggestedUnitPrice;
}

function finalUnitPriceOf(row: BoqSummaryRow): number {
  return row.finalUnitPrice === 0
    ? (row.userUnitPriceOverride ?? row.unitPrice)
    : row.finalUnitPrice;
}

function finalTotalPriceOf(row: BoqSummaryRow): number {
  return row.finalTotalPrice === 0
    ? finalUnitPriceOf(row) * row.quantity
    : row.finalTotalPrice;
}

/**
 * Tons of refrigeration parsed out of an equipment description, e.g. "5.0 TR".
 *
 * Fragile by construction: capacity is recovered from prose rather than read
 * from a column, so a description that renders the unit differently contributes
 * nothing and silently lowers the total. Preserved exactly as it behaved inside
 * the route — correcting it means adding a capacity column to the stored row,
 * which is a schema change and not part of extracting this function.
 */
const CAPACITY_TR_PATTERN = /(\d+\.?\d*)\s*TR/;

export function totalCapacityTr(rows: readonly BoqSummaryRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.category !== 'equipment') continue;
    const capacity = CAPACITY_TR_PATTERN.exec(row.description)?.[1];
    if (capacity === undefined) continue;

    const parsed = parseFloat(capacity);
    // parseFloat returns NaN for anything it cannot read, and NaN would
    // propagate through the total into cost per ton without raising.
    if (!Number.isFinite(parsed)) continue;

    total += parsed * row.quantity;
  }
  return total;
}

export interface BoqTotals {
  readonly equipmentCost: number;
  readonly materialCost: number;
  readonly laborCost: number;
  readonly subtotal: number;
  readonly overhead: number;
  readonly contingency: number;
  readonly vat: number;
  readonly grandTotal: number;
  readonly costPerTR: number;
}

/**
 * Compose the client-facing totals.
 *
 * Order matters and is the commercial convention: overhead and contingency both
 * apply to the subtotal rather than compounding on each other, and VAT applies
 * to the sum of all three. Computing VAT on the subtotal alone would understate
 * it; compounding contingency on overhead would overstate the lot.
 */
export function computeBoqTotals(
  rows: readonly BoqSummaryRow[],
  policy: ResolvedPricingPolicy,
): BoqTotals {
  const sumByCategory = (category: string) =>
    rows.filter((row) => row.category === category).reduce((sum, row) => sum + finalTotalPriceOf(row), 0);

  const equipmentCost = sumByCategory('equipment');
  const materialCost = sumByCategory('material');
  const laborCost = sumByCategory('labor');

  const subtotal = equipmentCost + materialCost + laborCost;
  const overhead = subtotal * policy.overheadPercent.final;
  const contingency = subtotal * policy.contingencyPercent.final;
  const beforeVat = subtotal + overhead + contingency;
  const vat = beforeVat * policy.vatRate.final;
  const grandTotal = beforeVat + vat;

  const capacityTr = totalCapacityTr(rows);
  // A bill with no parsable capacity has no cost per ton. Reporting 0 is the
  // inherited behaviour and is honest here: it reads as "not available", where
  // an unguarded divide would report Infinity pesos per ton.
  const costPerTR =
    capacityTr > 0
      ? safeDivide(grandTotal, capacityTr, 'boq.costPerTR', { requirePositive: true })
      : 0;

  return {
    equipmentCost, materialCost, laborCost, subtotal,
    overhead, contingency, vat, grandTotal, costPerTR,
  };
}

/** Rounded to whole pesos, which is how every figure is presented. */
export function roundTotals(totals: BoqTotals): BoqTotals {
  return {
    equipmentCost: Math.round(totals.equipmentCost),
    materialCost: Math.round(totals.materialCost),
    laborCost: Math.round(totals.laborCost),
    subtotal: Math.round(totals.subtotal),
    overhead: Math.round(totals.overhead),
    contingency: Math.round(totals.contingency),
    vat: Math.round(totals.vat),
    grandTotal: Math.round(totals.grandTotal),
    costPerTR: Math.round(totals.costPerTR),
  };
}

/** The per-row wire shape, with the zero-means-unset fallbacks resolved. */
export function serialiseBoqRow(row: BoqSummaryRow) {
  return {
    id: row.id,
    section: row.section,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    suggestedUnitPrice: suggestedUnitPriceOf(row),
    suggestedTotalPrice:
      row.suggestedTotalPrice === 0
        ? suggestedUnitPriceOf(row) * row.quantity
        : row.suggestedTotalPrice,
    userUnitPriceOverride: row.userUnitPriceOverride,
    userTotalPriceOverride: row.userTotalPriceOverride,
    finalUnitPrice: finalUnitPriceOf(row),
    finalTotalPrice: finalTotalPriceOf(row),
    unitPrice: finalUnitPriceOf(row),
    totalPrice: finalTotalPriceOf(row),
    sourceState: row.sourceState,
    isOverridden: row.isOverridden,
    overrideReason: row.overrideReason,
    category: row.category,
    floorName: row.notes || '',
  };
}
