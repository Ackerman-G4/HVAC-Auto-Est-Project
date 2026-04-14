'use client';

import { Box, ExternalLink, Columns3, Cpu, FlaskConical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function SimulationLauncherPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 py-12">
      <Card className="panel-glass border-border/70 p-7 text-center sm:p-10">
        <div className="mx-auto mb-6 flex h-18 w-18 items-center justify-center rounded-2xl border border-border/70 bg-card text-accent shadow-sm">
          <Box size={30} />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Simulation Command Deck</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          CFD Simulation Viewer
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Run server-room airflow studies with dedicated high-performance visualization. Configure rack densities, HVAC assets, and failure scenarios, then inspect thermal behavior across both 3D and analytics views.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
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

      {/* ── Simulation Engine (CFD Case Management) ────────────── */}
      <Card className="panel-glass border-border/70 p-7 text-center sm:p-10">
        <div className="mx-auto mb-6 flex h-18 w-18 items-center justify-center rounded-2xl border border-border/70 bg-card text-accent shadow-sm">
          <FlaskConical size={30} />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Simulation Engine</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          CFD Case Manager
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Build room geometry, configure physics and solver parameters, run internal or external CFD solvers,
          export to OpenFOAM/SimFlow, import results, and visualize with contour slices and 3D vector fields.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/simulation/engine">
            <Button>
              <Cpu size={14} className="mr-1.5" />
              Open Engine Workspace
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
