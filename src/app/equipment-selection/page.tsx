'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCcw, WandSparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import { DenseDataTable, DenseColumn } from '@/components/rebuild/DenseDataTable';
import { InputField } from '@/components/rebuild/InputField';
import { EquipmentCandidate } from '@/lib/engine/hvac/equipment-selection-engine';
import {
  calculateTotalProjectCost,
  type CostBreakdown,
} from '@/lib/engine/pricing-engine';
import { useEquipmentWorkspaceStore } from '@/stores/equipment-workspace-store';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';

const CHART_COLORS = [
  'var(--accent)',
  'var(--warning)',
  'var(--primary)',
  'var(--muted-foreground)',
];

const CHART_DOT_CLASSES = [
  'bg-(--accent)',
  'bg-(--warning)',
  'bg-(--primary)',
  'bg-(--muted-foreground)',
];

const columns: DenseColumn<EquipmentCandidate>[] = [
  { key: 'model', header: 'Model' },
  { key: 'type', header: 'Type' },
  { key: 'quantity', header: 'Qty', align: 'right' },
  { key: 'providedTr', header: 'TR', align: 'right' },
  { key: 'utilizationPct', header: 'Util %', align: 'right' },
  {
    key: 'capexPhp',
    header: 'Capex',
    align: 'right',
    render: (row) => `₱${Number(row.capexPhp).toLocaleString()}`,
  },
  {
    key: 'annualEnergyCostPhp',
    header: 'Energy/yr',
    align: 'right',
    render: (row) => `₱${Number(row.annualEnergyCostPhp).toLocaleString()}`,
  },
  { key: 'score', header: 'Score', align: 'right' },
];

