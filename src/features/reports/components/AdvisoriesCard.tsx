'use client';

import { Card } from '@/components/ui/card';
import type { LoadCalculationResult } from '@/lib/engine/hvac/load-calculation-engine';
import type { AirflowResult } from '@/lib/engine/hvac/airflow-duct-engine';
import type { EquipmentSelectionResult } from '@/lib/engine/hvac/equipment-selection-engine';

interface AdvisoriesCardProps {
  loadResult: LoadCalculationResult;
  airflowResult: AirflowResult;
  equipmentResult: EquipmentSelectionResult;
}

export function AdvisoriesCard({
  loadResult,
  airflowResult,
  equipmentResult,
}: AdvisoriesCardProps) {
  if (
    loadResult.alerts.length === 0 &&
    airflowResult.alerts.length === 0 &&
    equipmentResult.alerts.length === 0
  ) {
    return null;
  }

  return (
    <Card className="panel-glass border-border/70 p-6 lg:p-8">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Advisories</h3>
      <div className="space-y-2 rounded-sm border border-warning bg-secondary p-4 text-sm text-foreground">
        {loadResult.alerts.map((alert) => (
          <p key={`load-alert-${alert}`}>Load: {alert}</p>
        ))}
        {airflowResult.alerts.map((alert) => (
          <p key={`air-alert-${alert}`}>Airflow: {alert}</p>
        ))}
        {equipmentResult.alerts.map((alert) => (
          <p key={`equip-alert-${alert}`}>Equipment: {alert}</p>
        ))}
      </div>
    </Card>
  );
}
