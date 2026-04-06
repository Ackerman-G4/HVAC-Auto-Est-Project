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
      'group rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[0_16px_32px_-26px_rgba(19,32,51,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(15,139,141,0.44)] hover:shadow-[0_20px_36px_-26px_rgba(15,139,141,0.8)]',
      className
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">{title}</p>
          <p className="mt-2 truncate text-3xl font-extrabold leading-none tabular-nums text-[color:var(--foreground)]">{value}</p>
          {subtitle && <p className="mt-2 text-xs font-medium text-[color:var(--muted-foreground)]">{subtitle}</p>}
          {trend && (
            <p className={cn(
              'mt-2.5 text-xs font-bold tabular-nums',
              trend.value >= 0 ? 'text-[color:var(--success)]' : 'text-[color:var(--destructive)]'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value} {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className="h-11 w-11 shrink-0 rounded-2xl border border-[rgba(15,139,141,0.24)] bg-[rgba(15,139,141,0.1)] flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:bg-[rgba(15,139,141,0.16)]">
            <Icon size={20} className="text-[color:var(--accent-dark)]" />
          </div>
        )}
      </div>
    </div>
  );
}