export default function EquipmentSelectionPage() {
  const [chartsReady, setChartsReady] = React.useState(false);

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

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

  React.useEffect(() => {
    setRequiredTr(Number(loadTr.toFixed(2)));
  }, [loadTr, setRequiredTr]);

  const selectedCandidate =
    result.candidates.find((item) => item.id === result.selectedCandidateId) ?? result.candidates[0] ?? null;

  // Compute full project cost via pricing engine
  const costBreakdown: CostBreakdown | null = React.useMemo(() => {
    if (!selectedCandidate) return null;
    return calculateTotalProjectCost({
      equipment: [
        {
          manufacturer: selectedCandidate.model.split(' ')[0] ?? 'Unknown',
          unitPricePHP: selectedCandidate.capexPhp / Math.max(1, selectedCandidate.quantity),
          quantity: selectedCandidate.quantity,
          type: selectedCandidate.type,
        },
      ],
    });
  }, [selectedCandidate]);

  const costPieData = costBreakdown
    ? [
        { name: 'Equipment', value: costBreakdown.equipmentCost },
        { name: 'Materials', value: costBreakdown.materialCost },
        { name: 'Labor', value: costBreakdown.laborCost },
        { name: 'OH + Contingency', value: costBreakdown.overhead + costBreakdown.contingency },
      ]
    : [];

  return (
    <div className="space-y-(--space-section-gap)">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Equipment & Costing</h2>
          <p className="text-xs text-muted-foreground">
            {inputs.requiredTr.toFixed(1)} TR required &middot; {inputs.budgetBand} &middot; {inputs.optimizationPriority} priority
          </p>
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

      {/* Main: left config + right cost breakdown */}
      <section className="grid gap-(--space-component-gap) xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left — System Config */}
        <div className="space-y-(--space-component-gap)">
          <Card className="p-8">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              System Configuration
            </h3>
            <div className="space-y-4">
              <InputField label="Required Capacity" value={inputs.requiredTr} onValueChange={(next) => setInput('requiredTr', Number(next))} unit="TR" min={0.5} max={200} step={0.1} />

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Budget Band</label>
                <select
                  value={inputs.budgetBand}
                  onChange={(event) => setInput('budgetBand', event.target.value as typeof inputs.budgetBand)}
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  aria-label="Budget Band"
                >
                  <option value="economy">Economy</option>
                  <option value="balanced">Balanced</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Optimization</label>
                <select
                  value={inputs.optimizationPriority}
                  onChange={(event) => setInput('optimizationPriority', event.target.value as typeof inputs.optimizationPriority)}
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  aria-label="Optimization Priority"
                >
                  <option value="capex">Capex</option>
                  <option value="balanced">Balanced</option>
                  <option value="efficiency">Efficiency</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={inputs.redundancyNPlusOne} onChange={(event) => setInput('redundancyNPlusOne', event.target.checked)} className="h-4 w-4 rounded border-input" />
                N+1 Redundancy
              </label>

              <InputField label="Electricity Rate" value={inputs.electricityRatePhpKwh} onValueChange={(next) => setInput('electricityRatePhpKwh', Number(next))} unit="₱/kWh" min={3} max={40} step={0.1} />
              <InputField label="Operating Hours" value={inputs.operatingHoursPerYear} onValueChange={(next) => setInput('operatingHoursPerYear', Number(next))} unit="hr/yr" min={500} max={8760} step={100} />
              <InputField label="Max Units" value={inputs.maxUnits} onValueChange={(next) => setInput('maxUnits', Math.max(1, Math.round(Number(next))))} min={1} max={20} step={1} />
            </div>
          </Card>

          {/* Lock Override */}
          <Card className="p-8">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Lock Override
            </h3>
            <select
              value={overrides.lockOptionId ?? ''}
              onChange={(event) => setOverride('lockOptionId', event.target.value || null)}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
              aria-label="Lock Override"
            >
              <option value="">Auto-select top score</option>
              {result.candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.model} — {candidate.quantity} unit(s)
                </option>
              ))}
            </select>
          </Card>
        </div>

        {/* Right — Cost Breakdown + Chart */}
        <div className="space-y-(--space-component-gap)">
          {/* KPI Row */}
          <div className="grid gap-(--space-component-gap) sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Equipment" value={costBreakdown ? `₱${costBreakdown.equipmentCost.toLocaleString()}` : '—'} />
            <StatCard title="Materials" value={costBreakdown ? `₱${costBreakdown.materialCost.toLocaleString()}` : '—'} />
            <StatCard title="Labor" value={costBreakdown ? `₱${costBreakdown.laborCost.toLocaleString()}` : '—'} />
            <StatCard title="Grand Total" value={costBreakdown ? `₱${costBreakdown.grandTotal.toLocaleString()}` : '—'} />
          </div>

          {/* Cost Pie + Score Bar */}
          <div className="grid gap-(--space-component-gap) lg:grid-cols-2">
            <Card className="p-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cost Distribution
              </h3>
              {costPieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={costPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2} stroke="none">
                        {costPieData.map((_entry, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `₱${Number(value).toLocaleString()}`} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {costPieData.map((d, i) => (
                      <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${CHART_DOT_CLASSES[i % CHART_DOT_CLASSES.length]}`} />
                        {d.name}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-65 items-center justify-center text-sm text-muted-foreground">Run calculation to see costs</div>
              )}
            </Card>

            <Card className="p-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Candidate Scores
              </h3>
              {chartsReady && result.candidates.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={result.candidates} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                    <XAxis dataKey="model" tick={{ fontSize: 10 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="score" name="Score" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="utilizationPct" name="Util %" fill="var(--warning)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-65 items-center justify-center text-sm text-muted-foreground">Preparing chart...</div>
              )}
            </Card>
          </div>

          {/* Full-width candidate table */}
          <Card className="p-8">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Equipment Shortlist
            </h3>
            <DenseDataTable rows={result.candidates} columns={columns} title="Equipment shortlist" />
          </Card>

          {/* Detailed Cost Table */}
          {costBreakdown && (
            <Card className="p-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cost Summary
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {([
                    ['Equipment', costBreakdown.equipmentCost],
                    ['Materials', costBreakdown.materialCost],
                    ['Labor (30%)', costBreakdown.laborCost],
                    ['Subtotal', costBreakdown.subtotal],
                    ['Overhead (10%)', costBreakdown.overhead],
                    ['Contingency (5%)', costBreakdown.contingency],
                    ['Net Total', costBreakdown.netTotal],
                    ['VAT (12%)', costBreakdown.vat],
                    ['Grand Total', costBreakdown.grandTotal],
                  ] as [string, number][]).map(([label, value]) => (
                    <tr key={label} className={label === 'Grand Total' ? 'font-bold' : ''}>
                      <td className="py-2 text-foreground">{label}</td>
                      <td className="py-2 text-right tabular-nums text-foreground">₱{value.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Formula Transparency */}
          <CollapsiblePanel title="Formula Transparency" subtitle="Scoring and lifecycle equations" defaultOpen={false}>
            <div className="space-y-4">
              {result.formulas.map((formula) => (
                <div key={formula.label} className="rounded-lg border border-border bg-secondary p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-foreground">{formula.label}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{formula.expression}</p>
                  <p className="mt-1.5 text-xs font-semibold text-accent">{formula.value}</p>
                </div>
              ))}
            </div>
          </CollapsiblePanel>
        </div>
      </section>
    </div>
  );
}
