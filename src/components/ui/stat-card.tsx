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
      'bg-card border border-border/70 rounded-(--radius) p-4.5 shadow-sm',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-[0.08em]">{title}</p>
          <p className="text-[24px] font-semibold text-foreground mt-1 tabular-nums truncate leading-tight">{value}</p>
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
          <div className="w-10 h-10 rounded-[calc(var(--radius)-4px)] bg-secondary border border-border/70 flex items-center justify-center shrink-0">
            <Icon size={18} className="text-silver-dark" />
          </div>
        )}
      </div>
    </div>
  );
}
