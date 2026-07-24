export const BACKFILL_STATUS_STORAGE_KEY = 'hvac-simulation-report-backfill-status:v1';

export interface BackfillRunStatus {
  attemptedAt: string;
  checkedCount: number;
  updatedCount: number;
  skippedCount: number;
  ok: boolean;
  message?: string;
}

export function normalizeBackfillRunStatus(value: unknown): BackfillRunStatus | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const attemptedAt = typeof candidate.attemptedAt === 'string' ? candidate.attemptedAt : '';
  const checkedCount = typeof candidate.checkedCount === 'number' ? candidate.checkedCount : NaN;
  const updatedCount = typeof candidate.updatedCount === 'number' ? candidate.updatedCount : NaN;
  const skippedCount = typeof candidate.skippedCount === 'number' ? candidate.skippedCount : NaN;
  const ok = candidate.ok === true || candidate.ok === false ? candidate.ok : null;

  if (!attemptedAt || Number.isNaN(Date.parse(attemptedAt))) {
    return null;
  }

  if (!Number.isFinite(checkedCount) || !Number.isFinite(updatedCount) || !Number.isFinite(skippedCount)) {
    return null;
  }

  if (ok === null) {
    return null;
  }

  return {
    attemptedAt,
    checkedCount: Math.max(0, Math.trunc(checkedCount)),
    updatedCount: Math.max(0, Math.trunc(updatedCount)),
    skippedCount: Math.max(0, Math.trunc(skippedCount)),
    ok,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  };
}
