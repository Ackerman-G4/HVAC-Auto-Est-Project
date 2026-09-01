/**
 * The four rates that turn a bill of quantities into a price.
 *
 * Extracted from the BOQ route (TASK 3.2). Each rate is a dual-control value:
 * a suggested figure the system derives, and an optional override an estimator
 * sets. `finalizeDualValue` decides which applies and records that it was
 * overridden, so a quotation can show both.
 *
 * These live outside the handler because GET and POST both need them and were
 * each resolving them independently — two code paths deciding the multipliers
 * that scale a currency total.
 */

import { finalizeDualValue } from '@/lib/utils/dual-control';

/**
 * Fallbacks for a project that has never had rates set.
 *
 * Philippine construction defaults: 35% labour on equipment and materials,
 * 15% overhead, 5% contingency, and the 12% statutory VAT rate.
 */
export const DEFAULT_PRICING_POLICY = {
  laborMultiplier: 0.35,
  overheadPercent: 0.15,
  contingencyPercent: 0.05,
  vatRate: 0.12,
} as const;

/** The rate fields a project record carries, suggested and overridden. */
export interface ProjectPricing {
  suggestedLaborMultiplier: number;
  laborMultiplierOverride: number | null;
  suggestedOverheadPercent: number;
  overheadPercentOverride: number | null;
  suggestedContingencyPercent: number;
  contingencyPercentOverride: number | null;
  suggestedVatRate: number;
  vatRateOverride: number | null;
}

export type ResolvedPricingPolicy = ReturnType<typeof resolvePricingPolicy>;

/**
 * Resolve every rate to its final value.
 *
 * A `null` project resolves to the defaults rather than throwing: the caller
 * has already established the project exists and is reachable, and a project
 * saved before these fields existed legitimately carries none of them.
 */
export function resolvePricingPolicy(project: ProjectPricing | null) {
  return {
    laborMultiplier: finalizeDualValue(
      project?.suggestedLaborMultiplier ?? DEFAULT_PRICING_POLICY.laborMultiplier,
      project?.laborMultiplierOverride,
    ),
    overheadPercent: finalizeDualValue(
      project?.suggestedOverheadPercent ?? DEFAULT_PRICING_POLICY.overheadPercent,
      project?.overheadPercentOverride,
    ),
    contingencyPercent: finalizeDualValue(
      project?.suggestedContingencyPercent ?? DEFAULT_PRICING_POLICY.contingencyPercent,
      project?.contingencyPercentOverride,
    ),
    vatRate: finalizeDualValue(
      project?.suggestedVatRate ?? DEFAULT_PRICING_POLICY.vatRate,
      project?.vatRateOverride,
    ),
  };
}

/** The wire shape for one rate, as the client renders it. */
export interface DualRateView {
  suggested: number;
  override: number | null;
  final: number;
  isOverridden: boolean;
}

/**
 * Flatten a resolved policy for the response body.
 *
 * The route wrote this out field by field, four times over, which is four
 * chances to return `final` where `suggested` belonged.
 */
export function toPricingPolicyView(policy: ResolvedPricingPolicy): Record<string, DualRateView> {
  const view = (rate: ResolvedPricingPolicy['laborMultiplier']): DualRateView => ({
    suggested: rate.suggested,
    override: rate.override,
    final: rate.final,
    isOverridden: rate.isOverridden,
  });

  return {
    laborMultiplier: view(policy.laborMultiplier),
    overheadPercent: view(policy.overheadPercent),
    contingencyPercent: view(policy.contingencyPercent),
    vatRate: view(policy.vatRate),
  };
}
