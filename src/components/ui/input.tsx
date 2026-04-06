'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, label, error, hint, id, ref, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-11 w-full rounded-xl border border-[color:var(--input)] bg-[color:var(--card)] px-4 text-sm text-[color:var(--foreground)] shadow-[0_10px_18px_-20px_rgba(19,32,51,0.9)]',
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
      {hint && !error && <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">{hint}</p>}
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
