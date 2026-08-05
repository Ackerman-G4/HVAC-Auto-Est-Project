'use client';

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useSimulationStore } from '@/stores/simulation-store';
import type { FailureScenario } from '@/types/simulation';

// ─── Failure Simulation Panel ───────────────────────────────────────

export function FailurePanel() {
  const { hvacUnits, runFailure, isRunning } = useSimulationStore();
  const [scenario, setScenario] = useState<FailureScenario>('crac_failure');
  const [duration, setDuration] = useState(3600);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const handleRun = () => {
    runFailure({
      scenario,
      failedUnitIds: selectedUnits,
      duration,
      timeStep: 10,
      rackMass: 500,
      specificHeat: 900,
    });
  };

  return (
    <div className="space-y-6">
      <div className="panel-glass grid grid-cols-2 gap-5 rounded-md border border-border/70 bg-card p-5 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold font-display text-muted-foreground">Failure Scenario</label>
          <select className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" value={scenario} onChange={e => setScenario(e.target.value as FailureScenario)} aria-label="Failure Scenario">
            <option value="crac_failure">CRAC Unit Failure</option>
            <option value="power_loss">Total Power Loss</option>
            <option value="cooling_restart">Cooling Restart</option>
            <option value="partial_cooling">Partial Cooling Loss</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold font-display text-muted-foreground">Duration (seconds)</label>
          <input className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={duration} onChange={e => setDuration(+e.target.value)} aria-label="Duration" />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            <AlertTriangle size={16} /> Run Failure Sim
          </button>
        </div>
      </div>
      {scenario !== 'power_loss' && hvacUnits.length > 0 && (
        <div>
          <label className="mb-2 block text-[11px] font-semibold font-display text-muted-foreground">Select Failed Units</label>
          <div className="panel-glass flex flex-wrap gap-2 rounded-md border border-border/70 bg-card p-4">
            {hvacUnits.map(unit => (
              <button
                key={unit.id}
                onClick={() => {
                  setSelectedUnits(prev =>
                    prev.includes(unit.id) ? prev.filter(id => id !== unit.id) : [...prev, unit.id]
                  );
                }}
                className={`rounded-sm border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  selectedUnits.includes(unit.id)
                    ? 'border-red-500/35 bg-red-500/10 text-destructive'
                    : 'border-border bg-background text-muted-foreground hover:border-border'
                }`}
              >
                {unit.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
