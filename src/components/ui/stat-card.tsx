'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { LucideIcon } from 'lucide-react';
import { CountUp } from '@/components/ui/count-up';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  /** Disable the count-up animation for numeric values. */
  animate?: boolean;
  /** 'currency' renders the value in the copper money tone (plan §C6). */
  tone?: 'default' | 'currency';
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, animate = true, tone = 'default', className }: StatCardProps) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
  return (
    <div className={cn(
      'glass-card hover-lift rounded-lg border border-border/70 p-(--space-card-padding) shadow-[var(--panel-shadow)]',
      className
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium font-display text-muted-foreground">{title}</p>
          <p className={cn(
            'mt-3 truncate text-3xl font-bold leading-none tabular-nums',
            tone === 'currency' ? 'text-currency' : 'text-foreground',
          )}>
            {animate && numericValue !== null
              ? <CountUp value={numericValue} format={(n) => Math.round(n).toLocaleString()} />
              : value}
          </p>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn(
              'mt-2 text-sm font-semibold tabular-nums',
              trend.value >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value} {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className="h-12 w-12 shrink-0 rounded-md border border-border/70 bg-primary/10 flex items-center justify-center">
            <Icon size={20} className="text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
