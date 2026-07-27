'use client';

/**
 * Equipment-selection recharts blocks, isolated for next/dynamic so recharts
 * stays out of the route's first-load JS.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EquipmentSelectionResult } from '@/lib/engine/hvac/equipment-selection-engine';

const AXIS_STROKE = 'color-mix(in oklab,var(--muted-foreground) 80%,transparent)';
const GRID_STROKE = 'color-mix(in oklab,var(--border) 78%,transparent)';
const TOOLTIP_STYLE = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 } as const;

export function CostDistributionChart({
  data,
  colors,
}: {
  data: Array<{ name: string; value: number }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2} stroke="none">
          {data.map((_entry, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => `₱${Number(value).toLocaleString()}`} contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CandidateScoresChart({ data }: { data: EquipmentSelectionResult['candidates'] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="model" tick={{ fontSize: 10 }} stroke={AXIS_STROKE} />
        <YAxis tick={{ fontSize: 11 }} stroke={AXIS_STROKE} />
        <Tooltip />
        <Legend />
        <Bar dataKey="score" name="Score" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="utilizationPct" name="Util %" fill="var(--warning)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
