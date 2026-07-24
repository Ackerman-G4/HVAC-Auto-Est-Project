export const parsePricingDraftValue = (value: string): { valid: boolean; value: number | null } => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { valid: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { valid: false, value: null };
  }

  return { valid: true, value: parsed };
};
