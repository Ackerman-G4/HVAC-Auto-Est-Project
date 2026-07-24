import type { TileAirflowData, ThermalAlert, SimulationMetrics } from '@/types/simulation';

// ─── CSV Helper ─────────────────────────────────────────────────────

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(row =>
    row.map(cell => {
      const str = String(cell);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(','),
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Tile Airflow CSV ───────────────────────────────────────────────

export function exportTileAirflowCSV(data: TileAirflowData[]) {
  const header = ['Tile ID', 'X', 'Y', 'Actual CFM', 'Required CFM', 'Efficiency %', 'Supply Temp °C', 'Bypass %'];
  const rows = data.map(d => [
    d.tileId,
    String(d.x),
    String(d.y),
    d.actualCFM.toFixed(1),
    d.requiredCFM.toFixed(1),
    (d.efficiency * 100).toFixed(1),
    d.supplyTempC.toFixed(1),
    (d.bypassFraction * 100).toFixed(1),
  ]);
  downloadCSV([header, ...rows], `tile-airflow-${new Date().toISOString().slice(0, 10)}.csv`);
}

// ─── Alerts CSV ─────────────────────────────────────────────────────

export function exportAlertsCSV(alerts: ThermalAlert[]) {
  const header = ['ID', 'Type', 'Severity', 'Position X', 'Position Y', 'Position Z', 'Value', 'Threshold', 'Unit', 'Description', 'Affected Racks'];
  const rows = alerts.map(a => [
    a.id.slice(0, 8),
    a.type,
    a.severity,
    a.position.x.toFixed(1),
    a.position.y.toFixed(1),
    (a.position.z ?? 0).toFixed(1),
    a.value.toFixed(2),
    a.threshold.toFixed(2),
    a.unit,
    a.description,
    a.affectedRacks.join('; '),
  ]);
  downloadCSV([header, ...rows], `thermal-alerts-${new Date().toISOString().slice(0, 10)}.csv`);
}

// ─── Metrics CSV ────────────────────────────────────────────────────

export function exportMetricsCSV(metrics: SimulationMetrics) {
  const header = [
    'Max Temp (°C)', 'Avg Temp (°C)', 'Min Temp (°C)',
    'Max Velocity (m/s)', 'Hotspot Count', 'PUE',
    'Converged', 'Energy Residual', 'Momentum Residual',
  ];
  const row = [
    metrics.maxTemperature.toFixed(2),
    metrics.avgTemperature.toFixed(2),
    metrics.minTemperature.toFixed(2),
    metrics.maxVelocity.toFixed(3),
    String(metrics.hotspots.length),
    metrics.pue.toFixed(3),
    String(metrics.converged),
    metrics.energyResidual.toExponential(3),
    metrics.momentumResidual.toExponential(3),
  ];
  downloadCSV([header, row], `simulation-metrics-${new Date().toISOString().slice(0, 10)}.csv`);
}

// ─── Snapshot Export ────────────────────────────────────────────────

export function exportSnapshot(dataUrl: string, filename?: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename ?? `cfd-snapshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
  link.click();
}
