import React from 'react';
import { cn } from '@/lib/utils/cn';

interface HvacLogoProps {
  size?: number;
  variant?: 'color' | 'mono';
  className?: string;
}

/**
 * HVAC Studio brand logo — fan-blade/airflow motif.
 * `color` variant uses blue→green gradient (login, hero, loading).
 * `mono` variant inherits currentColor (sidebar, header).
 */
export function HvacLogo({ size = 32, variant = 'mono', className }: HvacLogoProps) {
  const id = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      {variant === 'color' && (
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      )}

      {/* Outer ring — airflow orbit */}
      <circle
        cx="32"
        cy="32"
        r="29"
        stroke={variant === 'color' ? `url(#${id}-ring)` : 'currentColor'}
        strokeWidth="2"
        strokeOpacity={variant === 'mono' ? 0.25 : 1}
        strokeDasharray="8 4"
      />

      {/* Fan blades — 4-blade radial pattern */}
      <g
        fill={variant === 'color' ? `url(#${id}-grad)` : 'currentColor'}
        fillOpacity={variant === 'mono' ? 0.9 : 1}
      >
        {/* Top blade */}
        <path d="M32 10c-3.5 0-6 4-6 10s2 8 6 12c4-4 6-6 6-12s-2.5-10-6-10z" />
        {/* Right blade */}
        <path d="M54 32c0-3.5-4-6-10-6s-8 2-12 6c4 4 6 6 12 6s10-2.5 10-6z" />
        {/* Bottom blade */}
        <path d="M32 54c3.5 0 6-4 6-10s-2-8-6-12c-4 4-6 6-6 12s2.5 10 6 10z" />
        {/* Left blade */}
        <path d="M10 32c0 3.5 4 6 10 6s8-2 12-6c-4-4-6-6-12-6s-10 2.5-10 6z" />
      </g>

      {/* Center hub */}
      <circle
        cx="32"
        cy="32"
        r="4.5"
        fill={variant === 'color' ? `url(#${id}-grad)` : 'currentColor'}
      />
      <circle
        cx="32"
        cy="32"
        r="2"
        fill={variant === 'color' ? '#0B1220' : 'var(--background, #0B1220)'}
      />
    </svg>
  );
}
