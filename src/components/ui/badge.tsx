'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'destructive' | 'success' | 'warning' | 'outline';
  size?: 'sm' | 'md';
}

export function Badge({ className, variant = 'default', size = 'md', children, ...props }: BadgeProps) {
  const variants = {
    default: 'border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--foreground)] shadow-[0_8px_16px_-18px_rgba(19,32,51,0.88)]',
    secondary: 'border border-transparent bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-[0_10px_22px_-18px_rgba(31,54,88,0.95)]',
    accent: 'border border-[rgba(15,139,141,0.3)] bg-[rgba(15,139,141,0.12)] text-[color:var(--accent-dark)] shadow-[0_10px_18px_-18px_rgba(15,139,141,0.95)]',
    destructive: 'border border-[rgba(216,77,87,0.35)] bg-[rgba(216,77,87,0.12)] text-[color:var(--destructive)] shadow-[0_10px_18px_-18px_rgba(216,77,87,0.95)]',
    success: 'border border-[rgba(43,159,115,0.35)] bg-[rgba(43,159,115,0.12)] text-[color:var(--success)] shadow-[0_10px_18px_-18px_rgba(43,159,115,0.95)]',
    warning: 'border border-[rgba(219,142,47,0.35)] bg-[rgba(219,142,47,0.12)] text-[color:var(--warning)] shadow-[0_10px_18px_-18px_rgba(219,142,47,0.95)]',
    outline: 'border border-[color:var(--silver)] bg-[rgba(255,255,255,0.6)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--secondary)]',
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
