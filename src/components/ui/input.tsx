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
        <label htmlFor={inputId} className="block text-xs font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full h-9 px-3 rounded-lg border bg-card text-foreground text-[13px]',
          'placeholder:text-muted-foreground/60',
          'focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-accent',
          'transition-all duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error ? 'border-destructive focus:ring-destructive/30' : 'border-border/60',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      {hint && !error && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
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
        <label htmlFor={inputId} className="block text-xs font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          'w-full min-h-20 px-3 py-2 rounded-lg border bg-card text-foreground text-[13px]',
          'placeholder:text-muted-foreground/60 resize-y',
          'focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-accent',
          'transition-all duration-150',
          error ? 'border-destructive focus:ring-destructive/30' : 'border-border/60',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
