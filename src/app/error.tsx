'use client';

/**
 * Root route error boundary (overhaul-v3 Phase 5.1).
 * Catches render/data errors below the shell so one broken page never
 * takes the whole app down. Branded, actionable, honest.
 */

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/observability/logger';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in console for diagnostics; digest links to server logs.
    logger.error('[route-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="panel-glass w-full max-w-md rounded-lg border border-border/70 p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-xl font-bold text-foreground">
          Something broke on this page
        </h1>
        <p className="mb-1 text-sm font-medium leading-relaxed text-muted-foreground">
          The rest of HVAC Studio is still running — your project data is safe.
          Try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="mb-4 font-mono text-xs text-muted-foreground/70">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button variant="primary" onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            <Home className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
