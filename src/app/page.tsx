'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Calculator,
  Cpu,
  FileText,
  Wind,
} from 'lucide-react';
import { Card } from '@/components/rebuild/Card';
import { Button } from '@/components/rebuild/Button';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';

const modules = [
  {
    title: 'Load Calculation',
    description: 'Compute design BTU, TR, and ventilation CFM in real time with transparent formulas.',
    href: '/load-calculation',
    icon: Calculator,
  },
  {
    title: 'Airflow / Duct Design',
    description: 'Balance zone distribution and validate velocity targets before final layout release.',
    href: '/airflow-duct-design',
    icon: Wind,
  },
  {
    title: 'Equipment Selection',
    description: 'Compare capacity, efficiency, quantity, and annual energy impact across options.',
    href: '/equipment-selection',
    icon: Cpu,
  },
  {
    title: 'Reports',
    description: 'Compile engineering snapshots, sizing outputs, and recommendation summaries.',
    href: '/reports',
    icon: FileText,
  },
];

export default function DashboardPage() {
  const result = useLoadWorkspaceStore((state) => state.result);

  const metrics = [
    {
      label: 'Design Load',
      value: `${result.breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h`,
    },
    {
      label: 'Cooling Tonnage',
      value: `${result.breakdown.trRequired.toFixed(2)} TR`,
    },
    {
      label: 'Airflow Demand',
      value: `${result.breakdown.cfmRequired.toLocaleString()} CFM`,
    },
  ];

  return (
    <div className="space-y-8 lg:space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="rounded-3xl border border-[color:var(--border)] bg-[linear-gradient(140deg,color-mix(in_oklab,var(--surface-1)_92%,transparent),color-mix(in_oklab,var(--surface-2)_62%,transparent))] px-7 py-8 shadow-[0_20px_32px_-24px_rgba(11,16,15,0.8)] sm:px-9 sm:py-10"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">
              HVAC Automation Platform
            </p>
            <h2 className="display-heading mt-2 text-[2.3rem] font-black tracking-[-0.04em] text-[color:var(--foreground)] md:text-[2.8rem]">
              Engineering Workspace Rebuild V1
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-[color:var(--muted-foreground)]">
              This release introduces a from-scratch architecture for calculation-driven workflows with explicit formula traceability and fast module navigation.
            </p>
          </div>
          <Link href="/load-calculation">
            <Button>
              <Activity size={16} />
              Launch Load Calculation
            </Button>
          </Link>
        </div>
      </motion.section>

      <section className="grid gap-6 md:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label} className="h-full">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                {metric.label}
              </p>
              <p className="text-[2.1rem] font-extrabold tracking-[-0.02em] tabular-nums text-[color:var(--foreground)]">
                {metric.value}
              </p>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {modules.map((module, index) => {
          const Icon = module.icon;

          return (
            <motion.div
              key={module.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04, ease: 'easeOut' }}
            >
              <Card
                title={module.title}
                subtitle={module.description}
                actions={
                  <Link href={module.href}>
                    <Button variant="secondary" size="sm">
                      Open
                    </Button>
                  </Link>
                }
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--accent)]">
                    <Icon size={21} />
                  </div>
                  <div className="text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                    Module-ready and integrated with the new state and engineering core.
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </section>

      <Card title="System Direction" subtitle="Architecture goals in active implementation">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4 text-sm text-[color:var(--muted-foreground)]">
            <p className="mb-1 font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">UI Foundation</p>
            Dark-first design system with 8px spacing discipline and modular primitives.
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4 text-sm text-[color:var(--muted-foreground)]">
            <p className="mb-1 font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">Calculation Core</p>
            Separated engine modules for BTU, CFM, and equipment sizing with formula traceability.
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4 text-sm text-[color:var(--muted-foreground)]">
            <p className="mb-1 font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">Data Visualization</p>
            Recharts-backed breakdowns for load, airflow distribution, and equipment fit comparisons.
          </div>
        </div>
      </Card>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-1)] px-5 py-4 text-sm text-[color:var(--muted-foreground)]">
        <span className="font-semibold text-[color:var(--foreground)]">Note:</span> This is phase-one implementation. Remaining modules will be expanded with full workflow depth in the next passes.
      </div>

      <div className="flex items-center gap-2.5 text-sm text-[color:var(--muted-foreground)]">
        <BarChart3 size={14} />
        Visualization stack: Recharts + Framer Motion + Zustand live state.
      </div>
    </div>
  );
}
