'use client';

import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import type {
  LoadCalculationInputs,
  LoadCalculationResult,
} from '@/lib/engine/hvac/load-calculation-engine';
import type { AirflowInputs, AirflowResult } from '@/lib/engine/hvac/airflow-duct-engine';
import type { EquipmentSelectionInputs } from '@/lib/engine/hvac/equipment-selection-engine';
import { toPhp } from '../helpers';
import type { EquipmentCandidate } from '../types';

interface CrossModuleSnapshotProps {
  loadInputs: LoadCalculationInputs;
  loadResult: LoadCalculationResult;
  airflowInputs: AirflowInputs;
  airflowResult: AirflowResult;
  equipmentInputs: EquipmentSelectionInputs;
  selectedCandidate: EquipmentCandidate | null;
}

export function CrossModuleSnapshot({
  loadInputs,
  loadResult,
  airflowInputs,
  airflowResult,
  equipmentInputs,
  selectedCandidate,
}: CrossModuleSnapshotProps) {
  return (
    <CollapsiblePanel
      title="Cross-Module Snapshot"
      subtitle="Key values that drive generated exports"
      defaultOpen
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-sm border border-border bg-secondary p-4 text-sm text-muted-foreground">
          <p className="font-medium uppercase tracking-wider text-foreground">Load Module</p>
          <p className="mt-1">Project: {loadInputs.projectName}</p>
          <p>Space Type: {loadInputs.spaceType}</p>
          <p>Required TR: {loadResult.breakdown.trRequired.toFixed(2)}</p>
          <p>Required CFM: {loadResult.breakdown.cfmRequired.toLocaleString()}</p>
        </div>

        <div className="rounded-sm border border-border bg-secondary p-4 text-sm text-muted-foreground">
          <p className="font-medium uppercase tracking-wider text-foreground">Airflow Module</p>
          <p className="mt-1">Supply CFM: {airflowInputs.supplyCfm.toLocaleString()}</p>
          <p>Branches: {airflowInputs.branches}</p>
          <p>Trunk Duct: {airflowResult.trunkDiameterIn} in</p>
          <p>Fan HP: {airflowResult.requiredFanPowerHp.toFixed(2)}</p>
        </div>

        <div className="rounded-sm border border-border bg-secondary p-4 text-sm text-muted-foreground">
          <p className="font-medium uppercase tracking-wider text-foreground">Equipment Module</p>
          <p className="mt-1">Budget: {equipmentInputs.budgetBand}</p>
          <p>Priority: {equipmentInputs.optimizationPriority}</p>
          <p>Selected: {selectedCandidate?.model ?? 'No candidate'}</p>
          <p>Lifecycle: {toPhp(selectedCandidate?.totalLifecyclePhp ?? 0)}</p>
        </div>
      </div>
    </CollapsiblePanel>
  );
}
