'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'destructive' | 'success' | 'warning' | 'outline';
  size?: 'sm' | 'md';
}

export function Badge({ className, variant = 'default', size = 'md', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-800 border border-slate-200/50 hover:bg-slate-200/60',
    secondary: 'bg-slate-800 text-white shadow-sm hover:bg-slate-900',
    accent: 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100',
    destructive: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100',
    outline: 'border-2 border-slate-200 text-slate-600 bg-transparent hover:bg-slate-50',
  };

  const sizes = {
    sm: 'text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider',
    md: 'text-[11px] px-2.5 py-1 font-bold uppercase tracking-wider',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md whitespace-nowrap transition-colors',
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
