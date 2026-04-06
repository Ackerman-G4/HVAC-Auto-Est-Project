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
        <label htmlFor={selectId} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'h-11 w-full appearance-none rounded-xl border border-[color:var(--input)] bg-[color:var(--card)] px-4 text-sm text-[color:var(--foreground)] shadow-[0_10px_18px_-20px_rgba(19,32,51,0.9)]',
          'focus:outline-none focus:ring-2 focus:ring-[rgba(15,139,141,0.25)] focus:border-[color:var(--ring)] focus:shadow-[0_16px_26px_-22px_rgba(15,139,141,0.7)]',
          'transition-all duration-200 cursor-pointer',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[color:var(--secondary)]',
          error
            ? 'border-[color:var(--destructive)] focus:border-[color:var(--destructive)] focus:ring-[rgba(216,77,87,0.2)]'
            : 'hover:border-[color:var(--silver)] hover:shadow-[0_14px_24px_-22px_rgba(19,32,51,0.8)]',
          className
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23455B73' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 14px center',
          paddingRight: '40px',
        }}
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
      {error && <p className="mt-1.5 text-xs font-medium text-[color:var(--destructive)]">{error}</p>}
    </div>
  );
}

