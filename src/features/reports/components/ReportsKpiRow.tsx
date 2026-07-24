'use client';

import { StatCard } from '@/components/ui/stat-card';
import type { LoadCalculationResult } from '@/lib/engine/hvac/load-calculation-engine';
import type { AirflowResult } from '@/lib/engine/hvac/airflow-duct-engine';
import type { CostBreakdown } from '@/lib/engine/pricing-engine';
import { toPhp } from '../helpers';
import type { EquipmentCandidate } from '../types';

interface ReportsKpiRowProps {
  loadResult: LoadCalculationResult;
  airflowResult: AirflowResult;
  selectedCandidate: EquipmentCandidate | null;
  costBreakdown: CostBreakdown | null;
}

export function ReportsKpiRow({
  loadResult,
  airflowResult,
  selectedCandidate,
  costBreakdown,
}: ReportsKpiRowProps) {
  return (
    <div className="grid gap-(--space-component-gap) sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Design Load" value={`${loadResult.breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h`} />
      <StatCard title="Total Static" value={`${airflowResult.totalStaticPressureInWg.toFixed(2)} in.wg`} />
      <StatCard title="Selected Lifecycle" value={toPhp(selectedCandidate?.totalLifecyclePhp ?? 0)} />
      <StatCard title="Project Grand Total" value={costBreakdown ? toPhp(costBreakdown.grandTotal) : '—'} />
    </div>
  );
}
