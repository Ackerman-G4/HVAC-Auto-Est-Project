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

  const variants = {
    primary: 'border-transparent bg-primary text-primary-foreground shadow-[0_8px_20px_color-mix(in_oklab,var(--primary)_35%,transparent)] hover:bg-primary/90 hover:shadow-[0_10px_24px_color-mix(in_oklab,var(--primary)_42%,transparent)]',
    secondary: 'border-border/80 bg-secondary/80 text-foreground hover:bg-secondary',
    ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/90 hover:text-foreground',
    destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-[0_8px_18px_color-mix(in_oklab,var(--destructive)_35%,transparent)] hover:bg-destructive/90',
    accent: 'border-transparent bg-accent text-accent-foreground shadow-[0_8px_18px_color-mix(in_oklab,var(--accent)_35%,transparent)] hover:bg-accent/90',
    outline: 'border-border/80 bg-card/75 text-foreground hover:bg-secondary/90',
  };

  const sizes = {
    sm: 'h-9 px-4 text-[13px]',
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
