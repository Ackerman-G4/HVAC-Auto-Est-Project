'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  ref?: React.Ref<HTMLSelectElement>;
}

export function Select({ className, label, error, options, placeholder, id, ref, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'h-10 w-full appearance-none rounded-xl border border-input bg-card/85 px-3 text-sm text-foreground backdrop-blur-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring/55 focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_22%,transparent)]',
          'transition-colors duration-150 cursor-pointer',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary',
          'select-arrow',
          error
            ? 'border-destructive focus:border-destructive focus:ring-destructive/45'
            : 'hover:border-muted-foreground/55',
          className
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

