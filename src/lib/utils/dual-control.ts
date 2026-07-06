export type DualValueSource = 'suggested' | 'override';

export interface DualValueResult<T> {
  suggested: T;
  override: T | null;
  final: T;
  isOverridden: boolean;
  source: DualValueSource;
}

export function hasUserOverride<T>(overrideValue: T | null | undefined): overrideValue is T {
  return overrideValue !== null && overrideValue !== undefined;
}

export function resolveFinalValue<T>(suggestedValue: T, overrideValue: T | null | undefined): T {
  return hasUserOverride(overrideValue) ? overrideValue : suggestedValue;
}

export function finalizeDualValue<T>(
  suggestedValue: T,
  overrideValue: T | null | undefined
): DualValueResult<T> {
  const isOverridden = hasUserOverride(overrideValue);
  return {
    suggested: suggestedValue,
    override: isOverridden ? overrideValue : null,
    final: isOverridden ? overrideValue : suggestedValue,
    isOverridden,
    source: isOverridden ? 'override' : 'suggested',
  };
}

export function resolveFinalNumber(
  suggestedValue: number,
  overrideValue: number | null | undefined
): number {
  return resolveFinalValue(suggestedValue, overrideValue);
}
