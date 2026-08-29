/**
 * The four dual-control multipliers that scale every bill of quantities.
 *
 * Extracted from the BOQ route by REMEDIATION_PLAN.md TASK 3.2. Both entry
 * points resolved the policy, and both did it by calling the same four
 * `finalizeDualValue` lines inline — so a change to how a policy value is
 * defaulted had to be made twice, in a 469-line file, to stay consistent.
 *
 * Every value here multiplies into a currency total, so the defaults are stated
 * once and the resolution is one function with one test.
 */

import { finalizeDualValue } from '@/lib/utils/dual-control';
import type { DualValueResult } from '@/lib/utils/dual-control';

/**
 * Applied when a project carries no suggestion of its own.
 *
 * `vatRate` is 0.12 because Philippine VAT is 12 %; the other three are
 * commercial conventions, not statutory, and a project is expected to override
 * them once its own rates are known.
 */
export const DEFAULT_PRICING_POLICY = {
  laborMultiplier: 0.35,
  overheadPercent: 0.15,
  contingencyPercent: 0.05,
  vatRate: 0.12,
} as const;

/** The project fields the policy is derived from. */
export interface ProjectPricingFields {
  suggestedLaborMultiplier?: number;
  laborMultiplierOverride?: number | null;
  suggestedOverheadPercent?: number;
  overheadPercentOverride?: number | null;
  suggestedContingencyPercent?: number;
  contingencyPercentOverride?: number | null;
  suggestedVatRate?: number;
  vatRateOverride?: number | null;
}

export interface ResolvedPricingPolicy {
  readonly laborMultiplier: DualValueResult<number>;
  readonly overheadPercent: DualValueResult<number>;
  readonly contingencyPercent: DualValueResult<number>;
  readonly vatRate: DualValueResult<number>;
}

/**
 * Resolve suggestion-plus-override into a final figure for each multiplier.
 *
 * `??` rather than `||` throughout: a legitimate 0 overhead or 0 VAT must
 * survive. `||` would silently replace an exempt project's 0 % VAT with 12 %,
 * which is a wrong currency total rather than a wrong setting.
 */
export function resolvePricingPolicy(
  project: ProjectPricingFields | null,
): ResolvedPricingPolicy {
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

/** The wire shape for a resolved policy: all four, each with its provenance. */
export function serialisePricingPolicy(policy: ResolvedPricingPolicy) {
  const one = (value: DualValueResult<number>) => ({
    suggested: value.suggested,
    override: value.override,
    final: value.final,
    isOverridden: value.isOverridden,
  });

  return {
    laborMultiplier: one(policy.laborMultiplier),
    overheadPercent: one(policy.overheadPercent),
    contingencyPercent: one(policy.contingencyPercent),
    vatRate: one(policy.vatRate),
  };
}
