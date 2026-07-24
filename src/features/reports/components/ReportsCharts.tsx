'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import type { AirflowResult } from '@/lib/engine/hvac/airflow-duct-engine';
import type { EquipmentCandidate, LoadBreakdownDatum } from '../types';

interface ReportsChartsProps {
  chartsReady: boolean;
  loadBreakdownData: LoadBreakdownDatum[];
  branchVelocityData: AirflowResult['branchRows'];
  equipmentScoreData: EquipmentCandidate[];
}

export function ReportsCharts({
  chartsReady,
  loadBreakdownData,
  branchVelocityData,
  equipmentScoreData,
}: ReportsChartsProps) {
  return (
    <section className="grid gap-(--space-component-gap) xl:grid-cols-3">
      <Card className="panel-glass border-border/70 p-6 lg:p-8">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Load Breakdown</h3>
        <div className="h-85 w-full">
          {chartsReady ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={loadBreakdownData} margin={{ top: 6, right: 12, bottom: 6, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                <XAxis dataKey="component" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <YAxis tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <Tooltip />
                <Bar dataKey="btu" name="BTU/h" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Preparing chart...</div>
          )}
        </div>
      </Card>

      <Card className="panel-glass border-border/70 p-6 lg:p-8">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Branch Velocity</h3>
        <div className="h-85 w-full">
          {chartsReady ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={branchVelocityData} margin={{ top: 6, right: 12, bottom: 6, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                <XAxis dataKey="branch" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="velocityFpm" name="Velocity (FPM)" stroke="var(--warning)" strokeWidth={2.4} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="pressureDropInWg" name="Pressure Drop (in.wg)" stroke="var(--accent)" strokeWidth={2.4} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Preparing chart...</div>
          )}
        </div>
      </Card>

      <Card className="panel-glass border-border/70 p-6 lg:p-8">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Equipment Ranking</h3>
        <div className="h-85 w-full">
          {chartsReady ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={equipmentScoreData} margin={{ top: 6, right: 12, bottom: 6, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                <XAxis dataKey="id" tick={{ fontSize: 9 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="score" name="Score" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="right" dataKey="utilizationPct" name="Utilization %" fill="var(--warning)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Preparing chart...</div>
          )}
        </div>
      </Card>
    </section>
  );
}
