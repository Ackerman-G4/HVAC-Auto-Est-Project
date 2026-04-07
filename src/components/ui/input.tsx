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
        <label htmlFor={inputId} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
          {label}
        </label>
      )}
      <div className="relative">
        {hasLeading && (
          <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-xs font-semibold text-[color:var(--text-subtle)]">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-11 w-full rounded-xl border border-[color:var(--input)] bg-[color:var(--card)] px-4 text-sm text-[color:var(--foreground)] shadow-[0_10px_18px_-20px_rgba(19,32,51,0.9)]',
            hasLeading && 'pl-8',
            hasTrailing && 'pr-14',
            'placeholder:text-[rgba(94,112,134,0.8)]',
            'focus:outline-none focus:ring-2 focus:ring-[rgba(15,139,141,0.25)] focus:border-[color:var(--ring)] focus:shadow-[0_16px_26px_-22px_rgba(15,139,141,0.7)]',
            'transition-all duration-200',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[color:var(--secondary)]',
            activeError
              ? 'border-[color:var(--destructive)] focus:border-[color:var(--destructive)] focus:ring-[rgba(216,77,87,0.2)]'
              : 'hover:border-[color:var(--silver)] hover:shadow-[0_14px_24px_-22px_rgba(19,32,51,0.8)]',
            className
          )}
          {...props}
        />
        {hasTrailing && (
          <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-xs font-semibold text-[color:var(--text-subtle)]">
            {unit}
          </span>
        )}
      </div>
      {activeError && <p className="mt-1.5 text-xs font-medium text-[color:var(--destructive)]">{activeError}</p>}
      {helperText && !activeError && <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">{helperText}</p>}
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
        <label htmlFor={inputId} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          'min-h-[100px] w-full resize-y rounded-xl border border-[color:var(--input)] bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] shadow-[0_10px_18px_-20px_rgba(19,32,51,0.9)]',
          'placeholder:text-[rgba(94,112,134,0.8)]',
          'focus:outline-none focus:ring-2 focus:ring-[rgba(15,139,141,0.25)] focus:border-[color:var(--ring)] focus:shadow-[0_16px_26px_-22px_rgba(15,139,141,0.7)]',
          'transition-all duration-200',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[color:var(--secondary)]',
          error
            ? 'border-[color:var(--destructive)] focus:border-[color:var(--destructive)] focus:ring-[rgba(216,77,87,0.2)]'
            : 'hover:border-[color:var(--silver)] hover:shadow-[0_14px_24px_-22px_rgba(19,32,51,0.8)]',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs font-medium text-[color:var(--destructive)]">{error}</p>}
    </div>
  );
}
