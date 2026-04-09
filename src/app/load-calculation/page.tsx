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
import { SpaceType } from '@/lib/engine/hvac/load-calculation-engine';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';
import { useUIStore } from '@/stores/ui-store';

interface EquipmentRow {
  model: string;
  type: string;
  quantity: number;
  providedTr: number;
  utilization: number;
  efficiencyEer: number;
  annualEnergyKwh: number;
  estimatedPhp: number;
}

const spaceTypes: Array<{ value: SpaceType; label: string }> = [
  { value: 'office', label: 'Office' },
  { value: 'retail', label: 'Retail' },
  { value: 'residential', label: 'Residential' },
  { value: 'server_room', label: 'Server Room' },
  { value: 'conference_room', label: 'Conference Room' },
  { value: 'restaurant', label: 'Restaurant' },
];

const equipmentColumns: DenseColumn<EquipmentRow>[] = [
  { key: 'model', header: 'Model' },
  { key: 'type', header: 'Type' },
  { key: 'quantity', header: 'Qty', align: 'right' },
  { key: 'providedTr', header: 'Provided TR', align: 'right' },
  { key: 'utilization', header: 'Utilization %', align: 'right' },
  { key: 'efficiencyEer', header: 'EER', align: 'right' },
  { key: 'annualEnergyKwh', header: 'Annual kWh', align: 'right' },
  {
    key: 'estimatedPhp',
    header: 'Estimated Cost',
    align: 'right',
    render: (row) => `PHP ${Number(row.estimatedPhp).toLocaleString()}`,
  },
];

