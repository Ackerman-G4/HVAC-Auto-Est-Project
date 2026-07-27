'use client';

/**
 * Dashboard recharts blocks, isolated so `src/app/page.tsx` can pull them in
 * via next/dynamic. recharts is a large dependency and both charts are
 * secondary content on the landing page — loading them eagerly delayed first
 * paint for every user.
 */
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

const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
} as const;

export interface LoadDistDatum {
  name: string;
  value: number;
}

export interface CostDatum {
  name: string;
  capex: number;
  energy: number;
}

export function LoadDistributionChart({
  data,
  colors,
}: {
  data: LoadDistDatum[];
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          dataKey="value"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_entry, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => `${Number(value).toLocaleString()} BTU/h`}
          contentStyle={TOOLTIP_STYLE}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CostBreakdownChart({ data }: { data: CostDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barGap={4}>
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
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="capex" name="CAPEX" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="energy" name="Annual Energy" fill="var(--warning)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
