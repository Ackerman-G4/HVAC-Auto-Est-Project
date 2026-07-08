'use client';

/**
 * TierBadge — the solver tier is always visible on a run (plan §6.2):
 * PREVIEW in muted, ENGINEERING in jade. Accepts either the solver backend or a
 * RunSource so it can be dropped anywhere a run or case is shown.
 */

import { cn } from '@/lib/utils/cn';
import type { RunSource, SolverBackend } from '@/types/simulation';

export function resolveTier(input: SolverBackend | RunSource | string | undefined): SolverBackend {
  if (input === 'engineering' || input === 'openfoam') return 'engineering';
  return 'preview';
}

export default function TierBadge({
  tier,
  className,
}: {
  tier: SolverBackend | RunSource | string | undefined;
  className?: string;
}) {
  const resolved = resolveTier(tier);
  const isEngineering = resolved === 'engineering';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        isEngineering
          ? 'bg-accent/15 text-accent-dark ring-1 ring-accent/30'
          : 'bg-muted/60 text-muted-foreground ring-1 ring-border/60',
        className,
      )}
      title={isEngineering ? 'Engineering tier — OpenFOAM cloud solve' : 'Preview tier — instant in-browser solve'}
    >
      {isEngineering ? 'Engineering' : 'Preview'}
    </span>
  );
}
