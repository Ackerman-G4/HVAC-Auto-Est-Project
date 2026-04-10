'use client';

import { Box, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SimulationLauncherPage() {
  return (
    <div className="mx-auto max-w-xl py-16">
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
        <Button
          className="mt-6"
          onClick={() => window.open('/simulation/viewer', '_blank', 'noopener')}
        >
          <ExternalLink size={14} className="mr-1.5" />
          Launch Simulator
        </Button>
      </Card>
    </div>
  );
}
