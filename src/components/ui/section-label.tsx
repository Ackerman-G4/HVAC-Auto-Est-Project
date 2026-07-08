'use client';

/**
 * SectionLabel (plan §Phase 3). Panel headers read as labeled instrument-panel
 * sections — a small leading icon + tracked-out uppercase — rather than plain
 * bold text. Optional trailing slot for a count/action.
 */

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface SectionLabelProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}

export function SectionLabel({ icon, children, trailing, className }: SectionLabelProps) {
  return (
    <div className={cn('mb-2 flex items-center justify-between gap-2', className)}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon && <span className="text-accent">{icon}</span>}
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
          {children}
        </h3>
      </div>
      {trailing}
    </div>
  );
}
