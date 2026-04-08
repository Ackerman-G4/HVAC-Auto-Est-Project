'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
import { DenseColumn, DenseDataTable } from '@/components/rebuild/DenseDataTable';
import { InputField } from '@/components/rebuild/InputField';
import { BranchSizingRow } from '@/lib/engine/hvac/airflow-duct-engine';
import { useAirflowWorkspaceStore } from '@/stores/airflow-workspace-store';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';
import { useUIStore } from '@/stores/ui-store';

const branchColumns: DenseColumn<BranchSizingRow>[] = [
  { key: 'branch', header: 'Branch' },
  { key: 'designCfm', header: 'Design CFM', align: 'right' },
  { key: 'velocityFpm', header: 'Velocity (FPM)', align: 'right' },
  { key: 'roundDiameterIn', header: 'Round (in)', align: 'right' },
  { key: 'rectangularSizeIn', header: 'Rectangular (in)', align: 'center' },
  { key: 'pressureDropInWg', header: 'Pressure Drop (in.wg)', align: 'right' },
];

export default function AirflowDuctDesignPage() {
  const [chartsReady, setChartsReady] = React.useState(false);

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

  const mode = useUIStore((state) => state.workspaceMode);
  const loadCfm = useLoadWorkspaceStore((state) => state.result.breakdown.cfmRequired);
  const inputs = useAirflowWorkspaceStore((state) => state.inputs);
  const overrides = useAirflowWorkspaceStore((state) => state.overrides);
  const result = useAirflowWorkspaceStore((state) => state.result);
  const loading = useAirflowWorkspaceStore((state) => state.loading);
  const setInput = useAirflowWorkspaceStore((state) => state.setInput);
  const setOverride = useAirflowWorkspaceStore((state) => state.setOverride);
  const setSupplyCfm = useAirflowWorkspaceStore((state) => state.setSupplyCfm);
  const reset = useAirflowWorkspaceStore((state) => state.reset);
  const simulateRun = useAirflowWorkspaceStore((state) => state.simulateRun);

  const isProfessional = mode === 'professional';

  React.useEffect(() => {
    setSupplyCfm(Math.max(200, Math.round(loadCfm)));
  }, [loadCfm, setSupplyCfm]);

  return (
    <div className="space-y-8 lg:space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Card
          title="Airflow / Duct Design"
          subtitle="Duct sizing, static pressure budgeting, and fan power estimation with override controls"
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
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Total Static</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                {result.totalStaticPressureInWg.toFixed(2)} in.wg
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Fan Power</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                {result.requiredFanPowerHp.toFixed(2)} HP
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Trunk Duct</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                {result.trunkDiameterIn} in
              </p>
            </div>
          </div>
        </Card>
      </motion.section>

      <section className="grid gap-7 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Design Inputs" subtitle="Friction, lengths, branches, and target velocity settings">
            <div className="space-y-4">
              <InputField
                label="Supply Airflow"
                value={inputs.supplyCfm}
                onValueChange={(next) => setInput('supplyCfm', Number(next))}
                unit="CFM"
                min={200}
                max={60000}
                step={50}
                helperText="Auto-synced from load module CFM"
              />
              <InputField
                label="Branches"
                value={inputs.branches}
                onValueChange={(next) => setInput('branches', Math.max(1, Math.round(Number(next))))}
                min={1}
                max={12}
                step={1}
              />
              <InputField
                label="Trunk Length"
                value={inputs.trunkLengthFt}
                onValueChange={(next) => setInput('trunkLengthFt', Number(next))}
                unit="ft"
                min={10}
                max={800}
                step={1}
              />
              <InputField
                label="Longest Branch"
                value={inputs.longestBranchLengthFt}
                onValueChange={(next) => setInput('longestBranchLengthFt', Number(next))}
                unit="ft"
                min={5}
                max={600}
                step={1}
              />
              <InputField
                label="Friction Rate"
                value={inputs.frictionRateInWgPer100Ft}
                onValueChange={(next) => setInput('frictionRateInWgPer100Ft', Number(next))}
                unit="in.wg/100ft"
                min={0.03}
                max={0.3}
                step={0.01}
              />
              <InputField
                label="Target Velocity"
                value={inputs.targetVelocityFpm}
                onValueChange={(next) => setInput('targetVelocityFpm', Number(next))}
                unit="FPM"
                min={500}
                max={1800}
                step={10}
              />
              <InputField
                label="Fan Efficiency"
                value={inputs.fanEfficiency}
                onValueChange={(next) => setInput('fanEfficiency', Number(next))}
                min={0.4}
                max={0.85}
                step={0.01}
              />
              <InputField
                label="Fitting Loss"
                value={inputs.fittingLossFactor}
                onValueChange={(next) => setInput('fittingLossFactor', Number(next))}
                unit="in.wg"
                min={0}
                max={4}
                step={0.05}
              />
            </div>
          </Card>

          <CollapsiblePanel
            title="Manual Override"
            subtitle="Force total static pressure when validating against field measurements"
            defaultOpen={isProfessional}
          >
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={overrides.useManualStaticPressure}
                  onChange={(event) => setOverride('useManualStaticPressure', event.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--input)]"
                />
                Manual Static Pressure Override
              </label>
              {overrides.useManualStaticPressure && (
                <InputField
                  label="Manual Static Pressure"
                  value={overrides.manualStaticPressureInWg ?? result.totalStaticPressureInWg}
                  onValueChange={(next) => setOverride('manualStaticPressureInWg', Number(next))}
                  unit="in.wg"
                  min={0.1}
                  max={8}
                  step={0.05}
                />
              )}
            </div>
          </CollapsiblePanel>
        </div>

        <div className="space-y-6">
          <Card title="Branch Velocity Profile" subtitle="Velocity and pressure drop per branch">
            <div className="h-[340px] w-full">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.branchRows} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                    <XAxis dataKey="branch" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine yAxisId="left" y={1400} stroke="var(--warning)" strokeDasharray="4 4" />
                    <Line yAxisId="left" type="monotone" dataKey="velocityFpm" name="Velocity (FPM)" stroke="var(--brand-copper)" strokeWidth={2.4} dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="pressureDropInWg" name="Pressure Drop (in.wg)" stroke="var(--accent)" strokeWidth={2.4} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
              )}
            </div>
          </Card>

          <Card title="Branch Airflow Split" subtitle="CFM distribution generated from branch ratio profile">
            <div className="h-[320px] w-full">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.branchRows} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                    <XAxis dataKey="branch" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <Tooltip />
                    <Bar dataKey="designCfm" name="Design CFM" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
              )}
            </div>
          </Card>

          <Card title="Branch Sizing Table" subtitle="Round and equivalent rectangular duct recommendations">
            <DenseDataTable rows={result.branchRows} columns={branchColumns} title="Branch sizing matrix" />
          </Card>

          <CollapsiblePanel
            title="Formula Transparency"
            subtitle="Static pressure and fan power equations used in the current run"
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
