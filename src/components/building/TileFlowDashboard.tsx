'use client';

import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Download, Camera, AlertTriangle, Wind, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import type { TileAirflowData, ThermalAlert, SimulationResult } from '@/types/simulation';
import { exportTileAirflowCSV, exportAlertsCSV, exportMetricsCSV, exportSnapshot } from '@/lib/utils/simulation-export';

// ─── Props ──────────────────────────────────────────────────────────

interface TileFlowDashboardProps {
  result: SimulationResult;
  alerts: ThermalAlert[];
  tileAirflowData: TileAirflowData[];
  onSnapshotCapture?: () => string | null;
}

// ─── Severity Badge ─────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  emergency: 'bg-red-500/15 text-red-400 border-red-500/30',
  critical: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

function SeverityBadge({ severity, count }: { severity: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold uppercase ${SEVERITY_STYLES[severity] ?? ''}`}>
      {severity} <span className="tabular-nums">{count}</span>
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export default function TileFlowDashboard({ result, alerts, tileAirflowData, onSnapshotCapture }: TileFlowDashboardProps) {
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [tileSortKey, setTileSortKey] = useState<'efficiency' | 'actualCFM' | 'supplyTempC'>('efficiency');
  const [tileSortAsc, setTileSortAsc] = useState(true);

  const m = result.metrics;

  // ─── Alert counts by severity ───────────────────────────────
  const alertCounts = useMemo(() => {
    const counts: Record<string, number> = { emergency: 0, critical: 0, warning: 0, info: 0 };
    for (const a of alerts) counts[a.severity] = (counts[a.severity] ?? 0) + 1;
    return counts;
  }, [alerts]);

  // ─── Sorted tile data ──────────────────────────────────────
  const sortedTiles = useMemo(() => {
    const sorted = [...tileAirflowData].sort((a, b) => {
      const diff = a[tileSortKey] - b[tileSortKey];
      return tileSortAsc ? diff : -diff;
    });
    return sorted;
  }, [tileAirflowData, tileSortKey, tileSortAsc]);

  // ─── Convergence chart data ─────────────────────────────────
  const convergenceData = useMemo(() =>
    result.convergenceHistory.map((residual, i) => ({
      iteration: i + 1,
      residual,
    })),
  [result.convergenceHistory]);

  const handleSort = (key: typeof tileSortKey) => {
    if (tileSortKey === key) setTileSortAsc(!tileSortAsc);
    else { setTileSortKey(key); setTileSortAsc(true); }
  };

  const handleSnapshot = () => {
    const dataUrl = onSnapshotCapture?.();
    if (dataUrl) exportSnapshot(dataUrl);
  };

  return (
    <div className="space-y-6">
      {/* ─── Alert Summary Bar ─────────────────────────────────── */}
      <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
        <button
          onClick={() => setAlertsExpanded(!alertsExpanded)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Thermal Alerts</h3>
            <span className="text-xs tabular-nums text-muted-foreground">{alerts.length} total</span>
          </div>
          <div className="flex items-center gap-3">
            <SeverityBadge severity="emergency" count={alertCounts.emergency} />
            <SeverityBadge severity="critical" count={alertCounts.critical} />
            <SeverityBadge severity="warning" count={alertCounts.warning} />
            <SeverityBadge severity="info" count={alertCounts.info} />
            {alertsExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </div>
        </button>

        {alertsExpanded && alerts.length > 0 && (
          <div className="mt-4 space-y-2">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                  alert.severity === 'emergency' ? 'bg-red-500/8 border-red-500/25' :
                  alert.severity === 'critical' ? 'bg-orange-500/8 border-orange-500/25' :
                  alert.severity === 'warning' ? 'bg-yellow-500/8 border-yellow-500/25' :
                  'bg-blue-500/8 border-blue-500/25'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${SEVERITY_STYLES[alert.severity]}`}>
                    {alert.severity}
                  </span>
                  <span className="text-foreground/90">{alert.description}</span>
                </div>
                <span className="font-semibold tabular-nums text-foreground">{alert.value.toFixed(1)} {alert.unit}</span>
              </div>
            ))}
          </div>
        )}

        {alerts.length === 0 && (
          <p className="mt-2 text-sm text-emerald-500 font-medium">No thermal alerts — all zones within thresholds</p>
        )}
      </div>

      {/* ─── Tile Airflow Table ────────────────────────────────── */}
      {sortedTiles.length > 0 && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Wind size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-foreground">Tile Airflow Analysis</h3>
            <span className="text-xs text-muted-foreground">({sortedTiles.length} tiles)</span>
          </div>

          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 text-left">Tile</th>
                  <th className="px-3 py-2.5 text-left">Position</th>
                  <th className="cursor-pointer px-3 py-2.5 text-right" onClick={() => handleSort('actualCFM')}>
                    <span className="inline-flex items-center gap-1">Actual CFM <ArrowUpDown size={12} /></span>
                  </th>
                  <th className="px-3 py-2.5 text-right">Required CFM</th>
                  <th className="cursor-pointer px-3 py-2.5 text-right" onClick={() => handleSort('efficiency')}>
                    <span className="inline-flex items-center gap-1">Efficiency <ArrowUpDown size={12} /></span>
                  </th>
                  <th className="cursor-pointer px-3 py-2.5 text-right" onClick={() => handleSort('supplyTempC')}>
                    <span className="inline-flex items-center gap-1">Supply Temp <ArrowUpDown size={12} /></span>
                  </th>
                  <th className="px-3 py-2.5 text-right">Bypass</th>
                </tr>
              </thead>
              <tbody>
                {sortedTiles.map(tile => {
                  const effPct = (tile.efficiency * 100);
                  const rowClass = tile.efficiency < 0.4
                    ? 'bg-red-500/8'
                    : tile.efficiency < 0.7
                    ? 'bg-yellow-500/8'
                    : '';
                  return (
                    <tr key={tile.tileId} className={`border-b border-border/50 ${rowClass}`}>
                      <td className="px-3 py-2 font-medium text-foreground">{tile.tileId}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">({tile.x}, {tile.y})</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{tile.actualCFM.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{tile.requiredCFM.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                          effPct >= 100 ? 'bg-emerald-500/15 text-emerald-400' :
                          effPct >= 70 ? 'bg-yellow-500/15 text-yellow-400' :
                          effPct >= 40 ? 'bg-orange-500/15 text-orange-400' :
                          'bg-red-500/15 text-red-400'
                        }`}>
                          {effPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{tile.supplyTempC.toFixed(1)}°C</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{(tile.bypassFraction * 100).toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Convergence Chart ─────────────────────────────────── */}
      {convergenceData.length > 1 && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Convergence History</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={convergenceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="iteration" tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'Iteration', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#94a3b8' }} />
              <YAxis
                scale="log"
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                label={{ value: 'Residual', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(v: number) => v.toExponential(0)}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number | undefined) => [v != null ? v.toExponential(3) : '—', 'Residual']}
              />
              <ReferenceLine y={result.config.convergence} stroke="#22c55e" strokeDasharray="6 3" label={{ value: 'Target', fill: '#22c55e', fontSize: 10 }} />
              <Line type="monotone" dataKey="residual" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Export Toolbar ────────────────────────────────────── */}
      <div className="panel-glass flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Export</span>
        <button
          onClick={() => exportTileAirflowCSV(tileAirflowData)}
          disabled={tileAirflowData.length === 0}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
        >
          <Download size={14} /> Tile Data (CSV)
        </button>
        <button
          onClick={() => exportAlertsCSV(alerts)}
          disabled={alerts.length === 0}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
        >
          <Download size={14} /> Alerts (CSV)
        </button>
        <button
          onClick={() => exportMetricsCSV(m)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70"
        >
          <Download size={14} /> Metrics (CSV)
        </button>
        <button
          onClick={handleSnapshot}
          disabled={!onSnapshotCapture}
          className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          <Camera size={14} /> Snapshot (PNG)
        </button>
      </div>
    </div>
  );
}
