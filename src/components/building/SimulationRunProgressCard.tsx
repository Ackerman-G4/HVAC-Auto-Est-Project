'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import TierBadge from '@/components/simulation/TierBadge';
import { RunProgressRing, phaseFromStatus } from '@/components/simulation/RunProgressRing';

interface ResidualSnapshotLike {
  continuity?: number;
  momentum?: number;
  momentumX?: number;
  momentumY?: number;
  momentumZ?: number;
  energy?: number;
  k?: number;
  epsilon?: number;
}

interface SimulationRunProgressCardProps {
  title?: string;
  status: string;
  iteration: number;
  totalIterations: number;
  elapsedSeconds?: number;
  source?: string;
  residual?: ResidualSnapshotLike | null;
  errorMessage?: string;
  successMessage?: string;
  className?: string;
  compact?: boolean;
}

function formatExp(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  return value.toExponential(2);
}

function normalizePercent(iteration: number, totalIterations: number): number {
  if (totalIterations <= 0) {
    return 0;
  }
  const raw = (iteration / totalIterations) * 100;
  return Math.max(0, Math.min(100, raw));
}

// OpenFOAM (Engineering) runs have a lifecycle, not an iteration counter
// (plan §4.3): queued → meshing → solving → done.
const OPENFOAM_STEPS = ['Queued', 'Meshing', 'Solving', 'Done'] as const;

function openfoamStepIndex(status: string): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'running':
      return 2; // meshing is transient; treat an active cloud run as solving
    case 'completed':
      return 3;
    default:
      return 0;
  }
}

function OpenFOAMLifecycle({ status }: { status: string }) {
  const failed = status === 'failed' || status === 'cancelled';
  const activeIndex = openfoamStepIndex(status);
  return (
    <div className="mt-3 flex items-center gap-1.5" aria-label="OpenFOAM run lifecycle">
      {OPENFOAM_STEPS.map((label, index) => {
        const reached = !failed && index <= activeIndex;
        const current = !failed && index === activeIndex && status !== 'completed';
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                'h-1.5 w-full rounded-full transition-colors',
                failed ? 'bg-destructive/40' : reached ? 'bg-accent' : 'bg-secondary',
                current && 'animate-pulse',
              )}
            />
            <span
              className={cn(
                'text-[9px]',
                reached ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function SimulationRunProgressCard({
  title = 'Run Progress',
  status,
  iteration,
  totalIterations,
  elapsedSeconds,
  source,
  residual,
  errorMessage,
  successMessage,
  className,
  compact = false,
}: SimulationRunProgressCardProps) {
  const percent = normalizePercent(iteration, totalIterations);
  const isOpenFOAM = source === 'openfoam';

  const residualFields: Array<{ key: string; label: string; value?: number }> = [
    { key: 'continuity', label: 'Cont', value: residual?.continuity },
    { key: 'momentumX', label: 'Mom-X', value: residual?.momentumX ?? residual?.momentum },
    { key: 'momentumY', label: 'Mom-Y', value: residual?.momentumY ?? residual?.momentum },
    { key: 'energy', label: 'Energy', value: residual?.energy },
    { key: 'k', label: 'k', value: residual?.k },
  ];

  const visibleResiduals = residualFields.filter((item) => typeof item.value === 'number');

  return (
    <div className={cn('rounded-md border border-border/70 bg-card p-4 shadow-sm', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Activity size={14} /> {title}
      </h3>

      {!compact && (
        <div className="mb-4 flex justify-center">
          <RunProgressRing
            phase={phaseFromStatus(status, source, percent)}
            percent={isOpenFOAM ? undefined : percent}
          />
        </div>
      )}

      <div className={cn('grid gap-3 text-xs', compact ? 'grid-cols-2' : 'grid-cols-4')}>
        <div>
          <span className="text-muted-foreground">Status</span>
          <p className="font-mono capitalize">{status}</p>
        </div>
        {!isOpenFOAM && (
          <div>
            <span className="text-muted-foreground">Iteration</span>
            <p className="font-mono">{iteration} / {totalIterations}</p>
          </div>
        )}
        {typeof elapsedSeconds === 'number' && (
          <div>
            <span className="text-muted-foreground">Elapsed</span>
            <p className="font-mono">{elapsedSeconds.toFixed(1)}s</p>
          </div>
        )}
        {source && (
          <div>
            <span className="text-muted-foreground">Tier</span>
            <p className="mt-0.5"><TierBadge tier={source} /></p>
          </div>
        )}
      </div>

      {isOpenFOAM ? (
        <OpenFOAMLifecycle status={status} />
      ) : (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {visibleResiduals.length > 0 && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <p className="text-[10px] font-medium text-muted-foreground">Latest Residuals</p>
          <div className={cn('mt-1 grid gap-2 text-[10px] font-mono', compact ? 'grid-cols-2' : 'grid-cols-5')}>
            {visibleResiduals.map((item) => (
              <span key={item.key}>{item.label}: {formatExp(item.value)}</span>
            ))}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle size={12} /> {errorMessage}
        </div>
      )}

      {successMessage && !errorMessage && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 size={12} /> {successMessage}
        </div>
      )}
    </div>
  );
}
