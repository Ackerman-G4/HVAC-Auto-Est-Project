'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  unit?: string;
  prefix?: string;
  showRangeHint?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function Input({ className, label, error, hint, unit, prefix, showRangeHint = true, id, ref, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  const minValue = toFiniteNumber(props.min);
  const maxValue = toFiniteNumber(props.max);
  const currentValue = toFiniteNumber(props.value);

  let derivedError: string | undefined;
  if (!error && props.type === 'number' && currentValue !== null) {
    if (minValue !== null && currentValue < minValue) {
      derivedError = `Value must be >= ${minValue}${unit ? ` ${unit}` : ''}`;
    } else if (maxValue !== null && currentValue > maxValue) {
      derivedError = `Value must be <= ${maxValue}${unit ? ` ${unit}` : ''}`;
    }
  }

  const activeError = error || derivedError;
  const rangeHint =
    showRangeHint && props.type === 'number' && (minValue !== null || maxValue !== null)
      ? `Range: ${minValue !== null ? minValue : '-'} to ${maxValue !== null ? maxValue : '-'}${unit ? ` ${unit}` : ''}`
      : undefined;

  const helperText = hint || rangeHint;
  const hasLeading = !!prefix;
  const hasTrailing = !!unit;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        {hasLeading && (
          <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-10 w-full rounded-xl border border-input bg-card/85 px-3 text-sm text-foreground backdrop-blur-sm',
            hasLeading && 'pl-9',
            hasTrailing && 'pr-14',
            'placeholder:text-muted-foreground/60',
            'focus:outline-none focus:ring-2 focus:ring-ring/55 focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_22%,transparent)]',
            'transition-colors duration-150',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary',
            activeError
              ? 'border-destructive focus:border-destructive focus:ring-destructive/45'
              : 'hover:border-muted-foreground/55',
            className
          )}
          {...props}
        />
        {hasTrailing && (
          <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {activeError && <p className="mt-1.5 text-xs font-medium text-destructive">{activeError}</p>}
      {helperText && !activeError && <p className="mt-1.5 text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, label, error, id, ref, ...props }: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          'min-h-30 w-full resize-y rounded-xl border border-input bg-card/85 px-3 py-3 text-sm text-foreground backdrop-blur-sm',
          'placeholder:text-muted-foreground/60',
          'focus:outline-none focus:ring-2 focus:ring-ring/55 focus:border-primary',
          'transition-colors duration-150',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary',
          error
            ? 'border-destructive focus:border-destructive focus:ring-destructive/45'
            : 'hover:border-muted-foreground/55',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
