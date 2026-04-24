'use client';

import { Badge } from '@/components/ui/badge';
import type { CaseStatus } from '@/types/simulation';

const STATUS_CONFIG: Record<CaseStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  meshed: { label: 'Meshed', variant: 'outline' },
  queued: { label: 'Queued', variant: 'default' },
  running: { label: 'Running', variant: 'default' },
  completed: { label: 'Completed', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  imported: { label: 'Imported', variant: 'outline' },
};

export default function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}