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
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
          aria-label={label}
          onChange={(event) => {
            if (type === 'number') {
              const parsed = Number(event.target.value);
              onValueChange(Number.isFinite(parsed) ? parsed : 0);
              return;
            }

            onValueChange(event.target.value);
          }}
          className={`h-10 w-full rounded-lg border bg-card px-3 text-sm text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 ${inlineError ? 'border-destructive focus-visible:ring-destructive/20' : 'border-input focus-visible:border-ring'} ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${unit ? 'pr-14' : ''}`}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {inlineError ? (
        <p className="text-xs font-medium text-destructive">{inlineError}</p>
      ) : helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
