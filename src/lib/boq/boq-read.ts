/**
 * The BOQ read model's wire shape.
 *
 * Extracted from the route's GET (TASK 3.2) so the response body — which is a
 * money document — can be asserted directly, without constructing a request or
 * standing up Firestore.
 */

import { buildBoqVerification } from '@/lib/functions/boq-integrity';
import { resolvePricingPolicy, toPricingPolicyView, type ProjectPricing } from './pricing-policy';
import { boqTotals, toBoqItemView, type StoredBoqItem } from './boq-summary';

type Verification = ReturnType<typeof buildBoqVerification>;
type LatestSnapshot = Parameters<typeof buildBoqVerification>[1];

/**
 * Assemble the GET response.
 *
 * Currency figures are rounded to whole pesos at the boundary only. The totals
 * are summed at full precision first, so rounding each line and summing the
 * rounded values — which drifts by up to half a peso per line — cannot happen.
 */
export function buildBoqSummaryResponse(
  items: StoredBoqItem[],
  project: ProjectPricing | null,
  latestSnapshot: LatestSnapshot,
): {
  items: ReturnType<typeof toBoqItemView>[];
  equipmentCost: number;
  materialCost: number;
  laborCost: number;
  overhead: number;
  contingency: number;
  subtotal: number;
  vat: number;
  grandTotal: number;
  costPerTR: number;
  pricingPolicy: ReturnType<typeof toPricingPolicyView>;
  verification: Verification;
} {
  const policy = resolvePricingPolicy(project);
  const totals = boqTotals(items, policy);

  return {
    items: items.map(toBoqItemView),
    equipmentCost: Math.round(totals.equipmentCost),
    materialCost: Math.round(totals.materialCost),
    laborCost: Math.round(totals.laborCost),
    overhead: Math.round(totals.overhead),
    contingency: Math.round(totals.contingency),
    subtotal: Math.round(totals.subtotal),
    vat: Math.round(totals.vat),
    grandTotal: Math.round(totals.grandTotal),
    costPerTR: Math.round(totals.costPerTR),
    pricingPolicy: toPricingPolicyView(policy),
    verification: buildBoqVerification(items, latestSnapshot),
  };
}
