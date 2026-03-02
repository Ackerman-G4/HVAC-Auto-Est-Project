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
      'bg-card border border-border/60 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
          <p className="text-[22px] font-semibold text-foreground mt-1 tabular-nums truncate leading-tight">{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
          {trend && (
            <p className={cn(
              'text-[11px] font-medium mt-1.5 tabular-nums',
              trend.value >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value} {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
            <Icon size={18} className="text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
