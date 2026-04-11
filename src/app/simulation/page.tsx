'use client';

import { Box, ExternalLink, Columns3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function SimulationLauncherPage() {
  return (
    <div className="mx-auto max-w-xl py-16 space-y-4">
      <Card className="p-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-secondary text-accent">
          <Box size={28} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          CFD Simulation Viewer
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The data-center airflow simulator runs in a dedicated full-screen window for performance. Configure rack
          densities, HVAC units, and failure scenarios, then visualise temperature fields and 3D airflow in real time.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/simulation/workspace">
            <Button>
              <Columns3 size={14} className="mr-1.5" />
              Open Workspace
            </Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => window.open('/simulation/viewer', '_blank', 'noopener')}
          >
            <ExternalLink size={14} className="mr-1.5" />
            Launch Full Screen
          </Button>
        </div>
      </Card>
    </div>
  );
}
