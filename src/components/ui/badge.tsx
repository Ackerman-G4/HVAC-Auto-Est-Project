'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'destructive' | 'success' | 'warning' | 'outline';
  size?: 'sm' | 'md';
}

export function Badge({ className, variant = 'default', size = 'md', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-foreground/8 text-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    accent: 'bg-accent/10 text-accent',
    destructive: 'bg-destructive/10 text-destructive',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    outline: 'border border-border/60 text-muted-foreground bg-transparent',
  };

  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-[11px] px-2 py-0.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md whitespace-nowrap',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
