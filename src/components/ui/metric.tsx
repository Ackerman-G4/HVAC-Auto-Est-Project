'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Label + value + unit, with optional change indicator.
 *
 * The unit is typeset separately and never bolded, so a column of readings
 * lines up on the digits rather than on the start of the unit string. Values
 * are tabular by construction — this is the component that exists so numeric
 * readouts stop being hand-assembled with inconsistent numerals.
 *
 * For a figure whose derivation matters, wrap the value in `TraceableValue`.
 */

export interface MetricProps {
  label: string;
  /** Already formatted for display. */
  value: React.ReactNode;
  unit?: string;
  /**
   * Signed change. Sign carries the colour: positive is jade, negative is
   * vermilion. Pass `invertDelta` where an increase is the bad outcome.
   */
  delta?: number;
  /** Formats the delta; defaults to one decimal place with a sign. */
  formatDelta?: (n: number) => string;
  /** Treat a rising value as the undesirable direction (cost, energy use). */
  invertDelta?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const VALUE_SIZE = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
} as const;

function defaultFormatDelta(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

export function Metric({
  label,
  value,
  unit,
  delta,
  formatDelta = defaultFormatDelta,
  invertDelta = false,
  size = 'md',
  className,
}: MetricProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0;
  const good = hasDelta ? (invertDelta ? delta < 0 : delta > 0) : false;

  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-xs font-medium font-display text-muted-foreground">{label}</p>
      <p className={cn('mt-1 flex items-baseline gap-1 font-semibold leading-none', VALUE_SIZE[size])}>
        <span className="tabular-nums">{value}</span>
        {unit ? (
          <span className="text-sm font-normal text-muted-foreground">{unit}</span>
        ) : null}
      </p>
      {hasDelta ? (
        <p
          className={cn(
            'mt-1 text-xs tabular-nums',
            good ? 'text-accent' : 'text-destructive',
          )}
        >
          {/* The arrow states the direction for anyone who cannot use the
              colour to read it. */}
          <span aria-hidden="true">{delta > 0 ? '▲' : '▼'} </span>
          {formatDelta(delta)}
        </p>
      ) : null}
    </div>
  );
}
