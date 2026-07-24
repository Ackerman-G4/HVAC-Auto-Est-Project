import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeletons (overhaul-v3 Phase 5.1).
 * Layout-matched shapes — never spinners — so the page "materializes"
 * instead of popping. Server components: zero client JS cost.
 */

export function PageHeaderSkeleton() {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-28 rounded-xl" />
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/70 bg-card/80 p-5">
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="mb-2 h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function DataTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80">
      <div className="flex gap-6 border-b border-border/70 bg-secondary/40 px-5 py-3.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="ml-auto h-4 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-border/40 px-5 py-4 last:border-0">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-7 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/70 bg-card/80 p-5">
          <Skeleton className="mb-4 h-5 w-3/4" />
          <Skeleton className="mb-2 h-3.5 w-full" />
          <Skeleton className="mb-5 h-3.5 w-2/3" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Three-panel workspace shape: tools / canvas / inspector. */
export function WorkspaceSkeleton() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="w-72 shrink-0 space-y-4 rounded-2xl border border-border/70 bg-card/80 p-4">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-border/70 bg-card/60">
        <div className="text-center">
          <Skeleton className="mx-auto mb-3 h-12 w-12 rounded-2xl" />
          <Skeleton className="mx-auto h-4 w-44" />
        </div>
      </div>
      <div className="w-80 shrink-0 space-y-4 rounded-2xl border border-border/70 bg-card/80 p-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Project detail shape: header + workflow rail + content sections. */
export function DetailSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="mb-8 flex gap-2 overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 flex-1 rounded-xl" />
        ))}
      </div>
      <StatRowSkeleton />
      <DataTableSkeleton rows={5} />
    </div>
  );
}
