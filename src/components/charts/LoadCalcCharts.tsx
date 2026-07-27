'use client';

/**
 * Load-calculation recharts blocks, isolated so the page can pull them in via
 * next/dynamic — recharts stays out of the route's first-load JS.
 */
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

const AXIS_STROKE = 'color-mix(in oklab,var(--muted-foreground) 80%,transparent)';
const GRID_STROKE = 'color-mix(in oklab,var(--border) 78%,transparent)';

export function LoadBreakdownChart({ data }: { data: Array<{ item: string; btu: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="item" tick={{ fontSize: 11 }} stroke={AXIS_STROKE} />
        <YAxis tick={{ fontSize: 11 }} stroke={AXIS_STROKE} />
        <Tooltip />
        <Bar dataKey="btu" fill="var(--accent)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AirflowProfileChart({
  data,
}: {
  data: Array<{ zone: string; cfm: number; velocityFpm: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="zone" tick={{ fontSize: 11 }} stroke={AXIS_STROKE} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke={AXIS_STROKE} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke={AXIS_STROKE} />
        <Tooltip />
        <Legend />
        <ReferenceLine yAxisId="right" y={950} stroke="var(--warning)" strokeDasharray="4 4" />
        <Line yAxisId="left" type="monotone" dataKey="cfm" name="CFM" stroke="var(--accent)" strokeWidth={2.4} dot={{ r: 4 }} />
        <Line yAxisId="right" type="monotone" dataKey="velocityFpm" name="Velocity (FPM)" stroke="var(--warning)" strokeWidth={2.4} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
