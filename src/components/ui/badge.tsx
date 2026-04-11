'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'destructive' | 'success' | 'warning' | 'outline';
  size?: 'sm' | 'md';
}

export function Badge({ className, variant = 'default', size = 'md', children, ...props }: BadgeProps) {
  const variants = {
    default: 'border border-border/70 bg-secondary/80 text-foreground',
    secondary: 'border border-transparent bg-primary text-primary-foreground',
    accent: 'border border-accent/30 bg-accent/10 text-accent-dark',
    destructive: 'border border-destructive/30 bg-destructive/10 text-destructive',
    success: 'border border-success/30 bg-success/10 text-success',
    warning: 'border border-warning/30 bg-warning/10 text-warning',
    outline: 'border border-border/70 bg-card/75 text-muted-foreground backdrop-blur-sm hover:bg-secondary/80',
  };

  const sizes = {
    sm: 'text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider',
    md: 'text-[11px] px-2.5 py-1 font-bold uppercase tracking-wider',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg whitespace-nowrap transition-colors duration-150',
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
