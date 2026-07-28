'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
// Keep recharts out of this route's first-load JS.
const LoadBreakdownChart = dynamic(
  () => import('@/components/charts/LoadCalcCharts').then((m) => m.LoadBreakdownChart),
  { ssr: false, loading: () => <ChartSkeleton height="100%" /> },
);
const AirflowProfileChart = dynamic(
  () => import('@/components/charts/LoadCalcCharts').then((m) => m.AirflowProfileChart),
  { ssr: false, loading: () => <ChartSkeleton height="100%" /> },
);
import { Info, MapPin, Plus, RefreshCcw, WandSparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-wrapper';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { CalcBreakdown } from '@/components/ui/calc-breakdown';
import { Stagger, StaggerItem } from '@/components/ui/reveal';
import LoadBreakdownBar, { segmentsFromEntries } from '@/components/load/LoadBreakdownBar';
import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import { DenseColumn, DenseDataTable } from '@/components/rebuild/DenseDataTable';
import { InputField } from '@/components/rebuild/InputField';
import { SpaceType } from '@/lib/engine/hvac/load-calculation-engine';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';

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
    render: (row) => `₱${Number(row.estimatedPhp).toLocaleString()}`,
  },
];

export default function LoadCalculationPage() {
  const [chartsReady, setChartsReady] = React.useState(false);
  const [location, setLocation] = React.useState('');

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

  const inputs = useLoadWorkspaceStore((state) => state.inputs);
  const overrides = useLoadWorkspaceStore((state) => state.overrides);
  const result = useLoadWorkspaceStore((state) => state.result);
  const loading = useLoadWorkspaceStore((state) => state.loading);
  const setInput = useLoadWorkspaceStore((state) => state.setInput);
  const setSpaceType = useLoadWorkspaceStore((state) => state.setSpaceType);
  const setOverride = useLoadWorkspaceStore((state) => state.setOverride);
  const reset = useLoadWorkspaceStore((state) => state.reset);
  const simulateRun = useLoadWorkspaceStore((state) => state.simulateRun);

  const breakdownData = [
    { item: 'Envelope', btu: result.breakdown.envelopeBtu },
    { item: 'People (Sensible)', btu: result.breakdown.peopleSensibleBtu },
    { item: 'People (Latent)', btu: result.breakdown.peopleLatentBtu },
    { item: 'Lighting', btu: result.breakdown.lightingBtu },
    { item: 'Equipment', btu: result.breakdown.equipmentBtu },
    { item: 'Ventilation (Sensible)', btu: result.breakdown.ventilationSensibleBtu },
    { item: 'Ventilation (Latent)', btu: result.breakdown.ventilationLatentBtu },
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
    <div className="space-y-(--space-section-gap)">
      <PageHeader
        title="Load Calculation"
        description="Estimate cooling load, airflow, and equipment sizing for a space."
      />
      {/* 2-Column Layout — Project Info & Inputs (left), Outputs (right) */}
      <section className="grid gap-(--space-component-gap) xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* Left Column — Project Info + Room Parameters */}
        <div className="space-y-(--space-component-gap)">
          {/* Project Info Card */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Project Info
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>
                    <RefreshCcw size={14} className="mr-1" />
                    Reset
                  </Button>
                  <Button size="sm" isLoading={loading} onClick={() => void simulateRun()}>
                    <WandSparkles size={14} className="mr-1" />
                    Run Calculation
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Project Name"
                  type="text"
                  value={inputs.projectName}
                  onValueChange={(next) => setInput('projectName', String(next))}
                />
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Space Type
                  </label>
                  <select
                    value={inputs.spaceType}
                    onChange={(event) => setSpaceType(event.target.value as SpaceType)}
                    className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                    aria-label="Space Type"
                  >
                    {spaceTypes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Location
                    </label>
                    <div className="relative">
                      <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="City or address"
                        className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                      />
                    </div>
                  </div>
                </div>
                <InputField label="Floor Area" value={inputs.areaM2} onValueChange={(next) => setInput('areaM2', Number(next))} unit="m²" min={8} max={4000} step={1} />
                <InputField label="Occupants" value={inputs.occupants} onValueChange={(next) => setInput('occupants', Number(next))} unit="pax" min={1} max={400} step={1} />
              </div>
            </CardContent>
          </Card>

          {/* Room List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Rooms
                </CardTitle>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title="Add room (coming soon)"
                >
                  <Plus size={14} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <button
                  type="button"
                  className="w-full rounded-lg bg-primary/10 px-3 py-2.5 text-left text-sm font-medium text-foreground"
                >
                  <span className="block truncate">{inputs.projectName || 'Room 1'}</span>
                  <span className="text-xs text-muted-foreground">
                    {inputs.areaM2} m² &middot; {inputs.spaceType.replace('_', ' ')}
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Room Parameters (Inputs) Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Room Parameters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 sm:grid-cols-2">
                <InputField label="Outdoor Temp" value={inputs.outdoorTempC} onValueChange={(next) => setInput('outdoorTempC', Number(next))} unit="°C" min={16} max={50} step={0.1} />
                <InputField label="Indoor Setpoint" value={inputs.indoorTempC} onValueChange={(next) => setInput('indoorTempC', Number(next))} unit="°C" min={16} max={30} step={0.1} />
                <InputField label="Equipment Load" value={inputs.equipmentLoadW} onValueChange={(next) => setInput('equipmentLoadW', Number(next))} unit="W" min={0} max={200000} step={100} />
                <InputField label="Ceiling Height" value={inputs.ceilingHeightM} onValueChange={(next) => setInput('ceilingHeightM', Number(next))} unit="m" min={2.2} max={8} step={0.1} />
                <InputField label="Lighting Density" value={inputs.lightingWPerM2} onValueChange={(next) => setInput('lightingWPerM2', Number(next))} unit="W/m²" min={3} max={40} step={0.5} />
                <InputField label="Ventilation" value={inputs.ventilationCfmPerPerson} onValueChange={(next) => setInput('ventilationCfmPerPerson', Number(next))} unit="CFM/pax" min={4} max={40} step={1} />
                <InputField label="Safety Factor" value={inputs.safetyFactor} onValueChange={(next) => setInput('safetyFactor', Number(next))} min={1} max={1.4} step={0.01} />
                <InputField label="Diversity Factor" value={inputs.diversityFactor} onValueChange={(next) => setInput('diversityFactor', Number(next))} min={0.7} max={1.2} step={0.01} />
                <InputField label="Supply Delta T" value={inputs.supplyDeltaTF} onValueChange={(next) => setInput('supplyDeltaTF', Number(next))} unit="°F" min={12} max={25} step={1} />
              </div>

              {/* Override controls */}
              <div className="mt-6 border-t border-border pt-5">
                <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Manual Overrides</h4>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={overrides.useManualTotalBtu}
                        onChange={(event) => setOverride('useManualTotalBtu', event.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      Override Total Load
                    </label>
                    {overrides.useManualTotalBtu && (
                      <div className="mt-2">
                        <InputField
                          label="Manual Total Load"
                          value={overrides.manualTotalBtu ?? result.breakdown.totalBtuAfterFactors}
                          onValueChange={(next) => setOverride('manualTotalBtu', Number(next))}
                          unit="BTU/h"
                          min={5000}
                          max={600000}
                          step={100}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={overrides.useManualCfm}
                        onChange={(event) => setOverride('useManualCfm', event.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      Override Airflow
                    </label>
                    {overrides.useManualCfm && (
                      <div className="mt-2">
                        <InputField
                          label="Manual Airflow"
                          value={overrides.manualCfm ?? result.breakdown.cfmRequired}
                          onValueChange={(next) => setOverride('manualCfm', Number(next))}
                          unit="CFM"
                          min={100}
                          max={50000}
                          step={10}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column — Outputs */}
        <div className="space-y-(--space-component-gap)">
          {/* Results header + explain-the-numbers affordance (plan §4.4) */}
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Calculation Results</h3>
            <CalcBreakdown
              title="Cooling Load Breakdown"
              formulas={result.formulas}
              note="Values are derived from envelope, people, lighting, equipment, and ventilation gains per the ASHRAE-based cooling-load engine."
            />
          </div>
          {/* KPI Summary */}
          <Stagger className="grid gap-(--space-component-gap) sm:grid-cols-3">
            <StaggerItem><StatCard title="Design Load" value={`${result.breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h`} /></StaggerItem>
            <StaggerItem><StatCard title="Cooling Tonnage" value={`${result.breakdown.trRequired.toFixed(2)} TR`} /></StaggerItem>
            <StaggerItem><StatCard title="Airflow" value={`${result.breakdown.cfmRequired.toLocaleString()} CFM`} /></StaggerItem>
          </Stagger>

          {/* Load Breakdown Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Load Component Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
            {/* Stacked horizontal assembly bar (plan §6.3) — shows where the heat comes from */}
            <div className="mb-4">
              <LoadBreakdownBar
                segments={segmentsFromEntries(breakdownData.map((d) => ({ label: d.item, value: d.btu })))}
                unit="BTU/h"
                totalLabel="Total (before factors)"
                totalSuffix={`${result.breakdown.trRequired.toFixed(2)} TR`}
              />
            </div>
            <div className="h-75 w-full">
              {chartsReady ? (
                <LoadBreakdownChart data={breakdownData} />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Preparing chart...</div>
              )}
            </div>
            </CardContent>
          </Card>

          {/* Airflow & Velocity Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Airflow & Velocity Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
            <div className="h-75 w-full">
              {chartsReady ? (
                <AirflowProfileChart data={result.airflowMap} />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Preparing chart...</div>
              )}
            </div>
            </CardContent>
          </Card>

          {/* Equipment Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Equipment Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DenseDataTable rows={equipmentRows} columns={equipmentColumns} title="Candidate units" />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Formula Transparency */}
      <CollapsiblePanel
        title="Formula Transparency"
        subtitle="Engineering terms and exact equation traces"
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
            <div className="flex items-start gap-2 rounded-lg border border-warning bg-warning/10 p-4 text-sm text-foreground">
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
    </div>
  );
}
