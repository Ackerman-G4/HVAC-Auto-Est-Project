'use client';

/**
 * Skeleton — jade-tinted shimmer placeholders (plan §Phase 1). Replaces blank
 * panels / bare spinners while data loads so a loading surface reads as
 * "content is coming", not "nothing here". The shimmer lives in the `.skeleton`
 * class (globals.css) and collapses to a static tint under reduced motion.
 */

import React from 'react';
import { cn } from '@/lib/utils/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton rounded-2xl', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * SkeletonList — N stacked card placeholders for async collections
 * (e.g. "Simulation Cases" while they load). Announces a busy state to AT.
 */
export function SkeletonList({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3">
      <div className="flex gap-4 border-b border-border pb-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-5 flex-1 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-5 flex-1 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-card/80 p-6 backdrop-blur-sm">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

