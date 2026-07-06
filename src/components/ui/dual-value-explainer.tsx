'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { TermHint } from '@/components/ui/term-hint';

type DisplayValue = string | number | null | undefined;

interface DualValueExplainerProps {
  title: string;
  suggested: DisplayValue;
  override: DisplayValue;
  final: DisplayValue;
  term?: string;
  definition?: string;
  formula?: string;
  note?: string;
  className?: string;
  compact?: boolean;
}

function toDisplay(value: DisplayValue): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return String(value);
}

export function DualValueExplainer({
  title,
  suggested,
  override,
  final,
  term,
  definition,
  formula,
  note,
  className,
  compact = false,
}: DualValueExplainerProps) {
  const isOverridden = override !== null && override !== undefined && override !== '';

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-card/85 p-3 shadow-[0_10px_18px_-20px_rgba(19,32,51,0.85)]',
        compact && 'p-2.5',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className={cn('font-semibold text-foreground', compact ? 'text-[11px]' : 'text-xs uppercase tracking-wider')}>
          {title}
          {term && definition && (
            <TermHint
              term={term}
              definition={definition}
              compact={compact}
              className="ml-2 font-normal normal-case"
            />
          )}
        </div>
        <Badge size="sm" variant={isOverridden ? 'accent' : 'secondary'}>
          {isOverridden ? 'Override Active' : 'Suggested Active'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-border/60 bg-secondary/35 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested</p>
          <p className={cn('tabular-nums font-semibold text-foreground', compact ? 'text-xs' : 'text-sm')}>
            {toDisplay(suggested)}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-secondary/35 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Override</p>
          <p className={cn('tabular-nums font-semibold text-foreground', compact ? 'text-xs' : 'text-sm')}>
            {toDisplay(override)}
          </p>
        </div>
        <div className="rounded-md border border-accent/30 bg-accent/12 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Final</p>
          <p className={cn('tabular-nums font-bold text-accent', compact ? 'text-xs' : 'text-sm')}>
            {toDisplay(final)}
          </p>
        </div>
      </div>

      {(formula || note) && (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
          {formula && (
            <p className="text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground">Rule:</span> {formula}
            </p>
          )}
          {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
        </div>
      )}
    </div>
  );
}
