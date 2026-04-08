'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'destructive' | 'success' | 'warning' | 'outline';
  size?: 'sm' | 'md';
}

export function Badge({ className, variant = 'default', size = 'md', children, ...props }: BadgeProps) {
  const variants = {
    default: 'border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--foreground)] shadow-[0_8px_16px_-18px_rgba(31,63,98,0.88)]',
    secondary: 'border border-transparent bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-[0_10px_22px_-18px_rgba(31,63,98,0.95)]',
    accent: 'border border-[rgba(20,134,115,0.32)] bg-[rgba(20,134,115,0.14)] text-[color:var(--accent-dark)] shadow-[0_10px_18px_-18px_rgba(20,134,115,0.95)]',
    destructive: 'border border-[rgba(193,75,85,0.35)] bg-[rgba(193,75,85,0.14)] text-[color:var(--destructive)] shadow-[0_10px_18px_-18px_rgba(193,75,85,0.95)]',
    success: 'border border-[rgba(30,155,103,0.35)] bg-[rgba(30,155,103,0.14)] text-[color:var(--success)] shadow-[0_10px_18px_-18px_rgba(30,155,103,0.95)]',
    warning: 'border border-[rgba(202,123,46,0.35)] bg-[rgba(202,123,46,0.14)] text-[color:var(--warning)] shadow-[0_10px_18px_-18px_rgba(202,123,46,0.95)]',
    outline: 'border border-[color:var(--silver)] bg-[color:var(--card)]/64 text-[color:var(--muted-foreground)] hover:bg-[color:var(--secondary)]',
  };

  const sizes = {
    sm: 'text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider',
    md: 'text-[11px] px-2.5 py-1 font-bold uppercase tracking-wider',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md whitespace-nowrap transition-all duration-200',
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
