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
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {icon && <div className="mb-4 text-muted-foreground/40">{icon}</div>}
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-[13px] text-muted-foreground max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}
