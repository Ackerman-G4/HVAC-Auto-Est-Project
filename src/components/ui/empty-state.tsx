'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-24 px-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50', className)}>
      {icon && <div className="mb-5 p-4 rounded-xl bg-white shadow-sm text-slate-400">{icon}</div>}
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      {description && <p className="text-sm font-medium text-slate-500 max-w-sm mb-6 leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}
