import { HvacLogo } from '@/components/ui/hvac-logo';
import { Z } from '@/lib/utils/z-indexes';

/**
 * Shown only while auth is resolving.
 *
 * This used to run a progress bar looping 22%→54%→81%→100% every 2.2s, three
 * cycling status strings, two counter-rotating rings and a row of marching
 * dots — none of it tracking anything. It reported fictional progress forever,
 * and it sat behind a hardcoded 1.1s delay, so the app's first impression was a
 * lie about how fast it is.
 *
 * What replaces it is the shape of the shell that is about to appear: a sidebar
 * rail and a header bar. That is honest (it really is what loads next) and it
 * makes the transition feel like the page settling rather than swapping. No
 * animation beyond the shared skeleton shimmer, which does carry meaning —
 * "content is coming here".
 */
export function SystemLoadingScreen() {
  return (
    <div
      className="fixed inset-0 flex bg-background"
      style={{ zIndex: Z.loading }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Signing you in…</span>

      {/* Sidebar rail */}
      <div className="hidden w-(--layout-sidebar-collapsed) shrink-0 flex-col items-center gap-6 border-r border-border bg-card px-3 py-4 md:flex">
        <HvacLogo variant="mono" size={24} className="text-muted-foreground" />
        <div className="flex w-full flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-full rounded-sm skeleton" />
          ))}
        </div>
      </div>

      {/* Header bar + content well */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
          <HvacLogo variant="mono" size={24} className="text-muted-foreground md:hidden" />
          <div className="h-4 w-40 rounded-sm skeleton" aria-hidden="true" />
        </div>
        <div className="surface-recessed flex-1" />
      </div>
    </div>
  );
}
