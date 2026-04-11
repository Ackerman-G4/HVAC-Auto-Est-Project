'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ChevronRight,
  Flame,
  Thermometer,
  Wind,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';
import { useEquipmentWorkspaceStore } from '@/stores/equipment-workspace-store';
import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';

const CHART_COLORS = [
  'var(--accent)',
  'var(--primary)',
  'var(--warning)',
  'var(--success)',
  'var(--muted-foreground)',
];

const CHART_DOT_CLASSES = [
  'bg-accent',
  'bg-primary',
  'bg-warning',
  'bg-success',
  'bg-muted-foreground',
];

export default function DashboardPage() {
  const router = useRouter();
  const loadResult = useLoadWorkspaceStore((state) => state.result);
  const loadInputs = useLoadWorkspaceStore((state) => state.inputs);
  const equipResult = useEquipmentWorkspaceStore((state) => state.result);
  const projects = useProjectStore((state) => state.projects);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const user = useAuthStore((state) => state.user);
  const authInitialized = useAuthStore((state) => state.initialized);

  React.useEffect(() => {
    if (user) void fetchProjects();
  }, [fetchProjects, user]);

  React.useEffect(() => {
    if (authInitialized && !user) {
      router.replace('/auth/login');
    }
  }, [authInitialized, user, router]);

  const breakdown = loadResult.breakdown;

  const selectedCandidate = equipResult.candidates.find(
    (c) => c.id === equipResult.selectedCandidateId
  );
  const totalCost = selectedCandidate?.capexPhp ?? 0;

  const loadDistData = [
    { name: 'Envelope', value: breakdown.envelopeBtu },
    { name: 'People (Sensible)', value: breakdown.peopleSensibleBtu },
    { name: 'People (Latent)', value: breakdown.peopleLatentBtu },
    { name: 'Lighting', value: breakdown.lightingBtu },
    { name: 'Equipment', value: breakdown.equipmentBtu },
    { name: 'Ventilation (Sensible)', value: breakdown.ventilationSensibleBtu },
    { name: 'Ventilation (Latent)', value: breakdown.ventilationLatentBtu },
  ].filter((d) => d.value > 0);

  const costData = equipResult.candidates.slice(0, 5).map((c) => ({
    name: c.model ?? c.id,
    capex: Math.round(c.capexPhp),
    energy: Math.round(c.annualEnergyCostPhp),
  }));

  const recentProjects = projects.slice(0, 5);
  const ambientTemp = loadInputs.outdoorTempC.toFixed(1);
  const indoorSetpoint = loadInputs.indoorTempC.toFixed(1);
  const ventilation = loadInputs.ventilationCfmPerPerson.toFixed(0);
  const safetyMargin = `${Math.round((loadInputs.safetyFactor - 1) * 100)}%`;

  return (
    <div className="space-y-(--space-section-gap)">
      {/* KPI Row */}
      <section className="grid gap-(--space-component-gap) sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Load"
          value={`${breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h`}
          icon={Flame}
        />
        <StatCard
          title="Cooling Tonnage"
          value={`${breakdown.trRequired.toFixed(2)} TR`}
          icon={Thermometer}
        />
        <StatCard
          title="Airflow Demand"
          value={`${breakdown.cfmRequired.toLocaleString()} CFM`}
          icon={Wind}
        />
        <StatCard
          title="Estimated Cost"
          value={totalCost > 0 ? `₱${totalCost.toLocaleString()}` : '—'}
          icon={Activity}
        />
      </section>

      {/* Main Intelligence Grid */}
      <section className="grid gap-(--space-component-gap) xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid gap-(--space-component-gap)">
        {/* Load Distribution Chart */}
        <Card className="p-(--space-card-padding)">
          <h3 className="mb-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Load Distribution
          </h3>
          {loadDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={loadDistData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={2}
                  stroke="none"
                >
                  {loadDistData.map((_entry, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `${Number(value).toLocaleString()} BTU/h`}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-70 items-center justify-center text-sm text-muted-foreground">
              Run a load calculation to see distribution
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {loadDistData.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${CHART_DOT_CLASSES[i % CHART_DOT_CLASSES.length]}`}
                />
                {d.name}
              </span>
            ))}
          </div>
        </Card>

        {/* Cost Breakdown Chart */}
        <Card className="p-(--space-card-padding)">
          <h3 className="mb-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cost Breakdown
          </h3>
          {costData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={costData} barGap={4}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `₱${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value) => `₱${Number(value).toLocaleString()}`}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="capex" name="CAPEX" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="energy" name="Annual Energy" fill="var(--warning)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-70 items-center justify-center text-sm text-muted-foreground">
              Select equipment to see cost comparison
            </div>
          )}
        </Card>
        </div>

        <div className="grid gap-(--space-component-gap)">
          <Card className="p-(--space-card-padding)">
            <h3 className="mb-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Environment Snapshot
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-secondary/45 p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Outdoor Temperature</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{ambientTemp} C</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/45 p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Indoor Setpoint</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{indoorSetpoint} C</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/45 p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ventilation Rate</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{ventilation} CFM/P</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/45 p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Safety Margin</p>
                <p className="mt-2 text-2xl font-semibold text-accent">{safetyMargin}</p>
              </div>
            </div>
          </Card>

          {/* System Status */}
          <Card className="p-(--space-card-padding)">
          <h3 className="mb-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            System Status
          </h3>
          <div className="space-y-4">
            <StatusRow label="Load Engine" ok={breakdown.totalBtuAfterFactors > 0} />
            <StatusRow label="Equipment Engine" ok={equipResult.candidates.length > 0} />
            <StatusRow label="Project Data" ok={projects.length > 0} />
          </div>
        </Card>
        </div>
      </section>

      {/* Recent Projects */}
      <section>
        <Card className="p-(--space-card-padding)">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent Projects
            </h3>
            <Link href="/projects" className="text-xs font-semibold text-primary hover:text-primary/80">
              View all
            </Link>
          </div>
          {recentProjects.length > 0 ? (
            <ul className="divide-y divide-border">
              {recentProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between py-3.5 text-sm transition-colors hover:text-primary"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project.status}
                      </p>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-45 items-center justify-center text-sm text-muted-foreground">
              No projects yet
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          ok
            ? 'bg-accent/10 text-accent'
            : 'bg-secondary text-muted-foreground'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-accent' : 'bg-muted-foreground'}`} />
        {ok ? 'Active' : 'Pending'}
      </span>
    </div>
  );
}
