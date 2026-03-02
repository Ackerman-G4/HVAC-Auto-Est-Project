'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';
    
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:bg-[#2d3139] active:bg-[#3d4550] shadow-sm',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-muted active:bg-silver-light border border-border/60',
      ghost: 'hover:bg-secondary active:bg-muted text-muted-foreground hover:text-foreground',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-red-700 active:bg-red-800 shadow-sm',
      accent: 'bg-accent text-accent-foreground hover:bg-blue-800 active:bg-blue-900 shadow-sm',
      outline: 'border border-border/60 bg-transparent text-foreground hover:bg-secondary active:bg-muted',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-3.5 text-[13px] gap-2',
      lg: 'h-11 px-5 text-sm gap-2',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
