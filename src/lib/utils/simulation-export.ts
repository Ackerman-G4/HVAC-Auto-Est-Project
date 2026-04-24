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
  const metricsRows: string[][] = [
    ['Metric', 'Value', 'Unit'],
    ['Max Temperature', metrics.maxTemperature.toFixed(2), 'degC'],
    ['Avg Temperature', metrics.avgTemperature.toFixed(2), 'degC'],
    ['Min Temperature', metrics.minTemperature.toFixed(2), 'degC'],
    ['Max Velocity', metrics.maxVelocity.toFixed(3), 'm/s'],
    ['Avg Velocity', metrics.avgVelocity.toFixed(3), 'm/s'],
    ['Hotspot Count', String(metrics.hotspots.length), 'count'],
    ['PUE', metrics.pue.toFixed(3), 'ratio'],
    ['Converged', String(metrics.converged), 'bool'],
    ['Energy Residual', metrics.energyResidual.toExponential(3), 'residual'],
    ['Momentum Residual', metrics.momentumResidual.toExponential(3), 'residual'],
    ['Airflow Balance', (metrics.airflowBalanceM3s ?? 0).toFixed(4), 'm3/s'],
    ['Pressure Imbalance', (metrics.pressureImbalancePa ?? 0).toFixed(4), 'Pa'],
    ['Ventilation Effectiveness', ((metrics.ventilationEffectiveness ?? 0) * 100).toFixed(2), 'percent'],
    ['Dead Zone Ratio', ((metrics.deadZoneRatio ?? 0) * 100).toFixed(2), 'percent'],
    ['Airflow Distribution Score', (metrics.airflowDistributionScore ?? 0).toFixed(4), 'score'],
    ['Uniformity Index', (metrics.uniformityIndex ?? 0).toFixed(4), 'index'],
  ];

  const roomRows: string[][] = (metrics.roomMetrics ?? []).length > 0
    ? [
      [''],
      ['Room Metrics'],
      ['Room ID', 'Floor ID', 'Floor Number', 'Avg Temp (degC)', 'Mean Velocity (m/s)', 'Stagnation Ratio', 'Pressure (Pa)', 'Inflow (m3/s)', 'Outflow (m3/s)'],
      ...(metrics.roomMetrics ?? []).map((room) => [
        room.roomId,
        room.floorId,
        String(room.floorNumber),
        room.avgTemperature.toFixed(3),
        room.meanVelocity.toFixed(4),
        room.stagnationRatio.toFixed(4),
        room.pressure.toFixed(4),
        room.inflowM3s.toFixed(4),
        room.outflowM3s.toFixed(4),
      ]),
    ]
    : [];

  downloadCSV(
    [...metricsRows, ...roomRows],
    `simulation-metrics-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

// ─── Snapshot Export ────────────────────────────────────────────────

export function exportSnapshot(dataUrl: string, filename?: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename ?? `cfd-snapshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
  link.click();
}
