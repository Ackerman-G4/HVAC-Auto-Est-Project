'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn(
      'rounded-xl border border-border bg-card p-8 shadow-sm',
      className
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</p>
          <p className="mt-3 truncate text-3xl font-bold leading-none tabular-nums text-foreground">{value}</p>
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
          <div className="h-12 w-12 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon size={20} className="text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
