'use client';

import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import type { LoadCalculationResult } from '@/lib/engine/hvac/load-calculation-engine';
import type { AirflowResult } from '@/lib/engine/hvac/airflow-duct-engine';
import type { EquipmentSelectionResult } from '@/lib/engine/hvac/equipment-selection-engine';

interface FormulaTransparencyProps {
  loadResult: LoadCalculationResult;
  airflowResult: AirflowResult;
  equipmentResult: EquipmentSelectionResult;
}

export function FormulaTransparency({
  loadResult,
  airflowResult,
  equipmentResult,
}: FormulaTransparencyProps) {
  return (
    <CollapsiblePanel
      title="Formula Transparency"
      subtitle="Combined formula traces from load, airflow, and equipment engines"
      defaultOpen={false}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-medium font-display text-muted-foreground">Load Equations</p>
          <div className="space-y-3">
            {loadResult.formulas.map((formula) => (
              <div key={`load-${formula.label}`} className="rounded-sm border border-border bg-secondary p-4">
                <p className="text-[11px] font-medium font-display text-foreground">{formula.label}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{formula.expression}</p>
                <p className="mt-1.5 text-xs font-semibold text-accent">{formula.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium font-display text-muted-foreground">Airflow Equations</p>
          <div className="space-y-3">
            {airflowResult.formulas.map((formula) => (
              <div key={`air-${formula.label}`} className="rounded-sm border border-border bg-secondary p-4">
                <p className="text-[11px] font-medium font-display text-foreground">{formula.label}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{formula.expression}</p>
                <p className="mt-1.5 text-xs font-semibold text-accent">{formula.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium font-display text-muted-foreground">Equipment Equations</p>
          <div className="space-y-3">
            {equipmentResult.formulas.map((formula) => (
              <div key={`equip-${formula.label}`} className="rounded-sm border border-border bg-secondary p-4">
                <p className="text-[11px] font-medium font-display text-foreground">{formula.label}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{formula.expression}</p>
                <p className="mt-1.5 text-xs font-semibold text-accent">{formula.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}
