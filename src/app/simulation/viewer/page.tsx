'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Wind, Thermometer, Plus, Trash2, Play, ShieldCheck,
  AlertTriangle, Zap, TrendingUp, Server, AirVent, Grid3x3,
  RotateCcw, Settings2, BarChart3, Box, Wand2, Building2,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useSimulationStore } from '@/stores/simulation-store';
import type {
  RackDensity, HVACUnitType, FailureScenario,
  ServerRack, HVACUnit,
} from '@/types/simulation';
import type { Project } from '@/types/project';
import { authFetch } from '@/lib/api-client';
import { showToast } from '@/components/ui/toast';

const AirflowViewer3D = dynamic(
  () => import('@/components/building/AirflowViewer3D').then(mod => mod.default),
  { ssr: false, loading: () => <div className="flex h-125 items-center justify-center rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading 3D viewer...</div> }
);

// ─── Auto-Detect Types & Logic ──────────────────────────────────────

interface DetectedFloor {
  id: string;
  floorNumber: number;
  name: string;
  ceilingHeight: number;
  rooms: DetectedRoom[];
}

interface DetectedRoom {
  id: string;
  name: string;
  area: number;
  ceilingHeight: number;
  spaceType: string;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  coolingLoad: { trValue?: number; btuValue?: number } | null;
}

/** Infer server racks from a server_room room's equipment load */
function inferRacksFromRoom(room: DetectedRoom, offsetX: number): Omit<ServerRack, 'id'>[] {
  // Only server rooms get auto-detected racks
  if (room.spaceType !== 'server_room') return [];
  const equipW = room.equipmentLoad || 5000; // default 5kW for a server room
  const perRackKW = 7; // typical medium density
  const rackCount = Math.max(1, Math.round(equipW / 1000 / perRackKW));
  const racks: Omit<ServerRack, 'id'>[] = [];

  for (let i = 0; i < rackCount; i++) {
    const density: RackDensity = equipW / 1000 / rackCount >= 15 ? 'high' : equipW / 1000 / rackCount >= 5 ? 'medium' : 'low';
    racks.push({
      name: `${room.name} - Rack ${i + 1}`,
      position: { x: offsetX + i * 1.2, y: 1, z: 0 },
      width: 0.6, depth: 1.2, height: 2.0,
      powerDensity: density,
      powerKW: Math.round((equipW / 1000) / rackCount * 10) / 10,
      airflowCFM: Math.round(((equipW / 1000) / rackCount) * 50),
      orientation: 0,
      rackUnits: 42,
      filledUnits: Math.round(42 * 0.7),
    });
  }
  return racks;
}

/** Infer HVAC units needed for a room based on cooling load or area */
function inferHVACFromRoom(room: DetectedRoom, offsetX: number): Omit<HVACUnit, 'id'>[] {
  // Determine cooling needed in kW
  let coolingKW: number;
  if (room.coolingLoad?.trValue) {
    coolingKW = room.coolingLoad.trValue * 3.517;
  } else if (room.coolingLoad?.btuValue) {
    coolingKW = room.coolingLoad.btuValue / 3412;
  } else {
    // Estimate: ~150 W/m² for server rooms, ~100 W/m² for offices, ~80 W/m² for general
    const wPerSqm = room.spaceType === 'server_room' ? 150 : room.spaceType === 'office' ? 100 : 80;
    coolingKW = (room.area * wPerSqm) / 1000;
  }

  if (coolingKW < 0.5) return [];

  // Choose unit type based on space
  let unitType: HVACUnitType = 'crac';
  let perUnitKW = 30;

  if (room.spaceType === 'server_room') {
    if (coolingKW > 60) {
      unitType = 'crah';
      perUnitKW = 60;
    } else {
      unitType = 'crac';
      perUnitKW = 30;
    }
  } else if (coolingKW <= 15) {
    unitType = 'ahu';
    perUnitKW = 15;
  } else {
    unitType = 'ahu';
    perUnitKW = 30;
  }

  const unitCount = Math.max(1, Math.ceil(coolingKW / perUnitKW));
  const actualPerUnit = coolingKW / unitCount;
  const units: Omit<HVACUnit, 'id'>[] = [];

  for (let i = 0; i < unitCount; i++) {
    units.push({
      type: unitType,
      name: `${room.name} - ${unitType.toUpperCase()} ${i + 1}`,
      position: { x: offsetX + i * 2, y: Math.sqrt(room.area) - 1, z: 0 },
      width: 1.0, depth: 1.0, height: 2.5,
      capacityKW: Math.round(actualPerUnit * 10) / 10,
      capacityTR: Math.round((actualPerUnit / 3.517) * 10) / 10,
      airflowCFM: Math.round(actualPerUnit * 170),
      supplyTempC: room.spaceType === 'server_room' ? 13 : 16,
      returnTempC: 24,
      orientation: 0,
      powerInputKW: Math.round(actualPerUnit / 3 * 10) / 10,
      status: 'active',
    });
  }
  return units;
}

// ─── Temperature Heatmap Component ──────────────────────────────────

function TemperatureHeatmap() {
  const { result, selectedSliceZ, setSelectedSliceZ, config } = useSimulationStore();

  if (!result) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Run a simulation to see temperature distribution</p>
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
        <h3 className="text-base font-semibold text-foreground">Temperature Distribution (Z = {selectedSliceZ})</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Height Layer:</label>
          <input
            type="range"
            min={0}
            max={config.gridSizeZ - 1}
            value={selectedSliceZ}
            onChange={e => setSelectedSliceZ(Number(e.target.value))}
            className="w-32"
            aria-label="Height Layer"
          />
          <span className="w-20 text-sm font-semibold tabular-nums text-foreground">
            {(selectedSliceZ * config.gridResolution).toFixed(1)}m
          </span>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-slate-900 p-4 shadow-sm">
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
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">{minT.toFixed(1)}°C</span>
        <div className="flex-1 h-3 rounded-full cfd-heatmap-legend" />
        <span className="text-sm font-medium text-muted-foreground">{maxT.toFixed(1)}°C</span>
      </div>
    </div>
  );
}

