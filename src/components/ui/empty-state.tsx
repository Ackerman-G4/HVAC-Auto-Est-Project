'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  /** Optional richer visual (e.g. an animated wireframe) shown above the title,
   *  in place of the icon chip. Takes precedence over `icon`. */
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Render faint "this is what it'll look like" ghost cards behind the panel. */
  ghostPreview?: boolean;
  className?: string;
}

// Faint outline cards behind the empty state — a "here's what populates this
// space" hint (plan §Phase 2). Purely decorative.
function GhostPreview() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-lg opacity-40" aria-hidden="true">
      <div className="absolute left-6 top-8 h-24 w-56 rotate-[-4deg] rounded-md border border-border/60 bg-gradient-to-br from-card/40 to-transparent" />
      <div className="absolute right-8 top-14 h-28 w-52 rotate-[5deg] rounded-md border border-border/60 bg-gradient-to-br from-card/40 to-transparent" />
      <div className="absolute bottom-10 left-1/2 h-24 w-64 -translate-x-1/2 rotate-[1deg] rounded-md border border-border/60 bg-gradient-to-br from-card/40 to-transparent" />
    </div>
  );
}

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  ghostPreview = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border/70 bg-card px-6 py-12 text-center',
        className,
      )}
    >
      {ghostPreview && <GhostPreview />}
      {illustration ? (
        <div className="mb-6 h-40 w-full max-w-xs">{illustration}</div>
      ) : (
        icon && (
          <div className="mb-5 rounded-lg border border-border/70 bg-background/80 p-4 text-muted-foreground shadow-sm">
            {icon}
          </div>
        )
      )}
      <h3 className="mb-2 text-lg font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}
