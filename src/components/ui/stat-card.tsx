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
      'group rounded-[1.2rem] border border-[color:var(--border)] bg-[linear-gradient(140deg,color-mix(in_oklab,var(--card)_95%,transparent),color-mix(in_oklab,var(--brand-paper)_72%,transparent))] p-6 shadow-[0_18px_34px_-24px_rgba(31,63,98,0.56)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(20,134,115,0.44)] hover:shadow-[0_22px_40px_-24px_rgba(20,134,115,0.72)]',
      className
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">{title}</p>
          <p className="mt-2 truncate text-[2.25rem] font-extrabold leading-none tabular-nums text-[color:var(--foreground)]">{value}</p>
          {subtitle && <p className="mt-2.5 text-sm font-medium text-[color:var(--muted-foreground)]">{subtitle}</p>}
          {trend && (
            <p className={cn(
              'mt-2.5 text-sm font-bold tabular-nums',
              trend.value >= 0 ? 'text-[color:var(--success)]' : 'text-[color:var(--destructive)]'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value} {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className="h-12 w-12 shrink-0 rounded-2xl border border-[rgba(20,134,115,0.28)] bg-[linear-gradient(145deg,rgba(20,134,115,0.14),rgba(31,63,98,0.1))] flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:bg-[linear-gradient(145deg,rgba(20,134,115,0.2),rgba(31,63,98,0.14))]">
            <Icon size={21} className="text-[color:var(--accent-dark)]" />
          </div>
        )}
      </div>
    </div>
  );
}
