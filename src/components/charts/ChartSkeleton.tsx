'use client';

/**
 * Placeholder shown while a recharts block is being fetched. Charts are
 * dynamically imported so the (large) charting library never blocks a route's
 * first paint — this keeps the layout stable while it streams in.
 */
export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      className="flex w-full animate-pulse items-center justify-center rounded-lg bg-secondary/40"
      style={{ height }}
      aria-hidden="true"
    >
      <span className="text-xs text-muted-foreground">Loading chart…</span>
    </div>
  );
}
