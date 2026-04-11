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
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 bg-card/80 px-6 py-24 text-center backdrop-blur-sm', className)}>
      {icon && <div className="mb-5 rounded-2xl border border-border/70 bg-background/80 p-4 text-muted-foreground shadow-sm">{icon}</div>}
      <h3 className="mb-2 text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="mb-6 max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
