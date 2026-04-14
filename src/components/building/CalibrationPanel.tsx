'use client';

import React, { useState, useMemo } from 'react';
import {
  Crosshair,
  Activity,
  Thermometer,
  Wind,
  Droplets,
  RotateCcw,
  Play,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useSimulationStore } from '@/stores/simulation-store';
import type {
  CalibrationMode,
  CalibrationCoefficients,
  SensorReading,
  CalibrationPoint,
} from '@/types/simulation';
import { DEFAULT_CALIBRATION_COEFFICIENTS } from '@/types/simulation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── Deviation Badge ─────────────────────────────────────────

function DeviationBadge({ pct }: { pct: number }) {
  const color =
    pct < 5 ? 'bg-emerald-500/20 text-emerald-400' :
    pct < 10 ? 'bg-amber-500/20 text-amber-400' :
    'bg-red-500/20 text-red-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold leading-none ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

// ─── Stat Card ───────────────────────────────────────────────

function DevCard({ label, icon, value, unit }: { label: string; icon: React.ReactNode; value: number; unit: string }) {
  const color =
    value < 5 ? 'text-emerald-400' :
    value < 10 ? 'text-amber-400' :
    'text-red-400';
  return (
    <div className="glass-card rounded-2xl border border-border/70 px-4 pb-5 pt-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold leading-snug tabular-nums ${color}`}>
        {value.toFixed(1)}<span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

// ─── Coefficient Slider ──────────────────────────────────────

function CoeffSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="w-56 shrink-0 text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 min-w-24 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-accent"
      />
      <span className="w-16 text-right text-sm font-semibold tabular-nums text-foreground">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function CalibrationPanel() {
  const {
    calibrationResult,
    calibrationCoefficients,
    sensorReadings,
    isCalibrating,
    result,
    addSensorReading,
    removeSensorReading,
    clearSensorReadings,
    runCalibration,
    applyCalibration,
    resetCalibration,
  } = useSimulationStore();

  const [mode, setMode] = useState<CalibrationMode>('compare');
  const [localCoeffs, setLocalCoeffs] = useState<CalibrationCoefficients>(calibrationCoefficients);
  const [sensorForm, setSensorForm] = useState({
    x: 0, y: 0, z: 0,
    type: 'temperature' as SensorReading['type'],
    value: 25,
  });
  const [sortBy, setSortBy] = useState<'deviation' | 'field'>('deviation');

  // Keep local coefficients in sync when calibration applies new ones
  React.useEffect(() => {
    setLocalCoeffs(calibrationCoefficients);
  }, [calibrationCoefficients]);

  const sortedPoints = useMemo(() => {
    if (!calibrationResult) return [];
    const pts = [...calibrationResult.points];
    if (sortBy === 'deviation') pts.sort((a, b) => b.deviationPct - a.deviationPct);
    else pts.sort((a, b) => a.fieldType.localeCompare(b.fieldType));
    return pts;
  }, [calibrationResult, sortBy]);

  const chartData = useMemo(() => {
    if (!calibrationResult) return [];
    return calibrationResult.points.map((p, i) => ({
      name: `${p.fieldType[0].toUpperCase()}${i}`,
      deviation: Math.round(p.deviationPct * 10) / 10,
      fieldType: p.fieldType,
    }));
  }, [calibrationResult]);

  const handleAddSensor = () => {
    addSensorReading({
      id: crypto.randomUUID(),
      position: { x: sensorForm.x, y: sensorForm.y, z: sensorForm.z },
      type: sensorForm.type,
      measuredValue: sensorForm.value,
      unit: sensorForm.type === 'temperature' ? '°C' : sensorForm.type === 'velocity' ? 'm/s' : 'kg/kg',
      timestamp: new Date().toISOString(),
    });
  };

  const handleApplySliders = () => {
    applyCalibration(localCoeffs);
  };

  // ─── No simulation result yet ─────────────────────────────
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Crosshair size={40} className="opacity-30" />
        <p className="text-sm">Run a CFD simulation first to use calibration.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Deviation Summary Cards ──────────────────────────── */}
      {calibrationResult && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DevCard
            label="Overall"
            icon={<Activity size={14} />}
            value={
              (calibrationResult.overallDeviationPct.temperature +
                calibrationResult.overallDeviationPct.velocity +
                calibrationResult.overallDeviationPct.humidity) / 3
            }
            unit="%"
          />
          <DevCard
            label="Temperature"
            icon={<Thermometer size={14} />}
            value={calibrationResult.overallDeviationPct.temperature}
            unit="%"
          />
          <DevCard
            label="Velocity"
            icon={<Wind size={14} />}
            value={calibrationResult.overallDeviationPct.velocity}
            unit="%"
          />
          <DevCard
            label="Humidity"
            icon={<Droplets size={14} />}
            value={calibrationResult.overallDeviationPct.humidity}
            unit="%"
          />
        </div>
      )}

      {/* ─── Calibration Controls ─────────────────────────────── */}
      <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Crosshair size={18} className="text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Calibration Controls</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as CalibrationMode)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            <option value="compare">Compare Only</option>
            <option value="auto-adjust">Auto-Adjust</option>
            <option value="sensor">Sensor Calibration</option>
          </select>

          <button
            onClick={() => runCalibration(mode, result.projectId, result.config.mode)}
            disabled={isCalibrating || (mode === 'sensor' && sensorReadings.length === 0)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:opacity-50"
          >
            <Play size={14} />
            {isCalibrating ? 'Calibrating…' : 'Run Calibration'}
          </button>

          <button
            onClick={resetCalibration}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>

        {mode === 'auto-adjust' && (
          <p className="mt-2 text-xs text-muted-foreground">
            Nelder-Mead optimizer will auto-adjust 5 coefficients over partial CFD re-runs (target &lt;5% deviation).
          </p>
        )}
      </div>

      {/* ─── Coefficient Sliders ──────────────────────────────── */}
      <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-foreground">Calibration Coefficients</h3>
          </div>
          <button
            onClick={handleApplySliders}
            className="rounded-lg bg-accent/20 px-3 py-1 text-xs font-medium text-accent transition hover:bg-accent/30"
          >
            Apply
          </button>
        </div>

        <div className="space-y-3">
          <CoeffSlider
            label="Tile Discharge Coeff"
            value={localCoeffs.tileDischargeCoeff}
            min={0.5} max={2.0} step={0.01}
            onChange={(v) => setLocalCoeffs(c => ({ ...c, tileDischargeCoeff: v }))}
          />
          <CoeffSlider
            label="Thermal Loss Factor"
            value={localCoeffs.thermalLossFactor}
            min={0.5} max={2.0} step={0.01}
            onChange={(v) => setLocalCoeffs(c => ({ ...c, thermalLossFactor: v }))}
          />
          <CoeffSlider
            label="Wall Conductivity (W/m²K)"
            value={localCoeffs.wallConductivity}
            min={0} max={5.0} step={0.05}
            onChange={(v) => setLocalCoeffs(c => ({ ...c, wallConductivity: v }))}
          />
          <CoeffSlider
            label="Plenum Mixing Factor"
            value={localCoeffs.plenumMixingFactor}
            min={0.5} max={2.0} step={0.01}
            onChange={(v) => setLocalCoeffs(c => ({ ...c, plenumMixingFactor: v }))}
          />
          <CoeffSlider
            label="Turbulence Intensity Factor"
            value={localCoeffs.turbulenceIntensityFactor}
            min={0.5} max={2.0} step={0.01}
            onChange={(v) => setLocalCoeffs(c => ({ ...c, turbulenceIntensityFactor: v }))}
          />
        </div>
      </div>

      {/* ─── Sensor Input ─────────────────────────────────────── */}
      <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Thermometer size={18} className="text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Sensor Readings</h3>
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-0.5 block text-xs text-muted-foreground">X</label>
            <input
              type="number" value={sensorForm.x} onChange={(e) => setSensorForm(s => ({ ...s, x: +e.target.value }))}
              className="w-20 rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-muted-foreground">Y</label>
            <input
              type="number" value={sensorForm.y} onChange={(e) => setSensorForm(s => ({ ...s, y: +e.target.value }))}
              className="w-20 rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-muted-foreground">Z</label>
            <input
              type="number" value={sensorForm.z} onChange={(e) => setSensorForm(s => ({ ...s, z: +e.target.value }))}
              className="w-20 rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-muted-foreground">Type</label>
            <select
              value={sensorForm.type}
              onChange={(e) => setSensorForm(s => ({ ...s, type: e.target.value as SensorReading['type'] }))}
              className="rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            >
              <option value="temperature">Temperature</option>
              <option value="velocity">Velocity</option>
              <option value="humidity">Humidity</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-muted-foreground">Value</label>
            <input
              type="number" step="0.1" value={sensorForm.value}
              onChange={(e) => setSensorForm(s => ({ ...s, value: +e.target.value }))}
              className="w-24 rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <button
            onClick={handleAddSensor}
            className="flex items-center gap-1 rounded-lg bg-accent/20 px-3 py-1 text-xs font-medium text-accent transition hover:bg-accent/30"
          >
            <Plus size={14} /> Add
          </button>
          {sensorReadings.length > 0 && (
            <button
              onClick={clearSensorReadings}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-red-400"
            >
              <Trash2 size={12} /> Clear All
            </button>
          )}
        </div>

        {sensorReadings.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-lg border border-border/50">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sensorReadings.map(s => (
                  <tr key={s.id} className="border-t border-border/30">
                    <td className="px-3 py-2 tabular-nums">({s.position.x}, {s.position.y}, {s.position.z})</td>
                    <td className="px-3 py-2 capitalize">{s.type}</td>
                    <td className="px-3 py-2 tabular-nums">{s.measuredValue} {s.unit}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeSensorReading(s.id)} className="text-muted-foreground hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Deviation Detail Table ───────────────────────────── */}
      {calibrationResult && sortedPoints.length > 0 && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-accent" />
              <h3 className="text-sm font-semibold text-foreground">Point-by-Point Deviation</h3>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded border border-border bg-card px-2 py-0.5 text-xs text-foreground"
            >
              <option value="deviation">Sort by Deviation</option>
              <option value="field">Sort by Field</option>
            </select>
          </div>

          <div className="max-h-64 overflow-auto rounded-lg border border-border/50">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2 text-right">Simulated</th>
                  <th className="px-3 py-2 text-right">Reference</th>
                  <th className="px-3 py-2 text-right">Deviation</th>
                </tr>
              </thead>
              <tbody>
                {sortedPoints.map((p: CalibrationPoint, i: number) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="px-3 py-2 tabular-nums">
                      ({p.location.x.toFixed(1)}, {p.location.y.toFixed(1)}, {p.location.z.toFixed(1)})
                    </td>
                    <td className="px-3 py-2 capitalize">{p.fieldType}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.simulatedValue.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.referenceValue.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right"><DeviationBadge pct={p.deviationPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Deviation Chart ──────────────────────────────────── */}
      {calibrationResult && chartData.length > 0 && (
        <div className="panel-glass rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Activity size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-foreground">Deviation Chart</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [v != null ? `${v.toFixed(1)}%` : '—', 'Deviation']}
              />
              <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '10%', fill: '#f59e0b', fontSize: 10 }} />
              <ReferenceLine y={5} stroke="#10b981" strokeDasharray="4 4" label={{ value: '5%', fill: '#10b981', fontSize: 10 }} />
              <Bar dataKey="deviation" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.deviation < 5 ? '#10b981' : entry.deviation < 10 ? '#f59e0b' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
