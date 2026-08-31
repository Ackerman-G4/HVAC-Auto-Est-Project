'use client';

/**
 * RunProgressRing (plan §Phase 4). A single, legible progress ring with a live
 * stage label ("Meshing…", "Solving…", "Post-processing…") for a run in flight —
 * the moment the jet-seeded particles + PMV comfort work actually gets shown
 * off. The ring sweep is CSS-cheap (SVG stroke-dashoffset); a slow rotating
 * highlight conveys "working" and stops under prefers-reduced-motion.
 */

import { cn } from '@/lib/utils/cn';
import { usePrefersReducedMotion } from '@/lib/ui/motion';

export type RunPhase = 'queued' | 'meshing' | 'solving' | 'post' | 'done' | 'failed';

const PHASE_LABEL: Record<RunPhase, string> = {
  queued: 'Queued…',
  meshing: 'Meshing…',
  solving: 'Solving…',
  post: 'Post-processing…',
  done: 'Complete',
  failed: 'Failed',
};

const PHASE_ORDER: RunPhase[] = ['queued', 'meshing', 'solving', 'post', 'done'];

interface RunProgressRingProps {
  /** 0–100. When omitted, the ring shows indeterminate motion for the phase. */
  percent?: number | undefined;
  phase: RunPhase;
  size?: number | undefined;
  className?: string | undefined;
}

export function RunProgressRing({ percent, phase, size = 88, className }: RunProgressRingProps) {
  const reduced = usePrefersReducedMotion();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const failed = phase === 'failed';
  const done = phase === 'done';

  // Determinate when we have a percent; otherwise derive a coarse fill from the
  // phase so the ring still communicates forward progress mid-run.
  const phaseFraction =
    (Math.max(0, PHASE_ORDER.indexOf(phase)) + (done ? 1 : 0.5)) / PHASE_ORDER.length;
  const pct = failed ? 1 : typeof percent === 'number' ? Math.max(0, Math.min(1, percent / 100)) : phaseFraction;
  const offset = circumference * (1 - pct);
  const color = failed ? 'var(--destructive)' : done ? 'var(--accent)' : 'var(--accent)';
  const spinning = !reduced && !done && !failed;

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className={cn(spinning && 'origin-center')} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="color-mix(in oklab, var(--border) 80%, transparent)"
            strokeWidth={stroke}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.2,0,0,1)' }}
          />
          {/* Sweeping highlight while working */}
          {spinning && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.12} ${circumference}`}
              className="origin-center animate-spin"
              style={{ animationDuration: '1.4s', opacity: 0.5 }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold tabular-nums text-foreground">
            {failed ? '—' : `${Math.round(pct * 100)}%`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {spinning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
        <span
          className={cn(
            'text-xs font-medium',
            failed ? 'text-destructive' : done ? 'text-accent-dark' : 'text-foreground',
          )}
        >
          {PHASE_LABEL[phase]}
        </span>
      </div>
    </div>
  );
}

/** Map a coarse run status + optional iteration progress to a display phase. */
export function phaseFromStatus(
  status: string,
  source?: string,
  percent?: number,
): RunPhase {
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (status === 'completed') return 'done';
  if (status === 'pending' || status === 'queued') return 'queued';
  // running
  if (source === 'openfoam') {
    if (typeof percent === 'number' && percent < 8) return 'meshing';
    if (typeof percent === 'number' && percent > 92) return 'post';
    return 'solving';
  }
  return 'solving';
}
