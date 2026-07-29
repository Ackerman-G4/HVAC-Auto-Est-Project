import { Badge } from '@/components/ui/badge';
import type { CaseStatus } from '@/types/simulation';
import { STATUS_CONFIG } from '../constants';

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
