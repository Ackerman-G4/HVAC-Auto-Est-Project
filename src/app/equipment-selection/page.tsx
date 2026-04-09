'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import { Info, RefreshCcw, WandSparkles } from 'lucide-react';
import { Card } from '@/components/rebuild/Card';
import { Button } from '@/components/rebuild/Button';
import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import { DenseDataTable, DenseColumn } from '@/components/rebuild/DenseDataTable';
import { InputField } from '@/components/rebuild/InputField';
import { EquipmentCandidate } from '@/lib/engine/hvac/equipment-selection-engine';
import { useEquipmentWorkspaceStore } from '@/stores/equipment-workspace-store';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';
import { useUIStore } from '@/stores/ui-store';

const columns: DenseColumn<EquipmentCandidate>[] = [
  { key: 'model', header: 'Model' },
  { key: 'type', header: 'Type' },
  { key: 'quantity', header: 'Qty', align: 'right' },
  { key: 'providedTr', header: 'Provided TR', align: 'right' },
  { key: 'utilizationPct', header: 'Utilization %', align: 'right' },
  { key: 'annualEnergyKwh', header: 'Annual kWh', align: 'right' },
  {
    key: 'capexPhp',
    header: 'Capex',
    align: 'right',
    render: (row) => `PHP ${Number(row.capexPhp).toLocaleString()}`,
  },
  {
    key: 'annualEnergyCostPhp',
    header: 'Annual Energy Cost',
    align: 'right',
    render: (row) => `PHP ${Number(row.annualEnergyCostPhp).toLocaleString()}`,
  },
  {
    key: 'totalLifecyclePhp',
    header: '5-Year Lifecycle',
    align: 'right',
    render: (row) => `PHP ${Number(row.totalLifecyclePhp).toLocaleString()}`,
  },
  { key: 'score', header: 'Score', align: 'right' },
];

