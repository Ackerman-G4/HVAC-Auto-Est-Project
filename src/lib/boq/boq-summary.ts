/**
 * The BOQ read model: rolling stored items up into the totals a client shows.
 *
 * Extracted from the BOQ route's GET (TASK 3.2). This is a money path — every
 * figure here lands in a quotation — so it is separated from the handler in
 * order to be testable without a request.
 *
 * Note the asymmetry this preserves: GET recomputes totals by summing stored
 * item rows, while POST's totals come from `compileBOQ`. Two code paths produce
 * the same currency figures. That is pre-existing and out of scope here, but it
 * is the reason `boqTotals` asserts its own arithmetic rather than trusting the
 * caller to have summed correctly.
 */

import { safeDivide } from '@/lib/engine/numeric-guards';
import type { ResolvedPricingPolicy } from './pricing-policy';

/** One stored BOQ row, as the estimation store returns it. */
export interface StoredBoqItem {
  id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  suggestedUnitPrice: number;
  suggestedTotalPrice: number;
  userUnitPriceOverride: number | null;
  userTotalPriceOverride: number | null;
  finalUnitPrice: number;
  finalTotalPrice: number;
  unitPrice: number;
  totalPrice: number;
  sourceState: string;
  isOverridden: boolean;
  overrideReason: string;
  category: string;
  notes: string;
}

/**
 * A stored zero means "not yet computed", not "free".
 *
 * Rows written before the dual-price columns existed carry zero in them, so
 * these fall back to the legacy single-price column. Reading the zero
 * literally would silently price those lines at nothing.
 */
export function suggestedUnitPriceOf(item: StoredBoqItem): number {
  return item.suggestedUnitPrice === 0 ? item.unitPrice : item.suggestedUnitPrice;
}

export function suggestedTotalPriceOf(item: StoredBoqItem): number {
  return item.suggestedTotalPrice === 0
    ? suggestedUnitPriceOf(item) * item.quantity
    : item.suggestedTotalPrice;
}

export function finalUnitPriceOf(item: StoredBoqItem): number {
  return item.finalUnitPrice === 0
    ? (item.userUnitPriceOverride ?? item.unitPrice)
    : item.finalUnitPrice;
}

export function finalTotalPriceOf(item: StoredBoqItem): number {
  return item.finalTotalPrice === 0
    ? finalUnitPriceOf(item) * item.quantity
    : item.finalTotalPrice;
}

export interface BoqTotals {
  equipmentCost: number;
  materialCost: number;
  laborCost: number;
  subtotal: number;
  overhead: number;
  contingency: number;
  vat: number;
  grandTotal: number;
  totalCapacityTR: number;
  costPerTR: number;
}

/**
 * Total refrigeration capacity, read out of the equipment descriptions.
 *
 * This parses a number out of a display string, which is fragile: a row
 * described "3.5 Ton" rather than "3.5 TR" contributes nothing, and the figure
 * silently understates. The capacity belongs in a column of its own.
 * Preserved as-is here because changing it changes stored data; recorded in
 * `docs/audit/division-audit.md` as a follow-up rather than altered inside a
 * refactor that is meant to be behaviour-preserving.
 */
export function totalCapacityTrFromDescriptions(items: StoredBoqItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.category !== 'equipment') continue;
    const match = item.description.match(/(\d+\.?\d*)\s*TR/);
    if (!match?.[1]) continue;
    const capacity = Number.parseFloat(match[1]);
    if (!Number.isFinite(capacity)) continue;
    total += capacity * item.quantity;
  }
  return total;
}

/**
 * Roll stored rows up into the quotation totals.
 *
 * Order matters and is fixed by how a bill is priced: overhead and contingency
 * apply to the subtotal, and VAT applies to the result — VAT on overhead is
 * correct, overhead on VAT is not.
 */
export function boqTotals(items: StoredBoqItem[], policy: ResolvedPricingPolicy): BoqTotals {
  const sumCategory = (category: string) =>
    items
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + finalTotalPriceOf(item), 0);

  const equipmentCost = sumCategory('equipment');
  const materialCost = sumCategory('material');
  const laborCost = sumCategory('labor');

  const subtotal = equipmentCost + materialCost + laborCost;
  const overhead = subtotal * policy.overheadPercent.final;
  const contingency = subtotal * policy.contingencyPercent.final;
  const beforeVat = subtotal + overhead + contingency;
  const vat = beforeVat * policy.vatRate.final;
  const grandTotal = beforeVat + vat;

  const totalCapacityTR = totalCapacityTrFromDescriptions(items);

  // A bill with no parseable capacity yields no cost-per-ton rather than an
  // infinite one. Guarded rather than reported, because zero capacity is the
  // normal state of a materials-only bill, not a fault.
  const costPerTR =
    totalCapacityTR > 0
      ? safeDivide(grandTotal, totalCapacityTR, 'boqSummary.costPerTR', { requirePositive: true })
      : 0;

  return {
    equipmentCost,
    materialCost,
    laborCost,
    subtotal,
    overhead,
    contingency,
    vat,
    grandTotal,
    totalCapacityTR,
    costPerTR,
  };
}

/** One row as the client renders it. */
export interface BoqItemView {
  id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  suggestedUnitPrice: number;
  suggestedTotalPrice: number;
  userUnitPriceOverride: number | null;
  userTotalPriceOverride: number | null;
  finalUnitPrice: number;
  finalTotalPrice: number;
  unitPrice: number;
  totalPrice: number;
  sourceState: string;
  isOverridden: boolean;
  overrideReason: string;
  category: string;
  floorName: string;
}

export function toBoqItemView(item: StoredBoqItem): BoqItemView {
  const finalUnit = finalUnitPriceOf(item);
  const finalTotal = finalTotalPriceOf(item);

  return {
    id: item.id,
    section: item.section,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    suggestedUnitPrice: suggestedUnitPriceOf(item),
    suggestedTotalPrice: suggestedTotalPriceOf(item),
    userUnitPriceOverride: item.userUnitPriceOverride,
    userTotalPriceOverride: item.userTotalPriceOverride,
    finalUnitPrice: finalUnit,
    finalTotalPrice: finalTotal,
    // `unitPrice`/`totalPrice` mirror the final figures for older clients that
    // read the single-price columns.
    unitPrice: finalUnit,
    totalPrice: finalTotal,
    sourceState: item.sourceState,
    isOverridden: item.isOverridden,
    overrideReason: item.overrideReason,
    category: item.category,
    floorName: item.notes || '',
  };
}
