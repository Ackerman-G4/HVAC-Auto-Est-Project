'use client';

import React from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface TermHintProps {
  term: string;
  definition: string;
  className?: string;
  compact?: boolean;
}

export function TermHint({ term, definition, className, compact = false }: TermHintProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span>{term}</span>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-border text-muted-foreground',
          compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
        )}
        title={definition}
        aria-label={`${term}: ${definition}`}
      >
        <CircleHelp size={compact ? 9 : 10} />
      </span>
    </span>
  );
}
