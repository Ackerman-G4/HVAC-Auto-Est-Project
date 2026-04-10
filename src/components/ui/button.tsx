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
  const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-lg border font-medium text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    primary: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'border-border bg-secondary text-foreground hover:bg-secondary/80',
    ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
    destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
    accent: 'border-transparent bg-accent text-accent-foreground hover:bg-accent/90',
    outline: 'border-border bg-card text-foreground hover:bg-secondary',
  };

  const sizes = {
    sm: 'h-9 px-4 text-[13px]',
    md: 'h-10 px-5',
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
