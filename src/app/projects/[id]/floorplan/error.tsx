'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/observability/logger';

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('[segment-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div className="panel-glass w-full max-w-md rounded-lg border border-border/70 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-lg font-bold text-foreground">This workspace crashed</h2>
        <p className="mb-5 text-sm font-medium leading-relaxed text-muted-foreground">
          The rest of the app is unaffected. Your last saved state is intact — retry to reload this workspace.
        </p>
        {error.digest && (
          <p className="mb-4 font-mono text-xs text-muted-foreground/70">ref: {error.digest}</p>
        )}
        <Button variant="primary" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reload workspace
        </Button>
      </div>
    </div>
  );
}
