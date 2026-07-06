'use client';

import React from 'react';

interface InputFieldProps {
  label: string;
  value: number | string;
  onValueChange: (next: number | string) => void;
  type?: 'number' | 'text';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

function parseNumber(value: number | string): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function InputField({
  label,
  value,
  onValueChange,
  type = 'number',
  unit,
  min,
  max,
  step,
  helperText,
  required = false,
  disabled = false,
}: InputFieldProps) {
  const numericValue = parseNumber(value);
  let inlineError = '';

  if (required && (value === '' || value === null || value === undefined)) {
    inlineError = `${label} is required`;
  }

  if (!inlineError && type === 'number' && numericValue !== null) {
    if (typeof min === 'number' && numericValue < min) {
      inlineError = `${label} must be at least ${min}${unit ? ` ${unit}` : ''}`;
    }

    if (!inlineError && typeof max === 'number' && numericValue > max) {
      inlineError = `${label} must be at most ${max}${unit ? ` ${unit}` : ''}`;
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-[12px] font-bold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => {
            if (type === 'number') {
              const parsed = Number(event.target.value);
              onValueChange(Number.isFinite(parsed) ? parsed : 0);
              return;
            }

            onValueChange(event.target.value);
          }}
          className={`h-12 w-full rounded-[1rem] border bg-[linear-gradient(125deg,color-mix(in_oklab,var(--surface-1)_92%,transparent),color-mix(in_oklab,var(--surface-2)_66%,transparent))] px-4 text-[15px] text-[color:var(--foreground)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${inlineError ? 'border-[color:var(--destructive)] focus-visible:ring-[color:var(--destructive)]' : 'border-[color:var(--input)] focus-visible:border-[color:var(--ring)]'} ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${unit ? 'pr-16' : ''}`}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center text-sm font-semibold text-[color:var(--muted-foreground)]">
            {unit}
          </span>
        )}
      </div>
      {inlineError ? (
        <p className="text-[12px] font-medium text-[color:var(--destructive)]">{inlineError}</p>
      ) : helperText ? (
        <p className="text-[12px] text-[color:var(--muted-foreground)]">{helperText}</p>
      ) : null}
    </div>
  );
}