export default function LoadCalculationPage() {
  const [chartsReady, setChartsReady] = React.useState(false);

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

  const mode = useUIStore((state) => state.workspaceMode);
  const inputs = useLoadWorkspaceStore((state) => state.inputs);
  const overrides = useLoadWorkspaceStore((state) => state.overrides);
  const result = useLoadWorkspaceStore((state) => state.result);
  const loading = useLoadWorkspaceStore((state) => state.loading);
  const setInput = useLoadWorkspaceStore((state) => state.setInput);
  const setSpaceType = useLoadWorkspaceStore((state) => state.setSpaceType);
  const setOverride = useLoadWorkspaceStore((state) => state.setOverride);
  const reset = useLoadWorkspaceStore((state) => state.reset);
  const simulateRun = useLoadWorkspaceStore((state) => state.simulateRun);

  const isProfessional = mode === 'professional';

  const breakdownData = [
    { item: 'Envelope', btu: result.breakdown.envelopeBtu },
    { item: 'People', btu: result.breakdown.peopleBtu },
    { item: 'Lighting', btu: result.breakdown.lightingBtu },
    { item: 'Equipment', btu: result.breakdown.equipmentBtu },
    { item: 'Ventilation', btu: result.breakdown.ventilationBtu },
  ];

  const equipmentRows: EquipmentRow[] = result.equipmentOptions.map((option) => ({
    model: option.model,
    type: option.type,
    quantity: option.quantity,
    providedTr: option.capacityTr * option.quantity,
    utilization: option.utilization,
    efficiencyEer: option.efficiencyEer,
    annualEnergyKwh: option.annualEnergyKwh,
    estimatedPhp: option.estimatedPhp * option.quantity,
  }));

  return (
    <div className="space-y-8 lg:space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Card
          title="Load Calculation"
          subtitle="Automation-first HVAC load sizing with full transparency and manual override controls"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset}>
                <RefreshCcw size={14} />
                Reset
              </Button>
              <Button size="sm" loading={loading} onClick={() => void simulateRun()}>
                <WandSparkles size={14} />
                Run Auto-Calculation
              </Button>
            </div>
          }
        >
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Design Load</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                {result.breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Cooling Tonnage</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                {result.breakdown.trRequired.toFixed(2)} TR
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Airflow</p>
              <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
                {result.breakdown.cfmRequired.toLocaleString()} CFM
              </p>
            </div>
          </div>
        </Card>
      </motion.section>

      <section className="grid gap-7 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Inputs" subtitle="Unit-aware, validated fields with instant recalculation">
            <div className="space-y-4">
              <InputField
                label="Project Name"
                type="text"
                value={inputs.projectName}
                onValueChange={(next) => setInput('projectName', String(next))}
                helperText="Shown in top-level engineering exports"
              />

              <div className="space-y-2">
                <label className="text-[12px] font-bold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                  Space Type
                </label>
                <select
                  value={inputs.spaceType}
                  onChange={(event) => setSpaceType(event.target.value as SpaceType)}
                  className="h-12 w-full rounded-2xl border border-[color:var(--input)] bg-[color:var(--surface-2)] px-4 text-[15px] text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  {spaceTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <InputField
                label="Area"
                value={inputs.areaM2}
                onValueChange={(next) => setInput('areaM2', Number(next))}
                unit="m2"
                min={8}
                max={4000}
                step={1}
              />

              <InputField
                label="Occupants"
                value={inputs.occupants}
                onValueChange={(next) => setInput('occupants', Number(next))}
                unit="pax"
                min={1}
                max={400}
                step={1}
              />

              <InputField
                label="Outdoor Temp"
                value={inputs.outdoorTempC}
                onValueChange={(next) => setInput('outdoorTempC', Number(next))}
                unit="deg C"
                min={16}
                max={50}
                step={0.1}
              />

              <InputField
                label="Indoor Setpoint"
                value={inputs.indoorTempC}
                onValueChange={(next) => setInput('indoorTempC', Number(next))}
                unit="deg C"
                min={16}
                max={30}
                step={0.1}
              />

              <InputField
                label="Equipment Internal Load"
                value={inputs.equipmentLoadW}
                onValueChange={(next) => setInput('equipmentLoadW', Number(next))}
                unit="W"
                min={0}
                max={200000}
                step={100}
              />

              {isProfessional && (
                <>
                  <InputField
                    label="Ceiling Height"
                    value={inputs.ceilingHeightM}
                    onValueChange={(next) => setInput('ceilingHeightM', Number(next))}
                    unit="m"
                    min={2.2}
                    max={8}
                    step={0.1}
                  />
                  <InputField
                    label="Lighting Density"
                    value={inputs.lightingWPerM2}
                    onValueChange={(next) => setInput('lightingWPerM2', Number(next))}
                    unit="W/m2"
                    min={3}
                    max={40}
                    step={0.5}
                  />
                  <InputField
                    label="Ventilation"
                    value={inputs.ventilationCfmPerPerson}
                    onValueChange={(next) => setInput('ventilationCfmPerPerson', Number(next))}
                    unit="CFM/pax"
                    min={4}
                    max={40}
                    step={1}
                  />
                  <InputField
                    label="Safety Factor"
                    value={inputs.safetyFactor}
                    onValueChange={(next) => setInput('safetyFactor', Number(next))}
                    min={1}
                    max={1.4}
                    step={0.01}
                  />
                  <InputField
                    label="Diversity Factor"
                    value={inputs.diversityFactor}
                    onValueChange={(next) => setInput('diversityFactor', Number(next))}
                    min={0.7}
                    max={1.2}
                    step={0.01}
                  />
                  <InputField
                    label="Supply Delta T"
                    value={inputs.supplyDeltaTF}
                    onValueChange={(next) => setInput('supplyDeltaTF', Number(next))}
                    unit="deg F"
                    min={12}
                    max={25}
                    step={1}
                  />
                </>
              )}
            </div>
          </Card>

          <CollapsiblePanel
            title="Automation + Manual Override"
            subtitle="Override any critical output while preserving base calculation trace"
            defaultOpen={isProfessional}
          >
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={overrides.useManualTotalBtu}
                  onChange={(event) => setOverride('useManualTotalBtu', event.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--input)]"
                />
                Manual Total Load Override
              </label>
              {overrides.useManualTotalBtu && (
                <InputField
                  label="Manual Total Load"
                  value={overrides.manualTotalBtu ?? result.breakdown.totalBtuAfterFactors}
                  onValueChange={(next) => setOverride('manualTotalBtu', Number(next))}
                  unit="BTU/h"
                  min={5000}
                  max={600000}
                  step={100}
                />
              )}

              <label className="flex items-center gap-2 pt-1 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={overrides.useManualCfm}
                  onChange={(event) => setOverride('useManualCfm', event.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--input)]"
                />
                Manual Airflow Override
              </label>
              {overrides.useManualCfm && (
                <InputField
                  label="Manual Airflow"
                  value={overrides.manualCfm ?? result.breakdown.cfmRequired}
                  onValueChange={(next) => setOverride('manualCfm', Number(next))}
                  unit="CFM"
                  min={100}
                  max={50000}
                  step={10}
                />
              )}
            </div>
          </CollapsiblePanel>
        </div>

        <div className="space-y-6">
          <Card title="Load Component Chart" subtitle="BTU distribution by component">
            <div className="h-[330px] w-full">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdownData} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                    <XAxis dataKey="item" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <Tooltip />
                    <Bar dataKey="btu" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
              )}
            </div>
          </Card>

          <Card title="Airflow Diagram" subtitle="Zone airflow and indicative velocity profile">
            <div className="h-[330px] w-full">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.airflowMap} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                    <XAxis dataKey="zone" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine yAxisId="right" y={950} stroke="var(--warning)" strokeDasharray="4 4" />
                    <Line yAxisId="left" type="monotone" dataKey="cfm" name="CFM" stroke="var(--accent)" strokeWidth={2.4} dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="velocityFpm" name="Velocity (FPM)" stroke="var(--brand-copper)" strokeWidth={2.4} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
              )}
            </div>
          </Card>

          <Card title="Equipment Comparison" subtitle="Sortable shortlist with cost and utilization detail">
            <DenseDataTable rows={equipmentRows} columns={equipmentColumns} title="Candidate units" />
          </Card>

          <CollapsiblePanel
            title="Formula Transparency"
            subtitle="Engineering terms and exact equation traces"
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
