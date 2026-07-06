'use client';

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-[linear-gradient(130deg,var(--primary),color-mix(in_oklab,var(--primary)_72%,var(--accent)))] text-[color:var(--primary-foreground)] shadow-[0_14px_24px_-16px_rgba(56,93,132,0.9)] hover:brightness-[1.04]',
  secondary:
    'border border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--foreground)] shadow-[0_10px_18px_-16px_rgba(21,33,30,0.7)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
  ghost:
    'border border-transparent bg-transparent text-[color:var(--muted-foreground)] hover:border-[color:var(--border)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--foreground)]',
  destructive:
    'border border-transparent bg-[linear-gradient(130deg,var(--destructive),color-mix(in_oklab,var(--destructive)_70%,#8f2530))] text-[color:var(--destructive-foreground)] shadow-[0_14px_24px_-16px_rgba(145,45,58,0.9)] hover:brightness-[1.05]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 text-[13px]',
  md: 'h-12 px-6 text-[15px]',
  lg: 'h-[3.25rem] px-8 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={`inline-flex items-center justify-center gap-2.5 rounded-[1rem] font-semibold tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {children}
    </button>
  );
}
