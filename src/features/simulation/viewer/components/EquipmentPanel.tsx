'use client';

import { AirVent, Building2, Grid3x3, Plus, RotateCcw, Server, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useSimulationStore } from '@/stores/simulation-store';
import { showToast } from '@/components/ui/toast';
import { HVAC_TYPE_DEFAULTS } from '../constants';
import type { RackDensity, HVACUnitType, HVACUnit } from '@/types/simulation';
import type { DetectedFloor, ViewerRoomBoundary } from '../types';
import { snapHVACUnit, validateHVACPlacement } from '../helpers';

// ─── Equipment Setup Panel ──────────────────────────────────────────

export function EquipmentPanel({ floors, selectedFloorId, roomBoundaries, onFloorChange, onAutoDetect, isDetecting }: {
  floors: DetectedFloor[];
  selectedFloorId: string;
  roomBoundaries: ViewerRoomBoundary[];
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
    const defaults = HVAC_TYPE_DEFAULTS[hvacForm.type];
    const candidate: HVACUnit = snapHVACUnit({
      id: `preview-${Date.now()}`,
      type: hvacForm.type,
      name: hvacForm.name || `${hvacForm.type.toUpperCase()} ${hvacUnits.length + 1}`,
      position: { x: hvacForm.posX, y: hvacForm.posY, z: 0 },
      width: defaults.width,
      depth: defaults.depth,
      height: defaults.height,
      capacityKW: hvacForm.capacityKW,
      capacityTR: hvacForm.capacityKW / 3.517,
      airflowCFM: hvacForm.airflowCFM,
      supplyTempC: hvacForm.supplyTempC,
      returnTempC: 24,
      orientation: 0,
      powerInputKW: hvacForm.capacityKW / 3,
      status: 'active',
    });

    const validation = validateHVACPlacement(candidate, hvacUnits, roomBoundaries);
    if (!validation.valid) {
      showToast('warning', 'Invalid HVAC placement', validation.reason ?? 'Placement validation failed');
      return;
    }

    addHVACUnit({
      type: candidate.type,
      name: candidate.name,
      position: candidate.position,
      width: candidate.width,
      depth: candidate.depth,
      height: candidate.height,
      capacityKW: candidate.capacityKW,
      capacityTR: candidate.capacityTR,
      airflowCFM: candidate.airflowCFM,
      supplyTempC: candidate.supplyTempC,
      returnTempC: candidate.returnTempC,
      orientation: candidate.orientation,
      powerInputKW: candidate.powerInputKW,
      status: candidate.status,
    });

    setHvacForm((form) => ({
      ...form,
      posX: candidate.position.x,
      posY: candidate.position.y,
    }));
  };

  return (
    <div className="space-y-8">
      {/* Auto-Detect from Project Rooms */}
      <div className="rounded-md border border-accent/30 bg-accent/5 p-5">
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
                  className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm"
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
                className="flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
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
                    <div key={room.id} className={`rounded-md border p-3.5 text-sm ${isServer
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
        <div className="panel-glass mb-5 grid grid-cols-2 gap-4 rounded-md border border-border/70 bg-card p-4 md:grid-cols-5">
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" placeholder="Name" value={rackForm.name} onChange={e => setRackForm(f => ({ ...f, name: e.target.value }))} />
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="X (m)" value={rackForm.posX} onChange={e => setRackForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Y (m)" value={rackForm.posY} onChange={e => setRackForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Power (kW)" value={rackForm.powerKW} onChange={e => setRackForm(f => ({ ...f, powerKW: +e.target.value }))} />
          <button onClick={handleAddRack} className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
            <Plus size={16} /> Add Rack
          </button>
        </div>
        {racks.length > 0 && (
          <div className="panel-glass overflow-hidden rounded-md border border-border/70 bg-card shadow-sm">
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
                      <button onClick={() => removeRack(rack.id)} aria-label="Remove rack" className="rounded-sm p-1.5 text-destructive/70 transition-colors hover:bg-[rgba(216,77,87,0.12)] hover:text-destructive">
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
        <div className="panel-glass mb-5 grid grid-cols-2 gap-4 rounded-md border border-border/70 bg-card p-4 md:grid-cols-6">
          <select className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" value={hvacForm.type} onChange={e => setHvacForm(f => ({ ...f, type: e.target.value as HVACUnitType }))} aria-label="HVAC unit type">
            <option value="crac">CRAC</option>
            <option value="crah">CRAH</option>
            <option value="ahu">AHU</option>
            <option value="in_row">In-Row</option>
            <option value="rear_door">Rear Door HX</option>
          </select>
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="X (m)" value={hvacForm.posX} onChange={e => setHvacForm(f => ({ ...f, posX: +e.target.value }))} />
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Y (m)" value={hvacForm.posY} onChange={e => setHvacForm(f => ({ ...f, posY: +e.target.value }))} />
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Capacity (kW)" value={hvacForm.capacityKW} onChange={e => setHvacForm(f => ({ ...f, capacityKW: +e.target.value }))} />
          <input className="rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Airflow (CFM)" value={hvacForm.airflowCFM} onChange={e => setHvacForm(f => ({ ...f, airflowCFM: +e.target.value }))} />
          <button onClick={handleAddHVAC} className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
            <Plus size={16} /> Add Unit
          </button>
        </div>
        <p className="-mt-2 mb-4 text-xs text-muted-foreground">
          Placement snaps to 0.25m grid and enforces room-boundary clearance plus no-overlap with existing units.
        </p>
        {hvacUnits.length > 0 && (
          <div className="panel-glass overflow-hidden rounded-md border border-border/70 bg-card shadow-sm">
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
                    <td className="px-4 py-3"><span className="rounded-sm border border-accent/30 bg-[rgba(15,139,141,0.12)] px-2.5 py-1 text-sm font-semibold text-accent">{unit.type.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">({unit.position.x}, {unit.position.y})</td>
                    <td className="px-4 py-3 font-bold text-success">{unit.capacityKW} kW</td>
                    <td className="px-4 py-3 text-muted-foreground">{unit.airflowCFM.toLocaleString()} CFM</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeHVACUnit(unit.id)} aria-label="Remove HVAC unit" className="rounded-sm p-1.5 text-destructive/70 transition-colors hover:bg-[rgba(216,77,87,0.12)] hover:text-destructive">
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
        <div className="panel-glass mb-5 flex gap-3 rounded-md border border-border/70 bg-card p-4">
          <input id="tileX" className="w-24 rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Grid X" defaultValue={5} />
          <input id="tileY" className="w-24 rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" placeholder="Grid Y" defaultValue={5} />
          <input id="tileOpen" className="w-32 rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" type="number" step="0.05" placeholder="Open Area (0-1)" defaultValue={0.25} />
          <button
            onClick={() => {
              const x = parseInt((document.getElementById('tileX') as HTMLInputElement).value);
              const y = parseInt((document.getElementById('tileY') as HTMLInputElement).value);
              const openArea = parseFloat((document.getElementById('tileOpen') as HTMLInputElement).value);
              if (!isNaN(x) && !isNaN(y) && openArea >= 0 && openArea <= 1) {
                addTile({ x, y, openArea, tileSize: 0.6 });
              }
            }}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Plus size={16} /> Add Tile
          </button>
        </div>
        {tiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3.5 py-2.5 text-sm">
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