// ─── Equipment Setup Panel ──────────────────────────────────────────

function EquipmentPanel({ floors, selectedFloorId, onFloorChange, onAutoDetect, isDetecting }: {
  floors: DetectedFloor[];
  selectedFloorId: string;
  onFloorChange: (id: string) => void;
  onAutoDetect: () => void;
  isDetecting: boolean;
}) {
  const { racks, hvacUnits, tiles, addRack, removeRack, addHVACUnit, removeHVACUnit, addTile, removeTile } = useSimulationStore();

  const selectedFloor = floors.find(f => f.id === selectedFloorId);
  const roomSummary = selectedFloor?.rooms ?? [];

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
      {/* Auto-Detect from Project Rooms */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Wand2 size={20} className="text-accent" /> Auto-Detect from Room Specs
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Automatically populate server racks, HVAC units, and grid size from the selected floor&apos;s room specifications.
        </p>

        {floors.length > 0 ? (
          <div className="space-y-4">
            {/* Floor Selector */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-50">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Select Floor</label>
                <select
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
                  value={selectedFloorId}
                  onChange={e => onFloorChange(e.target.value)}
                  aria-label="Select Floor"
                >
                  {floors.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Floor {f.floorNumber}) — {f.rooms.length} room{f.rooms.length !== 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={onAutoDetect}
                disabled={isDetecting || !selectedFloorId}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {isDetecting ? (
                  <><RotateCcw size={16} className="animate-spin" /> Detecting...</>
                ) : (
                  <><Wand2 size={16} /> Auto-Detect Equipment</>
                )}
              </button>
            </div>

            {/* Room Summary Cards */}
            {roomSummary.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {roomSummary.map(room => {
                  const isServer = room.spaceType === 'server_room';
                  return (
                    <div key={room.id} className={`rounded-xl border p-3.5 text-sm ${isServer
                      ? 'border-warning/30 bg-warning/5'
                      : 'border-border bg-card'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {isServer ? <Server size={14} className="text-warning" /> : <Building2 size={14} className="text-muted-foreground" />}
                        <span className="font-semibold text-foreground truncate">{room.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>Type:</span>
                        <span className="font-medium text-foreground">{room.spaceType.replace(/_/g, ' ')}</span>
                        <span>Area:</span>
                        <span className="font-medium text-foreground">{room.area.toFixed(1)} m²</span>
                        <span>Occupants:</span>
                        <span className="font-medium text-foreground">{room.occupantCount}</span>
                        <span>Equip. Load:</span>
                        <span className="font-medium text-foreground">{room.equipmentLoad > 0 ? `${(room.equipmentLoad / 1000).toFixed(1)} kW` : '—'}</span>
                        <span>Lighting:</span>
                        <span className="font-medium text-foreground">{room.lightingDensity > 0 ? `${room.lightingDensity} W/m²` : '—'}</span>
                        {room.coolingLoad?.trValue ? <>
                          <span>Cooling:</span>
                          <span className="font-medium text-accent">{room.coolingLoad.trValue.toFixed(2)} TR</span>
                        </> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">
            Select a project above to see available floors and rooms.
          </div>
        )}
      </div>

      {/* Server Racks */}
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Server size={20} className="text-accent" /> Server Racks
        </h3>
        <div className="mb-5 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-5">
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" placeholder="Name" value={rackForm.name} onChange={e => setRackForm(f => ({ ...f, name: e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="X (m)" value={rackForm.posX} onChange={e => setRackForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Y (m)" value={rackForm.posY} onChange={e => setRackForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Power (kW)" value={rackForm.powerKW} onChange={e => setRackForm(f => ({ ...f, powerKW: +e.target.value }))} />
          <button onClick={handleAddRack} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
            <Plus size={16} /> Add Rack
          </button>
        </div>
        {racks.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Position</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Power</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">BTU/hr</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {racks.map(rack => (
                  <tr key={rack.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3 font-medium">{rack.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">({rack.position.x}, {rack.position.y})</td>
                    <td className="px-4 py-3 font-bold text-warning">{rack.powerKW} kW</td>
                    <td className="px-4 py-3 text-muted-foreground">{(rack.powerKW * 3412).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeRack(rack.id)} aria-label="Remove rack" className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-[rgba(216,77,87,0.12)] hover:text-destructive">
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
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <AirVent size={20} className="text-accent" /> HVAC Cooling Units
        </h3>
        <div className="mb-5 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-6">
          <select className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" value={hvacForm.type} onChange={e => setHvacForm(f => ({ ...f, type: e.target.value as HVACUnitType }))} aria-label="HVAC unit type">
            <option value="crac">CRAC</option>
            <option value="crah">CRAH</option>
            <option value="ahu">AHU</option>
            <option value="in_row">In-Row</option>
            <option value="rear_door">Rear Door HX</option>
          </select>
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="X (m)" value={hvacForm.posX} onChange={e => setHvacForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Y (m)" value={hvacForm.posY} onChange={e => setHvacForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Capacity (kW)" value={hvacForm.capacityKW} onChange={e => setHvacForm(f => ({ ...f, capacityKW: +e.target.value }))} />
          <input className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Airflow (CFM)" value={hvacForm.airflowCFM} onChange={e => setHvacForm(f => ({ ...f, airflowCFM: +e.target.value }))} />
          <button onClick={handleAddHVAC} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
            <Plus size={16} /> Add Unit
          </button>
        </div>
        {hvacUnits.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Position</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Capacity</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Airflow</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {hvacUnits.map(unit => (
                  <tr key={unit.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3 font-medium">{unit.name}</td>
                    <td className="px-4 py-3"><span className="rounded-md border border-accent/30 bg-[rgba(15,139,141,0.12)] px-2.5 py-1 text-sm font-semibold text-accent">{unit.type.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">({unit.position.x}, {unit.position.y})</td>
                    <td className="px-4 py-3 font-bold text-success">{unit.capacityKW} kW</td>
                    <td className="px-4 py-3 text-muted-foreground">{unit.airflowCFM.toLocaleString()} CFM</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeHVACUnit(unit.id)} aria-label="Remove HVAC unit" className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-[rgba(216,77,87,0.12)] hover:text-destructive">
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
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Grid3x3 size={20} className="text-accent" /> Perforated Floor Tiles
        </h3>
        <div className="mb-5 flex gap-3 rounded-xl border border-border bg-card p-4">
          <input id="tileX" className="w-24 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Grid X" defaultValue={5} />
          <input id="tileY" className="w-24 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Grid Y" defaultValue={5} />
          <input id="tileOpen" className="w-32 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.05" placeholder="Open Area (0-1)" defaultValue={0.25} />
          <button
            onClick={() => {
              const x = parseInt((document.getElementById('tileX') as HTMLInputElement).value);
              const y = parseInt((document.getElementById('tileY') as HTMLInputElement).value);
              const openArea = parseFloat((document.getElementById('tileOpen') as HTMLInputElement).value);
              if (!isNaN(x) && !isNaN(y) && openArea >= 0 && openArea <= 1) {
                addTile({ x, y, openArea, tileSize: 0.6 });
              }
            }}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Plus size={16} /> Add Tile
          </button>
        </div>
        {tiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5 text-sm">
                <Grid3x3 size={14} className="text-muted-foreground" />
                <span>({tile.x}, {tile.y})</span>
                <span className="text-muted-foreground">{(tile.openArea * 100).toFixed(0)}%</span>
                <button onClick={() => removeTile(tile.x, tile.y)} aria-label="Remove tile" className="text-destructive/70 hover:text-destructive">
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
  const { config, setConfig } = useSimulationStore();

  return (
    <div className="grid grid-cols-2 gap-5 rounded-xl border border-border bg-card p-6 shadow-sm md:grid-cols-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Resolution (m)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.1" value={config.gridResolution} onChange={e => setConfig({ gridResolution: +e.target.value })} aria-label="Grid Resolution" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size X</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeX} onChange={e => setConfig({ gridSizeX: +e.target.value })} aria-label="Grid Size X" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size Y</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeY} onChange={e => setConfig({ gridSizeY: +e.target.value })} aria-label="Grid Size Y" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grid Size Z</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.gridSizeZ} onChange={e => setConfig({ gridSizeZ: +e.target.value })} aria-label="Grid Size Z" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Iterations</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.iterations} onChange={e => setConfig({ iterations: +e.target.value })} aria-label="Iterations" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Convergence</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.001" value={config.convergence} onChange={e => setConfig({ convergence: +e.target.value })} aria-label="Convergence" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Time Step (s)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.01" value={config.timeStep} onChange={e => setConfig({ timeStep: +e.target.value })} aria-label="Time Step" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ambient Temp (°C)</label>
        <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={config.ambientTempC} onChange={e => setConfig({ ambientTempC: +e.target.value })} aria-label="Ambient Temperature" />
      </div>
    </div>
  );
}

// ─── Results Panel ──────────────────────────────────────────────────

function ResultsPanel() {
  const { result, complianceReport, failureResult, pueAnalysis, optimizationResult } = useSimulationStore();

  if (!result) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm">
        <Wind size={48} className="mb-4 text-muted-foreground/45" />
        <p className="text-lg font-bold text-foreground">No simulation results yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Place equipment and run a CFD simulation</p>
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
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <TemperatureHeatmap />
      </div>

      {/* Rack Inlet Temperatures */}
      {m.rackInletTemps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Rack Inlet Temperatures</h3>
          <div className="space-y-2">
            {m.rackInletTemps.map(rack => {
              const pct = ((rack.avgTemp - 15) / 30) * 100;
              const barColor = rack.avgTemp > 35 ? 'bg-red-500' : rack.avgTemp > 27 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={rack.rackId} className="flex items-center gap-4">
                  <span className="w-32 truncate text-sm font-medium text-muted-foreground">{rack.rackId.slice(0, 8)}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary/70">
                    <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(100, Math.max(5, pct))}%` }} />
                  </div>
                  <span className="w-16 text-right text-sm font-bold text-foreground">{rack.avgTemp.toFixed(1)}°C</span>
                  <span className="w-24 text-sm text-muted-foreground">(max {rack.maxTemp.toFixed(1)}°C)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hotspots Detail */}
      {m.hotspots.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle size={20} className="text-amber-500" /> Detected Hotspots
          </h3>
          <div className="space-y-3">
            {m.hotspots.map((hs, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${
                hs.severity === 'emergency' ? 'bg-[rgba(216,77,87,0.1)] border-[rgba(216,77,87,0.3)]' :
                hs.severity === 'critical' ? 'bg-[rgba(219,142,47,0.14)] border-[rgba(219,142,47,0.35)]' :
                'bg-[rgba(206,161,74,0.14)] border-[rgba(206,161,74,0.35)]'
              }`}>
                <div>
                  <span className={`rounded-md px-2.5 py-1 text-sm font-bold uppercase ${
                    hs.severity === 'emergency' ? 'bg-[rgba(216,77,87,0.18)] text-destructive' :
                    hs.severity === 'critical' ? 'bg-[rgba(219,142,47,0.18)] text-warning' :
                    'bg-[rgba(206,161,74,0.2)] text-accent'
                  }`}>{hs.severity}</span>
                  <span className="ml-3 text-sm text-foreground/90">
                    Position: ({hs.position.x.toFixed(1)}, {hs.position.y.toFixed(1)}, {hs.position.z.toFixed(1)})m
                  </span>
                </div>
                <span className="text-lg font-semibold text-foreground">{hs.temperature.toFixed(1)}°C</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ASHRAE Compliance */}
      {complianceReport && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
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
              <div key={i} className={`flex items-center justify-between rounded-lg border p-3 ${
                check.passed
                  ? 'border-border bg-secondary/50'
                  : check.severity === 'critical'
                    ? 'border-[rgba(216,77,87,0.32)] bg-[rgba(216,77,87,0.1)]'
                    : 'border-[rgba(219,142,47,0.32)] bg-[rgba(219,142,47,0.12)]'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${check.passed ? 'bg-emerald-500' : check.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="text-sm font-medium text-foreground">{check.description}</span>
                </div>
                <span className="text-sm font-bold text-muted-foreground">{check.value} {check.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PUE Analysis */}
      {pueAnalysis && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Zap size={20} className="text-accent" /> Energy Efficiency (PUE)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className="text-3xl font-semibold text-accent">{pueAnalysis.pue}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">PUE</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.itEquipmentPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">IT Power</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.coolingPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Cooling Power</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.totalFacilityPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Total Power</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className={`text-xl font-bold ${
                pueAnalysis.rating === 'excellent' ? 'text-emerald-600' :
                pueAnalysis.rating === 'good' ? 'text-accent' :
                pueAnalysis.rating === 'average' ? 'text-amber-600' : 'text-red-600'
              }`}>{pueAnalysis.rating.toUpperCase()}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Rating</p>
            </div>
          </div>
          {pueAnalysis.recommendations.length > 0 && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-4">
              <p className="mb-2 text-sm font-bold text-accent">Recommendations:</p>
              <ul className="space-y-1">
                {pueAnalysis.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-0.5 text-accent">•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Failure Simulation */}
      {failureResult && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle size={20} className="text-red-500" /> Failure Analysis: {failureResult.scenario.replace(/_/g, ' ').toUpperCase()}
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-xl border border-[rgba(219,142,47,0.35)] bg-[rgba(219,142,47,0.14)] p-4 text-center">
              <p className="text-2xl font-semibold text-yellow-700">{failureResult.timeToWarning >= 0 ? `${Math.round(failureResult.timeToWarning / 60)}m` : 'N/A'}</p>
              <p className="mt-1 text-sm font-semibold text-yellow-600">Time to Warning</p>
            </div>
            <div className="rounded-xl border border-[rgba(216,77,87,0.35)] bg-[rgba(216,77,87,0.1)] p-4 text-center">
              <p className="text-2xl font-semibold text-red-700">{failureResult.timeToCritical >= 0 ? `${Math.round(failureResult.timeToCritical / 60)}m` : 'N/A'}</p>
              <p className="mt-1 text-sm font-semibold text-red-600">Time to Critical</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{failureResult.affectedRacks.length}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Affected Racks</p>
            </div>
          </div>
          {failureResult.recommendations.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-4">
              <ul className="space-y-1">
                {failureResult.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-destructive">
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
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <TrendingUp size={20} className="text-emerald-500" /> Optimization Results
          </h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-3xl font-semibold text-emerald-600">{optimizationResult.improvement}%</p>
              <p className="mt-1 text-sm font-semibold text-emerald-600">Improvement</p>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-muted-foreground">Before: Max Temp</p>
                <p className="text-lg font-bold text-foreground">{optimizationResult.initialMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-muted-foreground">After: Max Temp</p>
                <p className="text-lg font-bold text-emerald-600">{optimizationResult.optimizedMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
            </div>
          </div>
          <h4 className="mb-3 text-sm font-bold text-foreground">Suggestions ({optimizationResult.suggestions.length})</h4>
          <div className="space-y-2">
            {optimizationResult.suggestions.map((sug, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
                <span className="text-sm text-foreground">{sug.description}</span>
                <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-700">{sug.impact}% impact</span>
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
      <div className="grid grid-cols-2 gap-5 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Failure Scenario</label>
          <select className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" value={scenario} onChange={e => setScenario(e.target.value as FailureScenario)} aria-label="Failure Scenario">
            <option value="crac_failure">CRAC Unit Failure</option>
            <option value="power_loss">Total Power Loss</option>
            <option value="cooling_restart">Cooling Restart</option>
            <option value="partial_cooling">Partial Cooling Loss</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Duration (seconds)</label>
          <input className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm" type="number" value={duration} onChange={e => setDuration(+e.target.value)} aria-label="Duration" />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            <AlertTriangle size={16} /> Run Failure Sim
          </button>
        </div>
      </div>
      {scenario !== 'power_loss' && hvacUnits.length > 0 && (
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Select Failed Units</label>
          <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4">
            {hvacUnits.map(unit => (
              <button
                key={unit.id}
                onClick={() => {
                  setSelectedUnits(prev =>
                    prev.includes(unit.id) ? prev.filter(id => id !== unit.id) : [...prev, unit.id]
                  );
                }}
                className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  selectedUnits.includes(unit.id)
                    ? 'border-red-500/35 bg-red-500/10 text-destructive'
                    : 'border-border bg-background text-muted-foreground hover:border-border'
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

function ProjectDropdown({ projects, onSelect, selectedId }: ProjectDropdownProps) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Choose Project</label>
      <select
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
        value={selectedId}
        onChange={e => onSelect(e.target.value)}
        aria-label="Choose Project"
      >
        {projects.map((p: Project) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

interface ProjectDropdownProps {
  projects: Project[];
  onSelect: (id: string) => void;
  selectedId: string;
}
// Project dropdown now fetches from API

export default function SimulationPage() {
  const [simError, setSimError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeTab, setActiveTab] = useState('equipment');
  const {
    racks, hvacUnits, isRunning, result,
    runSimulation, runCompliance, runPUE, runOptimization,
    activeView, showHotspots, showAirflow, selectedSliceZ,
    setActiveView, setShowHotspots, setShowAirflow, setSelectedSliceZ,
    addRack, addHVACUnit, setConfig, clearAll,
  } = useSimulationStore();  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [detectedFloors, setDetectedFloors] = useState<DetectedFloor[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);

  // Fetch projects
  useEffect(() => {
    authFetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.projects && Array.isArray(data.projects)) {
          setProjectList(data.projects);
          if (data.projects.length > 0) {
            setSelectedProjectId(data.projects[0].id);
          }
        }
        setLoadingProjects(false);
      })
      .catch((err) => {
        setLoadingProjects(false);
        setSimError('Failed to load projects: ' + err?.message);
      });
  }, []);

  // Fetch floors+rooms when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    authFetch(`/api/projects/${selectedProjectId}`)
      .then(res => res.json())
      .then(data => {
        const project = data.project || data;
        if (project.floors && Array.isArray(project.floors)) {
          const floors: DetectedFloor[] = project.floors.map((f: Record<string, unknown>) => ({
            id: f.id as string,
            floorNumber: (f.floorNumber as number) ?? 0,
            name: (f.name as string) ?? `Floor ${f.floorNumber}`,
            ceilingHeight: (f.ceilingHeight as number) ?? 3.0,
            rooms: Array.isArray(f.rooms) ? (f.rooms as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
              id: r.id as string,
              name: (r.name as string) ?? 'Room',
              area: (r.area as number) ?? 0,
              ceilingHeight: (r.ceilingHeight as number) ?? 3.0,
              spaceType: (r.spaceType as string) ?? 'office',
              occupantCount: (r.occupantCount as number) ?? 0,
              lightingDensity: (r.lightingDensity as number) ?? 0,
              equipmentLoad: (r.equipmentLoad as number) ?? 0,
              coolingLoad: r.coolingLoad as DetectedRoom['coolingLoad'],
            })) : [],
          }));
          setDetectedFloors(floors);
          if (floors.length > 0) setSelectedFloorId(floors[0].id);
        }
      })
      .catch(() => { /* ignore */ });
  }, [selectedProjectId]);

  // Auto-detect handler: infer racks + HVAC from room specs
  const handleAutoDetect = useCallback(() => {
    const floor = detectedFloors.find(f => f.id === selectedFloorId);
    if (!floor || floor.rooms.length === 0) {
      showToast('error', 'No rooms found', 'This floor has no rooms to auto-detect from.');
      return;
    }

    setIsDetecting(true);

    // Clear existing equipment and results
    clearAll();

    const allRacks: Omit<ServerRack, 'id'>[] = [];
    const allHVAC: Omit<HVACUnit, 'id'>[] = [];
    let offsetX = 1;

    for (const room of floor.rooms) {
      // Infer racks (only for server rooms)
      const racks = inferRacksFromRoom(room, offsetX);
      allRacks.push(...racks);

      // Infer HVAC units for every room
      const hvacs = inferHVACFromRoom(room, offsetX);
      allHVAC.push(...hvacs);

      offsetX += Math.max(Math.ceil(Math.sqrt(room.area)), 4) + 2;
    }

    // Add all to store
    for (const rack of allRacks) addRack(rack);
    for (const unit of allHVAC) addHVACUnit(unit);

    // Auto-size grid based on floor area
    const totalArea = floor.rooms.reduce((s, r) => s + r.area, 0);
    const gridSide = Math.max(10, Math.ceil(Math.sqrt(totalArea) / 0.5));
    const gridZ = Math.max(6, Math.ceil(floor.ceilingHeight / 0.5));
    setConfig({
      gridSizeX: Math.min(gridSide, 50),
      gridSizeY: Math.min(gridSide, 50),
      gridSizeZ: gridZ,
    });

    setIsDetecting(false);
    showToast('success', 'Equipment auto-detected', `Added ${allRacks.length} rack${allRacks.length !== 1 ? 's' : ''} and ${allHVAC.length} HVAC unit${allHVAC.length !== 1 ? 's' : ''} from ${floor.rooms.length} room${floor.rooms.length !== 1 ? 's' : ''}`);
  }, [detectedFloors, selectedFloorId, addRack, addHVACUnit, setConfig, clearAll]);
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
      {simError && (
        <div className="mx-auto mb-6 mt-6 max-w-4xl rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm font-semibold text-destructive">
          {simError}
        </div>
      )}
      <PageHeader
        title="CFD Simulation"
        description="Airflow simulation, thermal analysis, and cooling optimization"
        actions={
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card p-2 shadow-sm">
            <button
              onClick={() => { runPUE(); }}
              disabled={racks.length === 0}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              <Zap size={16} /> PUE
            </button>
            <button
              onClick={() => { runCompliance(); }}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
            >
              <ShieldCheck size={16} /> Compliance
            </button>
            <button
              onClick={() => { runOptimization(); }}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              <TrendingUp size={16} /> Optimize
            </button>
            <button
              onClick={() => runSimulation(selectedProjectId || '', selectedFloorId || '')}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {isRunning ? <><RotateCcw size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run Simulation</>}
            </button>
          </div>
        }
      />

      <div className="max-w-4xl mx-auto">
        {loadingProjects ? (
          <div className="py-6 text-center text-sm font-medium text-muted-foreground">Loading projects...</div>
        ) : (
          <ProjectDropdown
            projects={projectList}
            selectedId={selectedProjectId}
            onSelect={(id) => { setDetectedFloors([]); setSelectedProjectId(id); }}
          />
        )}
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-2 gap-5 md:grid-cols-4">
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
          className="mb-8 flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/8 p-4 shadow-sm"
        >
          <AlertTriangle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium text-destructive">
            <strong>Cooling deficit:</strong> Total heat load ({totalHeatKW.toFixed(0)} kW) exceeds cooling capacity ({totalCoolingKW.toFixed(0)} kW).
            Add {(totalHeatKW - totalCoolingKW).toFixed(0)} kW more cooling capacity.
          </p>
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        <TabPanel tabId="equipment" activeTab={activeTab}>
          <EquipmentPanel
            floors={detectedFloors}
            selectedFloorId={selectedFloorId}
            onFloorChange={setSelectedFloorId}
            onAutoDetect={handleAutoDetect}
            isDetecting={isDetecting}
          />
        </TabPanel>
        <TabPanel tabId="config" activeTab={activeTab}>
          <ConfigPanel />
        </TabPanel>
        <TabPanel tabId="3d" activeTab={activeTab}>
          {result ? (
            <>
              <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    View Mode
                  </span>
                  {(['temperature', 'velocity', 'pressure'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setActiveView(mode)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors ${
                        activeView === mode
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-background text-muted-foreground hover:border-border'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <div className="flex min-w-65 flex-1 items-center gap-3">
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Slice Z
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, result.config.gridSizeZ - 1)}
                      value={Math.max(0, Math.min(selectedSliceZ, result.config.gridSizeZ - 1))}
                      onChange={(event) => setSelectedSliceZ(Number(event.target.value))}
                      className="w-full"
                      aria-label="Slice Z"
                    />
                    <span className="w-24 text-right text-sm font-semibold tabular-nums text-foreground">
                      {Math.max(0, Math.min(selectedSliceZ, result.config.gridSizeZ - 1))} ({(Math.max(0, Math.min(selectedSliceZ, result.config.gridSizeZ - 1)) * result.config.gridResolution).toFixed(1)}m)
                    </span>
                  </div>

                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showHotspots}
                      onChange={(event) => setShowHotspots(event.target.checked)}
                    />
                    Hotspots
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showAirflow}
                      onChange={(event) => setShowAirflow(event.target.checked)}
                    />
                    Airflow Particles
                  </label>
                </div>
              </div>

              <AirflowViewer3D
                result={result}
                racks={racks}
                hvacUnits={hvacUnits}
                showHotspots={showHotspots}
                showAirflow={showAirflow}
                selectedSliceZ={selectedSliceZ}
                viewMode={activeView}
              />
            </>
          ) : (
            <div className="flex h-125 flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm">
              <Box size={48} className="mb-4 text-muted-foreground/45" />
              <p className="font-semibold text-foreground">Run a simulation to view 3D airflow</p>
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
