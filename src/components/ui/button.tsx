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
  const baseStyles = 'inline-flex items-center justify-center gap-2.5 rounded-[1rem] border font-semibold tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none active:translate-y-[1px]';
  
  const variants = {
    primary: 'border-transparent bg-[linear-gradient(125deg,var(--primary),color-mix(in_oklab,var(--primary)_72%,var(--accent)))] text-[color:var(--primary-foreground)] shadow-[0_16px_30px_-18px_rgba(31,63,98,0.88)] hover:brightness-[1.04] hover:shadow-[0_20px_34px_-18px_rgba(31,63,98,0.94)]',
    secondary: 'border-[color:var(--border)] bg-[linear-gradient(125deg,color-mix(in_oklab,var(--card)_94%,transparent),color-mix(in_oklab,var(--secondary)_62%,transparent))] text-[color:var(--foreground)] shadow-[0_12px_22px_-20px_rgba(31,63,98,0.84)] hover:border-[color:var(--silver)] hover:bg-[color:var(--secondary)] hover:shadow-[0_16px_28px_-20px_rgba(31,63,98,0.78)]',
    ghost: 'border-transparent bg-transparent text-[color:var(--muted-foreground)] shadow-none hover:border-[color:var(--border)] hover:bg-[rgba(229,234,226,0.7)] hover:text-[color:var(--foreground)]',
    destructive: 'border-transparent bg-[linear-gradient(125deg,var(--destructive),color-mix(in_oklab,var(--destructive)_74%,#8f2027))] text-[color:var(--destructive-foreground)] shadow-[0_12px_24px_-16px_rgba(193,75,85,0.9)] hover:brightness-[1.05] hover:shadow-[0_16px_28px_-16px_rgba(193,75,85,0.9)]',
    accent: 'border-transparent bg-[linear-gradient(125deg,var(--accent),color-mix(in_oklab,var(--accent)_72%,var(--accent-light)))] text-[color:var(--accent-foreground)] shadow-[0_16px_30px_-18px_rgba(20,134,115,0.9)] hover:brightness-[1.05] hover:shadow-[0_20px_36px_-18px_rgba(20,134,115,0.94)]',
    outline: 'border-[color:var(--silver)] bg-[color:var(--card)]/86 text-[color:var(--foreground)] shadow-[0_12px_20px_-18px_rgba(31,63,98,0.78)] hover:border-[rgba(31,63,98,0.4)] hover:bg-[color:var(--secondary)] hover:shadow-[0_16px_24px_-18px_rgba(31,63,98,0.78)]',
  };

  const sizes = {
    sm: 'h-10 px-5 text-[13px]',
    md: 'h-12 px-7 text-[15px]',
    lg: 'h-[3.25rem] px-9 text-base',
    icon: 'h-12 w-12 p-0',
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
