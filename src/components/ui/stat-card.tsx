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
      'bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 group',
      className
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</p>
          <p className="text-3xl font-extrabold text-slate-900 mt-2 tabular-nums truncate leading-none">{value}</p>
          {subtitle && <p className="text-xs font-medium text-slate-500 mt-2">{subtitle}</p>}
          {trend && (
            <p className={cn(
              'text-xs font-bold mt-2.5 tabular-nums',
              trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value} {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-12 h-12 rounded-lg bg-blue-50/50 border border-blue-100 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-blue-50 transition-all duration-300">
            <Icon size={22} className="text-blue-600" />
          </div>
        )}
      </div>
    </div>
  );
}
