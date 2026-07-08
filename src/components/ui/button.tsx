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
  const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-xl border font-medium text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';

  // Elevated variants get a 2px hover lift + shadow bloom (Phase 1 micro-
  // interactions); ghost stays flat. active:scale-[0.98] in baseStyles gives the
  // press. hover:-translate-y-0.5 is neutralised under reduced motion by the
  // global transition-duration clamp in globals.css.
  const variants = {
    primary: 'border-transparent bg-primary text-primary-foreground shadow-[0_8px_20px_color-mix(in_oklab,var(--primary)_35%,transparent)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_12px_28px_color-mix(in_oklab,var(--primary)_45%,transparent)]',
    secondary: 'border-border/80 bg-secondary/80 text-foreground hover:-translate-y-0.5 hover:bg-secondary hover:shadow-[0_10px_22px_color-mix(in_oklab,var(--primary)_16%,transparent)]',
    ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/90 hover:text-foreground',
    destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-[0_8px_18px_color-mix(in_oklab,var(--destructive)_35%,transparent)] hover:-translate-y-0.5 hover:bg-destructive/90 hover:shadow-[0_12px_26px_color-mix(in_oklab,var(--destructive)_45%,transparent)]',
    accent: 'border-transparent bg-accent text-accent-foreground shadow-[0_8px_18px_color-mix(in_oklab,var(--accent)_35%,transparent)] hover:-translate-y-0.5 hover:bg-accent/90 hover:shadow-[0_12px_26px_color-mix(in_oklab,var(--accent)_45%,transparent)]',
    outline: 'border-border/80 bg-card/75 text-foreground hover:-translate-y-0.5 hover:bg-secondary/90 hover:shadow-[0_10px_22px_color-mix(in_oklab,var(--primary)_16%,transparent)]',
  };

  const sizes = {
    sm: 'h-9 px-3.5 text-[13px]',
    md: 'h-10 px-5 text-sm',
    lg: 'h-11 px-6 text-base',
    icon: 'h-10 w-10 p-0',
  };

  return (
    <button
      ref={ref}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {children}
    </button>
  );
}
