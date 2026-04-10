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
    <div className={cn('flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card px-6 py-24 text-center', className)}>
      {icon && <div className="mb-5 rounded-xl bg-background p-4 text-muted-foreground shadow-sm">{icon}</div>}
      <h3 className="mb-2 text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="mb-6 max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
