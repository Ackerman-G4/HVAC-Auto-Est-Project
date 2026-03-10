'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Wind, Thermometer, Gauge, Plus, Trash2, Play, ShieldCheck,
  AlertTriangle, Zap, TrendingUp, Server, AirVent, Grid3x3,
  ChevronDown, RotateCcw, Settings2, BarChart3, Activity, Box,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useSimulationStore } from '@/stores/simulation-store';
import type {
  RackDensity, HVACUnitType, FailureScenario,
} from '@/types/simulation';

const AirflowViewer3D = dynamic(
  () => import('@/components/building/AirflowViewer3D'),
  { ssr: false, loading: () => <div className="h-[500px] bg-slate-900 rounded-xl flex items-center justify-center text-slate-400">Loading 3D viewer...</div> }
);

// ─── Temperature Heatmap Component ──────────────────────────────────

function TemperatureHeatmap() {
  const { result, selectedSliceZ, setSelectedSliceZ, config } = useSimulationStore();

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-slate-400 font-medium">Run a simulation to see temperature distribution</p>
      </div>
    );
  }

  const slice = result.temperatureField.map(row =>
    row.map(col => col[selectedSliceZ] ?? 24)
  );

  const minT = Math.min(...slice.flat());
  const maxT = Math.max(...slice.flat());
  const range = maxT - minT || 1;

  function tempToColor(t: number): string {
    const ratio = (t - minT) / range;
    if (ratio < 0.25) return `rgb(${Math.round(ratio * 4 * 255)}, ${Math.round(ratio * 4 * 200)}, 255)`;
    if (ratio < 0.5) return `rgb(255, 255, ${Math.round((1 - (ratio - 0.25) * 4) * 255)})`;
    if (ratio < 0.75) return `rgb(255, ${Math.round((1 - (ratio - 0.5) * 4) * 200)}, 0)`;
    return `rgb(${Math.round((1 - (ratio - 0.75) * 4) * 255)}, 0, 0)`;
  }

  const cellSize = Math.min(24, Math.floor(600 / Math.max(config.gridSizeX, config.gridSizeY)));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700">Temperature Distribution (Z = {selectedSliceZ})</h3>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Height Layer:</label>
          <input
            type="range"
            min={0}
            max={config.gridSizeZ - 1}
            value={selectedSliceZ}
            onChange={e => setSelectedSliceZ(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-xs font-bold text-slate-700 tabular-nums w-16">
            {(selectedSliceZ * config.gridResolution).toFixed(1)}m
          </span>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${config.gridSizeX}, ${cellSize}px)`, gap: '1px' }}>
          {slice.map((row, x) =>
            row.map((temp, y) => (
              <div
                key={`${x}-${y}`}
                title={`(${x},${y}) ${temp.toFixed(1)}°C`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: tempToColor(temp),
                  opacity: 0.85,
                  borderRadius: 2,
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs font-medium text-slate-500">{minT.toFixed(1)}°C</span>
        <div className="flex-1 h-3 rounded-full" style={{
          background: 'linear-gradient(to right, rgb(0,0,255), rgb(255,255,0), rgb(255,200,0), rgb(255,0,0))',
        }} />
        <span className="text-xs font-medium text-slate-500">{maxT.toFixed(1)}°C</span>
      </div>
    </div>
  );
}

// ─── Equipment Setup Panel ──────────────────────────────────────────

function EquipmentPanel() {
  const { racks, hvacUnits, tiles, addRack, removeRack, addHVACUnit, removeHVACUnit, addTile, removeTile } = useSimulationStore();

  const [rackForm, setRackForm] = useState({
    name: '', posX: 0, posY: 0, powerKW: 5, density: 'medium' as RackDensity,
  });
  const [hvacForm, setHvacForm] = useState({
    name: '', type: 'crac' as HVACUnitType, posX: 0, posY: 0, capacityKW: 30, airflowCFM: 5000, supplyTempC: 13,
  });

  const handleAddRack = () => {
    addRack({
      name: rackForm.name || `Rack ${racks.length + 1}`,
      position: { x: rackForm.posX, y: rackForm.posY, z: 0 },
      width: 0.6, depth: 1.2, height: 2.0,
      powerDensity: rackForm.density,
      powerKW: rackForm.powerKW,
      airflowCFM: 300,
      orientation: 0,
      rackUnits: 42,
      filledUnits: 30,
    });
    setRackForm({ name: '', posX: rackForm.posX + 1, posY: rackForm.posY, powerKW: 5, density: 'medium' });
  };

  const handleAddHVAC = () => {
    addHVACUnit({
      type: hvacForm.type,
      name: hvacForm.name || `${hvacForm.type.toUpperCase()} ${hvacUnits.length + 1}`,
      position: { x: hvacForm.posX, y: hvacForm.posY, z: 0 },
      width: 1.0, depth: 1.0, height: 2.5,
      capacityKW: hvacForm.capacityKW,
      capacityTR: hvacForm.capacityKW / 3.517,
      airflowCFM: hvacForm.airflowCFM,
      supplyTempC: hvacForm.supplyTempC,
      returnTempC: 24,
      orientation: 0,
      powerInputKW: hvacForm.capacityKW / 3,
      status: 'active',
    });
  };

  return (
    <div className="space-y-8">
      {/* Server Racks */}
      <div>
        <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Server size={20} className="text-blue-600" /> Server Racks
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Name" value={rackForm.name} onChange={e => setRackForm(f => ({ ...f, name: e.target.value }))} />
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" placeholder="X (m)" value={rackForm.posX} onChange={e => setRackForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" placeholder="Y (m)" value={rackForm.posY} onChange={e => setRackForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" placeholder="Power (kW)" value={rackForm.powerKW} onChange={e => setRackForm(f => ({ ...f, powerKW: +e.target.value }))} />
          <button onClick={handleAddRack} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Add Rack
          </button>
        </div>
        {racks.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Position</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Power</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">BTU/hr</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {racks.map(rack => (
                  <tr key={rack.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{rack.name}</td>
                    <td className="px-4 py-3 text-slate-500">({rack.position.x}, {rack.position.y})</td>
                    <td className="px-4 py-3 font-bold text-orange-600">{rack.powerKW} kW</td>
                    <td className="px-4 py-3 text-slate-600">{(rack.powerKW * 3412).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeRack(rack.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HVAC Units */}
      <div>
        <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <AirVent size={20} className="text-blue-600" /> HVAC Cooling Units
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm" value={hvacForm.type} onChange={e => setHvacForm(f => ({ ...f, type: e.target.value as HVACUnitType }))}>
            <option value="crac">CRAC</option>
            <option value="crah">CRAH</option>
            <option value="ahu">AHU</option>
            <option value="in_row">In-Row</option>
            <option value="rear_door">Rear Door HX</option>
          </select>
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" placeholder="X (m)" value={hvacForm.posX} onChange={e => setHvacForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" placeholder="Y (m)" value={hvacForm.posY} onChange={e => setHvacForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" placeholder="Capacity (kW)" value={hvacForm.capacityKW} onChange={e => setHvacForm(f => ({ ...f, capacityKW: +e.target.value }))} />
          <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" placeholder="Airflow (CFM)" value={hvacForm.airflowCFM} onChange={e => setHvacForm(f => ({ ...f, airflowCFM: +e.target.value }))} />
          <button onClick={handleAddHVAC} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Add Unit
          </button>
        </div>
        {hvacUnits.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Type</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Position</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Capacity</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">Airflow</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hvacUnits.map(unit => (
                  <tr key={unit.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{unit.name}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-bold">{unit.type.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-slate-500">({unit.position.x}, {unit.position.y})</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{unit.capacityKW} kW</td>
                    <td className="px-4 py-3 text-slate-600">{unit.airflowCFM.toLocaleString()} CFM</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeHVACUnit(unit.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Perforated Tiles */}
      <div>
        <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Grid3x3 size={20} className="text-blue-600" /> Perforated Floor Tiles
        </h3>
        <div className="flex gap-3 mb-4">
          <input id="tileX" className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-24" type="number" placeholder="Grid X" defaultValue={5} />
          <input id="tileY" className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-24" type="number" placeholder="Grid Y" defaultValue={5} />
          <input id="tileOpen" className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-32" type="number" step="0.05" placeholder="Open Area (0-1)" defaultValue={0.25} />
          <button
            onClick={() => {
              const x = parseInt((document.getElementById('tileX') as HTMLInputElement).value);
              const y = parseInt((document.getElementById('tileY') as HTMLInputElement).value);
              const openArea = parseFloat((document.getElementById('tileOpen') as HTMLInputElement).value);
              if (!isNaN(x) && !isNaN(y) && openArea >= 0 && openArea <= 1) {
                addTile({ x, y, openArea, tileSize: 0.6 });
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> Add Tile
          </button>
        </div>
        {tiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                <Grid3x3 size={14} className="text-slate-400" />
                <span>({tile.x}, {tile.y})</span>
                <span className="text-slate-400">{(tile.openArea * 100).toFixed(0)}%</span>
                <button onClick={() => removeTile(tile.x, tile.y)} className="text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Simulation Config Panel ────────────────────────────────────────

function ConfigPanel() {
  const { config, setConfig, raisedFloorHeight } = useSimulationStore();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Grid Resolution (m)</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" step="0.1" value={config.gridResolution} onChange={e => setConfig({ gridResolution: +e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Grid Size X</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" value={config.gridSizeX} onChange={e => setConfig({ gridSizeX: +e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Grid Size Y</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" value={config.gridSizeY} onChange={e => setConfig({ gridSizeY: +e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Grid Size Z</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" value={config.gridSizeZ} onChange={e => setConfig({ gridSizeZ: +e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Iterations</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" value={config.iterations} onChange={e => setConfig({ iterations: +e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Convergence</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" step="0.001" value={config.convergence} onChange={e => setConfig({ convergence: +e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Time Step (s)</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" step="0.01" value={config.timeStep} onChange={e => setConfig({ timeStep: +e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5">Ambient Temp (°C)</label>
        <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" value={config.ambientTempC} onChange={e => setConfig({ ambientTempC: +e.target.value })} />
      </div>
    </div>
  );
}

// ─── Results Panel ──────────────────────────────────────────────────

function ResultsPanel() {
  const { result, complianceReport, failureResult, pueAnalysis, optimizationResult } = useSimulationStore();

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-50 rounded-xl border border-slate-200">
        <Wind size={48} className="text-slate-300 mb-4" />
        <p className="text-slate-400 font-bold text-lg">No simulation results yet</p>
        <p className="text-slate-400 text-sm mt-1">Place equipment and run a CFD simulation</p>
      </div>
    );
  }

  const m = result.metrics;

  return (
    <div className="space-y-8">
      {/* Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Max Temperature" value={`${m.maxTemperature.toFixed(1)}°C`} icon={Thermometer} />
        <StatCard title="Avg Temperature" value={`${m.avgTemperature.toFixed(1)}°C`} icon={Thermometer} />
        <StatCard title="Hotspots" value={m.hotspots.length} subtitle={m.hotspots.filter(h => h.severity === 'critical').length + ' critical'} icon={AlertTriangle} />
        <StatCard title="PUE" value={m.pue.toFixed(2)} subtitle={m.pue <= 1.5 ? 'Good' : m.pue <= 2.0 ? 'Average' : 'Poor'} icon={Zap} />
      </div>

      {/* Temperature Heatmap */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <TemperatureHeatmap />
      </div>

      {/* Rack Inlet Temperatures */}
      {m.rackInletTemps.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-extrabold text-slate-900 mb-4">Rack Inlet Temperatures</h3>
          <div className="space-y-2">
            {m.rackInletTemps.map(rack => {
              const pct = ((rack.avgTemp - 15) / 30) * 100;
              const barColor = rack.avgTemp > 35 ? 'bg-red-500' : rack.avgTemp > 27 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={rack.rackId} className="flex items-center gap-4">
                  <span className="text-sm font-medium text-slate-600 w-32 truncate">{rack.rackId.slice(0, 8)}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(100, Math.max(5, pct))}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-16 text-right">{rack.avgTemp.toFixed(1)}°C</span>
                  <span className="text-xs text-slate-400 w-20">(max {rack.maxTemp.toFixed(1)}°C)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hotspots Detail */}
      {m.hotspots.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" /> Detected Hotspots
          </h3>
          <div className="space-y-3">
            {m.hotspots.map((hs, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${
                hs.severity === 'emergency' ? 'bg-red-50 border-red-200' :
                hs.severity === 'critical' ? 'bg-amber-50 border-amber-200' :
                'bg-yellow-50 border-yellow-200'
              }`}>
                <div>
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${
                    hs.severity === 'emergency' ? 'bg-red-100 text-red-700' :
                    hs.severity === 'critical' ? 'bg-amber-100 text-amber-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{hs.severity}</span>
                  <span className="ml-3 text-sm text-slate-700">
                    Position: ({hs.position.x.toFixed(1)}, {hs.position.y.toFixed(1)}, {hs.position.z.toFixed(1)})m
                  </span>
                </div>
                <span className="text-lg font-extrabold text-slate-900">{hs.temperature.toFixed(1)}°C</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ASHRAE Compliance */}
      {complianceReport && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <ShieldCheck size={20} className={complianceReport.overallPass ? 'text-emerald-500' : 'text-red-500'} />
              ASHRAE TC 9.9 Compliance — Class {complianceReport.thermalClass}
            </h3>
            <div className={`px-4 py-2 rounded-xl text-sm font-bold ${
              complianceReport.overallPass ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              Score: {complianceReport.score}/100
            </div>
          </div>
          <div className="space-y-2">
            {complianceReport.checks.map((check, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${
                check.passed ? 'bg-slate-50' : check.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${check.passed ? 'bg-emerald-500' : check.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="text-sm font-medium text-slate-700">{check.description}</span>
                </div>
                <span className="text-sm font-bold text-slate-600">{check.value} {check.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PUE Analysis */}
      {pueAnalysis && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <Zap size={20} className="text-blue-600" /> Energy Efficiency (PUE)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-3xl font-extrabold text-blue-600">{pueAnalysis.pue}</p>
              <p className="text-xs font-bold text-slate-500 mt-1">PUE</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-xl font-bold text-slate-700">{pueAnalysis.itEquipmentPower} kW</p>
              <p className="text-xs font-bold text-slate-500 mt-1">IT Power</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-xl font-bold text-slate-700">{pueAnalysis.coolingPower} kW</p>
              <p className="text-xs font-bold text-slate-500 mt-1">Cooling Power</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-xl font-bold text-slate-700">{pueAnalysis.totalFacilityPower} kW</p>
              <p className="text-xs font-bold text-slate-500 mt-1">Total Power</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className={`text-xl font-bold ${
                pueAnalysis.rating === 'excellent' ? 'text-emerald-600' :
                pueAnalysis.rating === 'good' ? 'text-blue-600' :
                pueAnalysis.rating === 'average' ? 'text-amber-600' : 'text-red-600'
              }`}>{pueAnalysis.rating.toUpperCase()}</p>
              <p className="text-xs font-bold text-slate-500 mt-1">Rating</p>
            </div>
          </div>
          {pueAnalysis.recommendations.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-sm font-bold text-blue-700 mb-2">Recommendations:</p>
              <ul className="space-y-1">
                {pueAnalysis.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Failure Simulation */}
      {failureResult && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" /> Failure Analysis: {failureResult.scenario.replace(/_/g, ' ').toUpperCase()}
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-2xl font-extrabold text-yellow-700">{failureResult.timeToWarning >= 0 ? `${Math.round(failureResult.timeToWarning / 60)}m` : 'N/A'}</p>
              <p className="text-xs font-bold text-yellow-600 mt-1">Time to Warning</p>
            </div>
            <div className="text-center p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-2xl font-extrabold text-red-700">{failureResult.timeToCritical >= 0 ? `${Math.round(failureResult.timeToCritical / 60)}m` : 'N/A'}</p>
              <p className="text-xs font-bold text-red-600 mt-1">Time to Critical</p>
            </div>
            <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-2xl font-extrabold text-slate-700">{failureResult.affectedRacks.length}</p>
              <p className="text-xs font-bold text-slate-600 mt-1">Affected Racks</p>
            </div>
          </div>
          {failureResult.recommendations.length > 0 && (
            <div className="p-4 bg-red-50 rounded-xl border border-red-100">
              <ul className="space-y-1">
                {failureResult.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-red-800 flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Optimization Results */}
      {optimizationResult && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500" /> Optimization Results
          </h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-3xl font-extrabold text-emerald-600">{optimizationResult.improvement}%</p>
              <p className="text-xs font-bold text-emerald-600 mt-1">Improvement</p>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs font-bold text-slate-500">Before: Max Temp</p>
                <p className="text-lg font-bold text-slate-700">{optimizationResult.initialMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs font-bold text-slate-500">After: Max Temp</p>
                <p className="text-lg font-bold text-emerald-600">{optimizationResult.optimizedMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
            </div>
          </div>
          <h4 className="text-sm font-bold text-slate-700 mb-3">Suggestions ({optimizationResult.suggestions.length})</h4>
          <div className="space-y-2">
            {optimizationResult.suggestions.map((sug, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-700">{sug.description}</span>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold">{sug.impact}% impact</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Failure Simulation Panel ───────────────────────────────────────

function FailurePanel() {
  const { hvacUnits, runFailure, isRunning } = useSimulationStore();
  const [scenario, setScenario] = useState<FailureScenario>('crac_failure');
  const [duration, setDuration] = useState(3600);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const handleRun = () => {
    runFailure({
      scenario,
      failedUnitIds: selectedUnits,
      duration,
      timeStep: 10,
      rackMass: 500,
      specificHeat: 900,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">Failure Scenario</label>
          <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={scenario} onChange={e => setScenario(e.target.value as FailureScenario)}>
            <option value="crac_failure">CRAC Unit Failure</option>
            <option value="power_loss">Total Power Loss</option>
            <option value="cooling_restart">Cooling Restart</option>
            <option value="partial_cooling">Partial Cooling Loss</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">Duration (seconds)</label>
          <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" type="number" value={duration} onChange={e => setDuration(+e.target.value)} />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <AlertTriangle size={16} /> Run Failure Sim
          </button>
        </div>
      </div>
      {scenario !== 'power_loss' && hvacUnits.length > 0 && (
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-2">Select Failed Units</label>
          <div className="flex flex-wrap gap-2">
            {hvacUnits.map(unit => (
              <button
                key={unit.id}
                onClick={() => {
                  setSelectedUnits(prev =>
                    prev.includes(unit.id) ? prev.filter(id => id !== unit.id) : [...prev, unit.id]
                  );
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  selectedUnits.includes(unit.id)
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {unit.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function SimulationPage() {
  const [activeTab, setActiveTab] = useState('equipment');
  const {
    racks, hvacUnits, isRunning, result,
    runSimulation, runCompliance, runPUE, runOptimization, clearResults,
  } = useSimulationStore();

  const totalHeatKW = useMemo(() => racks.reduce((s, r) => s + r.powerKW, 0), [racks]);
  const totalCoolingKW = useMemo(() => hvacUnits.filter(u => u.status !== 'failed').reduce((s, u) => s + u.capacityKW, 0), [hvacUnits]);

  const tabs = [
    { id: 'equipment', label: 'Equipment', icon: <Server size={16} />, badge: racks.length + hvacUnits.length },
    { id: 'config', label: 'Configuration', icon: <Settings2 size={16} /> },
    { id: '3d', label: '3D Airflow', icon: <Box size={16} /> },
    { id: 'results', label: 'Results & Analysis', icon: <BarChart3 size={16} /> },
    { id: 'failure', label: 'Failure Simulation', icon: <AlertTriangle size={16} /> },
  ];

  return (
    <PageWrapper>
      <PageHeader
        title="CFD Simulation"
        description="Airflow simulation, thermal analysis, and cooling optimization"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => { runPUE(); }}
              disabled={racks.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Zap size={16} /> PUE
            </button>
            <button
              onClick={() => { runCompliance(); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ShieldCheck size={16} /> Compliance
            </button>
            <button
              onClick={() => { runOptimization(); }}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <TrendingUp size={16} /> Optimize
            </button>
            <button
              onClick={() => runSimulation('', '')}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-600/20 transition-colors"
            >
              {isRunning ? <><RotateCcw size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run Simulation</>}
            </button>
          </div>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Server Racks" value={racks.length} icon={Server} />
        <StatCard title="HVAC Units" value={hvacUnits.length} icon={AirVent} />
        <StatCard title="Total Heat Load" value={`${totalHeatKW.toFixed(0)} kW`} subtitle={`${(totalHeatKW * 3412).toLocaleString()} BTU/hr`} icon={Thermometer} />
        <StatCard title="Cooling Capacity" value={`${totalCoolingKW.toFixed(0)} kW`} subtitle={totalHeatKW > 0 ? `${((totalCoolingKW / totalHeatKW) * 100).toFixed(0)}% of load` : '—'} icon={Wind} />
      </div>

      {/* Capacity Alert */}
      {totalHeatKW > 0 && totalCoolingKW < totalHeatKW && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 mb-8 bg-red-50 border border-red-200 rounded-xl"
        >
          <AlertTriangle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-700">
            <strong>Cooling deficit:</strong> Total heat load ({totalHeatKW.toFixed(0)} kW) exceeds cooling capacity ({totalCoolingKW.toFixed(0)} kW).
            Add {(totalHeatKW - totalCoolingKW).toFixed(0)} kW more cooling capacity.
          </p>
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        <TabPanel tabId="equipment" activeTab={activeTab}>
          <EquipmentPanel />
        </TabPanel>
        <TabPanel tabId="config" activeTab={activeTab}>
          <ConfigPanel />
        </TabPanel>
        <TabPanel tabId="3d" activeTab={activeTab}>
          {result ? (
            <AirflowViewer3D
              result={result}
              racks={racks}
              hvacUnits={hvacUnits}
              showHotspots
              showAirflow
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[500px] bg-slate-900 rounded-xl border border-slate-700">
              <Box size={48} className="text-slate-600 mb-4" />
              <p className="text-slate-400 font-bold">Run a simulation to view 3D airflow</p>
            </div>
          )}
        </TabPanel>
        <TabPanel tabId="results" activeTab={activeTab}>
          <ResultsPanel />
        </TabPanel>
        <TabPanel tabId="failure" activeTab={activeTab}>
          <FailurePanel />
        </TabPanel>
      </Tabs>
    </PageWrapper>
  );
}
