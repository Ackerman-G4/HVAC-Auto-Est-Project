'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ref, ...props }: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-xl border font-semibold tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none active:translate-y-[1px]';
  
  const variants = {
    primary: 'border-transparent bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-[0_12px_26px_-18px_rgba(31,54,88,0.85)] hover:bg-[color:var(--foreground)] hover:shadow-[0_16px_30px_-20px_rgba(31,54,88,0.94)]',
    secondary: 'border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_10px_20px_-20px_rgba(19,32,51,0.9)] hover:border-[color:var(--silver)] hover:bg-[color:var(--secondary)] hover:shadow-[0_14px_24px_-20px_rgba(19,32,51,0.8)]',
    ghost: 'border-transparent bg-transparent text-[color:var(--muted-foreground)] shadow-none hover:border-[color:var(--border)] hover:bg-[rgba(233,237,240,0.7)] hover:text-[color:var(--foreground)]',
    destructive: 'border-transparent bg-[color:var(--destructive)] text-[color:var(--destructive-foreground)] shadow-[0_10px_24px_-16px_rgba(216,77,87,0.9)] hover:bg-[#c93e48] hover:shadow-[0_16px_28px_-18px_rgba(216,77,87,0.9)]',
    accent: 'border-transparent bg-[color:var(--accent)] text-[color:var(--accent-foreground)] shadow-[0_12px_26px_-18px_rgba(15,139,141,0.95)] hover:bg-[color:var(--accent-dark)] hover:shadow-[0_16px_30px_-18px_rgba(15,139,141,0.92)]',
    outline: 'border-[color:var(--silver)] bg-[rgba(255,255,255,0.65)] text-[color:var(--foreground)] shadow-[0_10px_20px_-20px_rgba(19,32,51,0.8)] hover:border-[rgba(19,32,51,0.35)] hover:bg-[color:var(--secondary)] hover:shadow-[0_14px_24px_-20px_rgba(19,32,51,0.78)]',
  };

  const sizes = {
    sm: 'h-9 px-4 text-xs',
    md: 'h-11 px-6 text-sm',
    lg: 'h-12 px-8 text-base',
    icon: 'h-11 w-11 p-0',
  };

  return (
    <button
      ref={ref}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
