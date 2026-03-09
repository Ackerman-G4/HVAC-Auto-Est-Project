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
  const baseStyles = 'inline-flex items-center justify-center font-bold tracking-tight rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-white active:scale-[0.96] shadow-sm';
  
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/25 hover:shadow-md border border-transparent',
    secondary: 'bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 hover:border-slate-300 hover:shadow-md',
    ghost: 'hover:bg-slate-100 hover:text-slate-900 shadow-none',
    destructive: 'bg-red-600 text-white hover:bg-red-700 hover:shadow-red-500/25 hover:shadow-md border border-transparent',
    accent: 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/25 hover:shadow-md border border-transparent',
    outline: 'border-2 border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300',
  };

  const sizes = {
    sm: 'h-9 px-4 text-xs',
    md: 'h-11 py-2 px-6 text-sm',
    lg: 'h-12 px-8 text-base',
    icon: 'h-11 w-11 p-0',
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
