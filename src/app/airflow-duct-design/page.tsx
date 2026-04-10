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
import { Info, RefreshCcw, WandSparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import { DenseColumn, DenseDataTable } from '@/components/rebuild/DenseDataTable';
import { InputField } from '@/components/rebuild/InputField';
import { BranchSizingRow } from '@/lib/engine/hvac/airflow-duct-engine';
import { useAirflowWorkspaceStore } from '@/stores/airflow-workspace-store';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';

const branchColumns: DenseColumn<BranchSizingRow>[] = [
  { key: 'branch', header: 'Branch' },
  { key: 'designCfm', header: 'CFM', align: 'right' },
  { key: 'velocityFpm', header: 'Velocity (FPM)', align: 'right' },
  { key: 'roundDiameterIn', header: 'Round Ø (in)', align: 'right' },
  { key: 'rectangularSizeIn', header: 'Rectangular (in)', align: 'center' },
  { key: 'pressureDropInWg', header: 'Friction Loss (in.wg)', align: 'right' },
];

export default function AirflowDuctDesignPage() {
  const [chartsReady, setChartsReady] = React.useState(false);

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

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

  React.useEffect(() => {
    setSupplyCfm(Math.max(200, Math.round(loadCfm)));
  }, [loadCfm, setSupplyCfm]);

  return (
    <div className="space-y-[var(--space-section-gap)]">
      {/* Top Controls Bar */}
      <Card className="p-8">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            <InputField label="Supply CFM" value={inputs.supplyCfm} onValueChange={(next) => setInput('supplyCfm', Number(next))} unit="CFM" min={200} max={60000} step={50} />
            <InputField label="Branches" value={inputs.branches} onValueChange={(next) => setInput('branches', Math.max(1, Math.round(Number(next))))} min={1} max={12} step={1} />
            <InputField label="Trunk Length" value={inputs.trunkLengthFt} onValueChange={(next) => setInput('trunkLengthFt', Number(next))} unit="ft" min={10} max={800} step={1} />
            <InputField label="Longest Branch" value={inputs.longestBranchLengthFt} onValueChange={(next) => setInput('longestBranchLengthFt', Number(next))} unit="ft" min={5} max={600} step={1} />
            <InputField label="Friction Rate" value={inputs.frictionRateInWgPer100Ft} onValueChange={(next) => setInput('frictionRateInWgPer100Ft', Number(next))} unit="in.wg/100ft" min={0.03} max={0.3} step={0.01} />
            <InputField label="Target Velocity" value={inputs.targetVelocityFpm} onValueChange={(next) => setInput('targetVelocityFpm', Number(next))} unit="FPM" min={500} max={1800} step={10} />
            <InputField label="Fan Efficiency" value={inputs.fanEfficiency} onValueChange={(next) => setInput('fanEfficiency', Number(next))} min={0.4} max={0.85} step={0.01} />
            <InputField label="Fitting Loss" value={inputs.fittingLossFactor} onValueChange={(next) => setInput('fittingLossFactor', Number(next))} unit="in.wg" min={0} max={4} step={0.05} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              <RefreshCcw size={14} className="mr-1" />
              Reset
            </Button>
            <Button size="sm" isLoading={loading} onClick={() => void simulateRun()}>
              <WandSparkles size={14} className="mr-1" />
              Recalculate
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <section className="grid gap-[var(--space-component-gap)] sm:grid-cols-3">
        <StatCard title="Total Static Pressure" value={`${result.totalStaticPressureInWg.toFixed(2)} in.wg`} />
        <StatCard title="Fan Power" value={`${result.requiredFanPowerHp.toFixed(2)} HP`} />
        <StatCard title="Trunk Duct" value={`${result.trunkDiameterIn} in`} />
      </section>

      {/* Full-Width Branch Sizing Table */}
      <Card className="p-8">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Branch Sizing Table
        </h3>
        <DenseDataTable rows={result.branchRows} columns={branchColumns} title="Branch sizing matrix" />
      </Card>

      {/* Charts */}
      <section className="grid gap-[var(--space-component-gap)] lg:grid-cols-2">
        <Card className="p-8">
          <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Velocity & Pressure Profile
          </h3>
          <div className="h-[300px] w-full">
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
                  <Line yAxisId="left" type="monotone" dataKey="velocityFpm" name="Velocity (FPM)" stroke="var(--warning)" strokeWidth={2.4} dot={{ r: 4 }} />
                  <Line yAxisId="right" type="monotone" dataKey="pressureDropInWg" name="Pressure Drop (in.wg)" stroke="var(--accent)" strokeWidth={2.4} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Preparing chart...</div>
            )}
          </div>
        </Card>

        <Card className="p-8">
          <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            CFM Distribution
          </h3>
          <div className="h-[300px] w-full">
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
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Preparing chart...</div>
            )}
          </div>
        </Card>
      </section>

      {/* Override + Formula Transparency */}
      <section className="grid gap-[var(--space-component-gap)] lg:grid-cols-2">
        <CollapsiblePanel
          title="Manual Override"
          subtitle="Force total static pressure for field validation"
          defaultOpen={false}
        >
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={overrides.useManualStaticPressure}
                onChange={(event) => setOverride('useManualStaticPressure', event.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Override Static Pressure
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

        <CollapsiblePanel
          title="Formula Transparency"
          subtitle="Static pressure and fan power equations"
          defaultOpen={false}
        >
          <div className="space-y-4">
            {result.formulas.map((formula) => (
              <div key={formula.label} className="rounded-lg border border-border bg-secondary p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-foreground">{formula.label}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{formula.expression}</p>
                <p className="mt-1.5 text-xs font-semibold text-accent">{formula.value}</p>
              </div>
            ))}
            {result.alerts.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning bg-secondary p-4 text-sm text-foreground">
                <Info size={14} className="mt-0.5 shrink-0" />
                <div>
                  {result.alerts.map((alert) => (
                    <p key={alert} className="mt-1 first:mt-0">{alert}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsiblePanel>
      </section>
    </div>
  );
}