export default function EquipmentSelectionPage() {
  const [chartsReady, setChartsReady] = React.useState(false);

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

  const mode = useUIStore((state) => state.workspaceMode);
  const loadTr = useLoadWorkspaceStore((state) => state.result.breakdown.trRequired);
  const inputs = useEquipmentWorkspaceStore((state) => state.inputs);
  const overrides = useEquipmentWorkspaceStore((state) => state.overrides);
  const result = useEquipmentWorkspaceStore((state) => state.result);
  const loading = useEquipmentWorkspaceStore((state) => state.loading);
  const setInput = useEquipmentWorkspaceStore((state) => state.setInput);
  const setOverride = useEquipmentWorkspaceStore((state) => state.setOverride);
  const setRequiredTr = useEquipmentWorkspaceStore((state) => state.setRequiredTr);
  const reset = useEquipmentWorkspaceStore((state) => state.reset);
  const simulateRun = useEquipmentWorkspaceStore((state) => state.simulateRun);

  const isProfessional = mode === 'professional';

  React.useEffect(() => {
    setRequiredTr(Number(loadTr.toFixed(2)));
  }, [loadTr, setRequiredTr]);

  const selectedCandidate =
    result.candidates.find((item) => item.id === result.selectedCandidateId) ?? result.candidates[0] ?? null;

  return (
    <div className="space-y-8 lg:space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Card
          title="Equipment Selection"
          subtitle="Scored multi-option shortlist with lifecycle cost and lock override"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset}>
                <RefreshCcw size={14} />
                Reset
              </Button>
              <Button size="sm" loading={loading} onClick={() => void simulateRun()}>
                <WandSparkles size={14} />
                Recalculate
              </Button>
            </div>
          }
        >
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Selected Option</p>
              <p className="mt-1.5 text-[1.1rem] font-extrabold leading-tight text-[color:var(--foreground)]">
                {selectedCandidate?.model ?? 'No candidate'}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Capex</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                PHP {Math.round(selectedCandidate?.capexPhp ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">5-Year Lifecycle</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                PHP {Math.round(selectedCandidate?.totalLifecyclePhp ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </motion.section>

      <section className="grid gap-7 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Selection Inputs" subtitle="Budget and optimization controls">
            <div className="space-y-4">
              <InputField
                label="Required Capacity"
                value={inputs.requiredTr}
                onValueChange={(next) => setInput('requiredTr', Number(next))}
                unit="TR"
                min={0.5}
                max={200}
                step={0.1}
                helperText="Auto-synced from load calculation TR"
              />

              <div className="space-y-2">
                <label className="text-[12px] font-bold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                  Budget Band
                </label>
                <select
                  value={inputs.budgetBand}
                  onChange={(event) => setInput('budgetBand', event.target.value as typeof inputs.budgetBand)}
                  className="h-12 w-full rounded-2xl border border-[color:var(--input)] bg-[color:var(--surface-2)] px-4 text-[15px] text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  <option value="economy">Economy</option>
                  <option value="balanced">Balanced</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-bold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                  Optimization Priority
                </label>
                <select
                  value={inputs.optimizationPriority}
                  onChange={(event) => setInput('optimizationPriority', event.target.value as typeof inputs.optimizationPriority)}
                  className="h-12 w-full rounded-2xl border border-[color:var(--input)] bg-[color:var(--surface-2)] px-4 text-[15px] text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  <option value="capex">Capex</option>
                  <option value="balanced">Balanced</option>
                  <option value="efficiency">Efficiency</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={inputs.redundancyNPlusOne}
                  onChange={(event) => setInput('redundancyNPlusOne', event.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--input)]"
                />
                Enable N+1 Redundancy
              </label>

              <InputField
                label="Electricity Rate"
                value={inputs.electricityRatePhpKwh}
                onValueChange={(next) => setInput('electricityRatePhpKwh', Number(next))}
                unit="PHP/kWh"
                min={3}
                max={40}
                step={0.1}
              />

              <InputField
                label="Operating Hours"
                value={inputs.operatingHoursPerYear}
                onValueChange={(next) => setInput('operatingHoursPerYear', Number(next))}
                unit="hr/yr"
                min={500}
                max={8760}
                step={100}
              />

              <InputField
                label="Max Units"
                value={inputs.maxUnits}
                onValueChange={(next) => setInput('maxUnits', Math.max(1, Math.round(Number(next))))}
                min={1}
                max={20}
                step={1}
              />
            </div>
          </Card>

          <CollapsiblePanel
            title="Manual Lock Override"
            subtitle="Force report outputs to a selected candidate option"
            defaultOpen={isProfessional}
          >
            <div className="space-y-2">
              <label className="text-[12px] font-bold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                Locked Option
              </label>
              <select
                value={overrides.lockOptionId ?? ''}
                onChange={(event) => setOverride('lockOptionId', event.target.value || null)}
                className="h-12 w-full rounded-2xl border border-[color:var(--input)] bg-[color:var(--surface-2)] px-4 text-[15px] text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                <option value="">Auto-select top score</option>
                {result.candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.model} - {candidate.quantity} unit(s)
                  </option>
                ))}
              </select>
            </div>
          </CollapsiblePanel>
        </div>

        <div className="space-y-6">
          <Card title="Candidate Scoreboard" subtitle="Score and utilization comparison across shortlisted options">
            <div className="h-[360px] w-full">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.candidates} margin={{ top: 10, right: 18, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                    <XAxis dataKey="id" tick={{ fontSize: 10 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="score" name="Score" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                    <Bar yAxisId="right" dataKey="utilizationPct" name="Utilization %" fill="var(--brand-copper)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
              )}
            </div>
          </Card>

          <Card title="Option Matrix" subtitle="Sortable shortlist with capex, energy, lifecycle and score">
            <DenseDataTable rows={result.candidates} columns={columns} title="Equipment shortlist" />
          </Card>

          <CollapsiblePanel
            title="Formula Transparency"
            subtitle="Capacity and lifecycle equations applied for scoring"
            defaultOpen={isProfessional}
          >
            {isProfessional ? (
              <div className="space-y-4">
                {result.formulas.map((formula) => (
                  <div key={formula.label} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">{formula.label}</p>
                    <p className="mt-1 font-mono text-xs text-[color:var(--muted-foreground)]">{formula.expression}</p>
                    <p className="mt-1.5 text-xs font-semibold text-[color:var(--accent)]">{formula.value}</p>
                  </div>
                ))}
                {result.alerts.length > 0 && (
                  <div className="rounded-xl border border-[color:var(--warning)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--foreground)]">
                    {result.alerts.map((alert) => (
                      <p key={alert} className="mt-1 first:mt-0">{alert}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted-foreground)]">
                <Info size={14} className="mt-0.5 shrink-0" />
                Formula traces are available in Professional mode.
              </div>
            )}
          </CollapsiblePanel>
        </div>
      </section>
    </div>
  );
}
