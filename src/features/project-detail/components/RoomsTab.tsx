'use client';

import { motion } from 'framer-motion';
import { Plus, Save, MapPin, Building2, Trash2, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DualValueExplainer } from '@/components/ui/dual-value-explainer';
import { TermHint } from '@/components/ui/term-hint';
import { listContainerVariants, listItemVariants } from '@/animations/list-variants';
import { formatPHP } from '@/lib/utils/format-currency';
import { feetToMeters, metersToFeet, sqmToSqft } from '@/lib/utils/unit-conversion';
import { psychrometricACRecommendation } from '@/lib/functions/psychrometric';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import { SPACE_TYPES, WALL_TYPES, GLASS_TYPES, ORIENTATIONS, EMPTY_ROOM_LOAD_DRAFT } from '../constants';
import { parsePricingDraftValue } from '../helpers';
import type { ProjectData, RoomLoadDraftState } from '../types';

type RoomFormState = Record<string, string | number | boolean>;

interface RoomsTabProps {
  project: ProjectData;
  allRooms: ProjectData['floors'][number]['rooms'];
  showAddRoom: boolean;
  setShowAddRoom: (value: boolean) => void;
  roomForm: RoomFormState;
  setRoomForm: React.Dispatch<React.SetStateAction<RoomFormState>>;
  numVal: (v: string | number | boolean) => number;
  strVal: (v: string | number | boolean) => string;
  computedAreaSqft: number;
  computedAreaSqm: number;
  computedWindowSqm: number;
  handleRoomNumChange: (field: string, raw: string) => void;
  handleRoomNumBlur: (field: string, fallback: number) => void;
  handleAddRoom: (e: React.FormEvent) => void;
  onDeleteRoom: (room: ProjectData['floors'][number]['rooms'][number]) => void;
  roomLoadDrafts: Record<string, RoomLoadDraftState>;
  roomLoadSavingId: string | null;
  handleRoomLoadDraftChange: (roomId: string, field: keyof RoomLoadDraftState, value: string) => void;
  handleRoomLoadSave: (room: ProjectData['floors'][number]['rooms'][number]) => void;
  handleRoomLoadUseSuggested: (room: ProjectData['floors'][number]['rooms'][number]) => void;
}

export function RoomsTab({
  project,
  allRooms,
  showAddRoom,
  setShowAddRoom,
  roomForm,
  setRoomForm,
  numVal,
  strVal,
  computedAreaSqft,
  computedAreaSqm,
  computedWindowSqm,
  handleRoomNumChange,
  handleRoomNumBlur,
  handleAddRoom,
  onDeleteRoom,
  roomLoadDrafts,
  roomLoadSavingId,
  handleRoomLoadDraftChange,
  handleRoomLoadSave,
  handleRoomLoadUseSuggested,
}: RoomsTabProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Rooms & Cooling Loads</h3>
        <Button variant="accent" size="md" onClick={() => setShowAddRoom(!showAddRoom)}>
          <Plus className="w-4 h-4 mr-1" /> Add Room
        </Button>
      </div>

      {/* Add Room Form */}
      {showAddRoom && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <Card className="panel-glass mb-4 border-border/70 bg-card shadow-sm">
            <CardHeader>
              <CardTitle>Add New Room</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddRoom} className="space-y-5">
                {/* Unit toggle */}
                <div className="flex items-center gap-4 border-b border-border pb-3">
                  <label className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Input Unit:</label>
                  <button
                    type="button"
                    onClick={() => setRoomForm({ ...roomForm, useFootInput: !roomForm.useFootInput })}
                    className={`rounded-sm border px-3.5 py-1.5 text-sm font-medium transition-colors ${roomForm.useFootInput ? 'border-accent/35 bg-accent text-accent-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
                  >
                    Feet (ft)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoomForm({ ...roomForm, useFootInput: !roomForm.useFootInput })}
                    className={`rounded-sm border px-3.5 py-1.5 text-sm font-medium transition-colors ${!roomForm.useFootInput ? 'border-accent/35 bg-accent text-accent-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
                  >
                    Meters (m)
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Input label="Room Name *" value={strVal(roomForm.name)} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
                  <Input label="Floor Number" type="number" min={1} max={200} unit="floors" value={numVal(roomForm.floorNumber) || ''} onChange={(e) => handleRoomNumChange('floorNumber', e.target.value)} onBlur={() => handleRoomNumBlur('floorNumber', 1)} />
                  <Select label="Space Type" value={strVal(roomForm.spaceType)} onChange={(e) => setRoomForm({ ...roomForm, spaceType: e.target.value })} options={SPACE_TYPES} />

                  {/* Measurements section */}
                  {roomForm.useFootInput ? (
                    <>
                      <Input label="Room Length (ft) *" type="number" step={0.1} min={0} max={1000} unit="ft" value={numVal(roomForm.lengthFt) || ''} onChange={(e) => handleRoomNumChange('lengthFt', e.target.value)} onBlur={() => handleRoomNumBlur('lengthFt', 0)} hint={numVal(roomForm.lengthFt) > 0 ? `= ${feetToMeters(numVal(roomForm.lengthFt)).toFixed(2)} m` : ''} />
                      <Input label="Room Width (ft) *" type="number" step={0.1} min={0} max={1000} unit="ft" value={numVal(roomForm.widthFt) || ''} onChange={(e) => handleRoomNumChange('widthFt', e.target.value)} onBlur={() => handleRoomNumBlur('widthFt', 0)} hint={numVal(roomForm.widthFt) > 0 ? `= ${feetToMeters(numVal(roomForm.widthFt)).toFixed(2)} m` : ''} />
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Area (auto)</label>
                        <div className="flex h-10 items-center rounded-sm border border-border bg-secondary/50 px-3.5 text-sm tabular-nums">
                          {computedAreaSqft > 0 ? (
                            <span>{computedAreaSqft.toFixed(1)} ft² <span className="text-muted-foreground">({computedAreaSqm.toFixed(1)} m²)</span></span>
                          ) : (
                            <span className="text-muted-foreground">Enter length × width</span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <Input label="Area (m²) *" type="number" step={0.1} min={0} max={100000} unit="m²" value={numVal(roomForm.area) || ''} onChange={(e) => handleRoomNumChange('area', e.target.value)} onBlur={() => handleRoomNumBlur('area', 0)} hint={numVal(roomForm.area) > 0 ? `= ${sqmToSqft(numVal(roomForm.area)).toFixed(1)} ft²` : ''} />
                  )}

                  <Input label="Ceiling Height (m)" type="number" step={0.1} min={2} max={8} unit="m" value={numVal(roomForm.ceilingHeight) || ''} onChange={(e) => handleRoomNumChange('ceilingHeight', e.target.value)} onBlur={() => handleRoomNumBlur('ceilingHeight', 2.7)} hint={`= ${metersToFeet(numVal(roomForm.ceilingHeight)).toFixed(1)} ft`} />
                  <Select label="Wall Construction" value={strVal(roomForm.wallConstruction)} onChange={(e) => setRoomForm({ ...roomForm, wallConstruction: e.target.value })} options={WALL_TYPES} />
                  <Select label="Glass Type" value={strVal(roomForm.windowType)} onChange={(e) => setRoomForm({ ...roomForm, windowType: e.target.value })} options={GLASS_TYPES} />

                  {/* Window measurements */}
                  {roomForm.useFootInput ? (
                    <>
                      <Input label="Window Qty" type="number" min={0} max={100} unit="pcs" value={numVal(roomForm.windowQty) || ''} onChange={(e) => handleRoomNumChange('windowQty', e.target.value)} onBlur={() => handleRoomNumBlur('windowQty', 0)} />
                      <Input label="Window Length (ft)" type="number" step={0.1} min={0} max={100} unit="ft" value={numVal(roomForm.windowLengthFt) || ''} onChange={(e) => handleRoomNumChange('windowLengthFt', e.target.value)} onBlur={() => handleRoomNumBlur('windowLengthFt', 0)} />
                      <Input label="Window Width (ft)" type="number" step={0.1} min={0} max={100} unit="ft" value={numVal(roomForm.windowWidthFt) || ''} onChange={(e) => handleRoomNumChange('windowWidthFt', e.target.value)} onBlur={() => handleRoomNumBlur('windowWidthFt', 0)} hint={computedWindowSqm > 0 ? `= ${computedWindowSqm.toFixed(2)} m²` : ''} />
                    </>
                  ) : (
                    <Input label="Window Area (m²)" type="number" step={0.1} min={0} max={10000} unit="m²" value={numVal(roomForm.windowArea) || ''} onChange={(e) => handleRoomNumChange('windowArea', e.target.value)} onBlur={() => handleRoomNumBlur('windowArea', 0)} hint={numVal(roomForm.windowArea) > 0 ? `= ${sqmToSqft(numVal(roomForm.windowArea)).toFixed(1)} ft²` : ''} />
                  )}

                  <Select label="Window Orientation" value={strVal(roomForm.windowOrientation)} onChange={(e) => setRoomForm({ ...roomForm, windowOrientation: e.target.value })} options={ORIENTATIONS} />
                  <Input label="Occupants" type="number" min={0} max={1000} unit="pax" value={numVal(roomForm.occupantCount) || ''} onChange={(e) => handleRoomNumChange('occupantCount', e.target.value)} onBlur={() => handleRoomNumBlur('occupantCount', 0)} />
                  <Input label="Lighting (W/m²)" type="number" step={0.1} min={5} max={60} unit="W/m²" value={numVal(roomForm.lightingDensity) || ''} onChange={(e) => handleRoomNumChange('lightingDensity', e.target.value)} onBlur={() => handleRoomNumBlur('lightingDensity', 15)} />
                  <Input label="Equipment Load (W)" type="number" step={1} min={0} max={50000} unit="W" value={numVal(roomForm.equipmentLoad) || ''} onChange={(e) => handleRoomNumChange('equipmentLoad', e.target.value)} onBlur={() => handleRoomNumBlur('equipmentLoad', 0)} />
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!roomForm.hasRoofExposure}
                        onChange={(e) => setRoomForm({ ...roomForm, hasRoofExposure: e.target.checked })}
                        className="rounded"
                      />
                      Top floor (roof exposure)
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => setShowAddRoom(false)}>Cancel</Button>
                  <Button type="submit" variant="accent"><Save className="w-4 h-4 mr-1" /> Add Room</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Room List */}
      {allRooms.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-12 h-12" />}
          title="No rooms yet"
          description="Add rooms to start calculating cooling loads"
          action={
            <Button variant="accent" size="sm" onClick={() => setShowAddRoom(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Room
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {project.floors.map((floor) => (
            <div key={floor.id} className="rounded-md border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <Building2 className="w-5 h-5 text-accent" />
                <h4 className="text-base font-bold text-foreground">
                  {floor.name}
                </h4>
                <Badge size="sm" variant="default">Floor {floor.floorNumber}</Badge>
                <span className="text-sm text-muted-foreground ml-auto">{floor.rooms.length} room{floor.rooms.length !== 1 ? 's' : ''}</span>
              </div>
              <motion.div variants={listContainerVariants} initial="hidden" animate="visible" className="space-y-4">
                {floor.rooms.map((room) => {
                  const roomLoadDraft = roomLoadDrafts[room.id] ?? EMPTY_ROOM_LOAD_DRAFT;
                  const roomTrParsed = parsePricingDraftValue(roomLoadDraft.tr);
                  const roomBtuParsed = parsePricingDraftValue(roomLoadDraft.btu);
                  const currentRoomTrOverride = room.coolingLoad?.userTrOverride ?? null;
                  const currentRoomBtuOverride = room.coolingLoad?.userBtuOverride ?? null;
                  const roomLoadHasInvalid = !roomTrParsed.valid || !roomBtuParsed.valid;
                  const roomLoadIsDirty =
                    roomTrParsed.value !== currentRoomTrOverride ||
                    roomBtuParsed.value !== currentRoomBtuOverride;
                  const roomLoadSaving = roomLoadSavingId === room.id;

                  return (
                  <motion.div key={room.id} variants={listItemVariants}>
                    <Card className="panel-glass border border-border/70 bg-card shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                              <h4 className="text-base font-semibold text-foreground">{room.name}</h4>
                              <Badge size="sm">{room.spaceType.replace(/_/g, ' ')}</Badge>
                              <button
                                onClick={() => onDeleteRoom(room)}
                                className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                                title="Delete room"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-sm">
                              <span className="text-muted-foreground">Area: <span className="text-foreground font-medium">{room.area} m² ({sqmToSqft(room.area).toFixed(0)} ft²)</span></span>
                              <span className="text-muted-foreground">Ceiling: <span className="text-foreground font-medium">{room.ceilingHeight}m ({metersToFeet(room.ceilingHeight).toFixed(1)} ft)</span></span>
                              <span className="text-muted-foreground">Occupants: <span className="text-foreground font-medium">{room.occupantCount}</span></span>
                              <span className="text-muted-foreground">Orientation: <span className="text-foreground font-medium">{room.windowOrientation}</span></span>
                            </div>
                          </div>
                          {room.coolingLoad && (
                            <div className="w-full shrink-0 text-right sm:w-auto">
                              <div className="flex gap-5">
                                <div className="rounded-sm border border-accent/30 bg-accent/12 px-3.5 py-2">
                                  <div className="flex items-center justify-end gap-2 mb-1">
                                    <Badge size="sm" variant={room.coolingLoad.isOverridden ? 'accent' : 'secondary'}>
                                      {room.coolingLoad.isOverridden ? 'Override' : 'Suggested'}
                                    </Badge>
                                  </div>
                                  <p className="text-lg font-bold text-accent">{room.coolingLoad.trValue} TR</p>
                                  <p className="text-sm text-muted-foreground">{(room.coolingLoad.btuPerHour || 0).toLocaleString()} BTU/h</p>
                                </div>
                                <div className="rounded-sm border border-border bg-secondary/50 px-3.5 py-2">
                                  <p className="text-base font-semibold">{room.coolingLoad.cfmSupply} CFM</p>
                                  <p className="text-sm text-muted-foreground">
                                    <TermHint
                                      term="Supply Air"
                                      definition="CFM is cubic feet per minute of airflow delivered to the room to offset sensible and latent heat."
                                      compact
                                    />
                                  </p>
                                </div>
                                <div className="rounded-sm border border-border bg-secondary/50 px-3.5 py-2">
                                  <p className="text-base font-semibold">{(room.coolingLoad.totalLoad / room.area).toFixed(0)} W/m²</p>
                                  <p className="text-sm text-muted-foreground">
                                    <TermHint
                                      term="Load Density"
                                      definition="Cooling load per floor area. Higher W/m² indicates heavier internal or envelope gains."
                                      compact
                                    />
                                  </p>
                                </div>
                              </div>

                              <div className="mt-2 grid w-full grid-cols-2 gap-2.5 sm:w-107.5">
                                <div className="rounded-sm border border-border bg-secondary/50 px-3.5 py-2 text-right">
                                  <p className="text-sm font-semibold tabular-nums">
                                    {Math.round(room.coolingLoad.totalSensibleLoad).toLocaleString()} W
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    <TermHint
                                      term="Sensible"
                                      definition="Sensible load changes dry-bulb temperature and is primarily handled by airflow and coil temperature difference."
                                      compact
                                    />
                                  </p>
                                </div>
                                <div className="rounded-sm border border-border bg-secondary/50 px-3.5 py-2 text-right">
                                  <p className="text-sm font-semibold tabular-nums">
                                    {Math.round(room.coolingLoad.totalLatentLoad).toLocaleString()} W
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    <TermHint
                                      term="Latent"
                                      definition="Latent load removes moisture from air and is linked to humidity control and dehumidification performance."
                                      compact
                                    />
                                  </p>
                                </div>
                              </div>

                              <div className="mt-2 grid w-full gap-2 sm:w-107.5">
                                <DualValueExplainer
                                  compact
                                  title="TR Decision"
                                  term="TR"
                                  definition="Tons of Refrigeration. 1 TR equals 12,000 BTU/h or about 3.517 kW of cooling capacity."
                                  suggested={`${(room.coolingLoad.suggestedTrValue ?? room.coolingLoad.trValue).toFixed(2)} TR`}
                                  override={
                                    room.coolingLoad.userTrOverride !== null && room.coolingLoad.userTrOverride !== undefined
                                      ? `${room.coolingLoad.userTrOverride.toFixed(2)} TR`
                                      : null
                                  }
                                  final={`${(room.coolingLoad.finalTrValue ?? room.coolingLoad.trValue).toFixed(2)} TR`}
                                  formula="Final TR = override TR when provided, otherwise suggested TR."
                                  note="Suggested TR is derived from envelope, people, lighting, equipment, and ventilation loads."
                                />
                                <DualValueExplainer
                                  compact
                                  title="BTU/h Decision"
                                  term="BTU/h"
                                  definition="British Thermal Units per hour, a cooling capacity rate used for HVAC equipment sizing."
                                  suggested={`${Math.round(room.coolingLoad.suggestedBtuPerHour ?? room.coolingLoad.btuPerHour).toLocaleString()} BTU/h`}
                                  override={
                                    room.coolingLoad.userBtuOverride !== null && room.coolingLoad.userBtuOverride !== undefined
                                      ? `${Math.round(room.coolingLoad.userBtuOverride).toLocaleString()} BTU/h`
                                      : null
                                  }
                                  final={`${Math.round(room.coolingLoad.finalBtuPerHour ?? room.coolingLoad.btuPerHour).toLocaleString()} BTU/h`}
                                  formula="Final BTU/h = override BTU/h when provided, otherwise suggested BTU/h."
                                  note="BTU/h is synchronized with TR override decisions for downstream equipment sizing."
                                />
                              </div>

                              <div className="w-full rounded-sm border border-border bg-card p-3.5 shadow-sm sm:w-90">
                                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Cooling Load Overrides</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">TR Override</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={roomLoadDraft.tr}
                                      onChange={(event) => handleRoomLoadDraftChange(room.id, 'tr', event.target.value)}
                                      placeholder={`Suggested ${(room.coolingLoad.suggestedTrValue ?? room.coolingLoad.trValue).toString()}`}
                                      className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-sm text-right"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">BTU/h Override</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step="1"
                                      value={roomLoadDraft.btu}
                                      onChange={(event) => handleRoomLoadDraftChange(room.id, 'btu', event.target.value)}
                                      placeholder={`Suggested ${Math.round(room.coolingLoad.suggestedBtuPerHour ?? room.coolingLoad.btuPerHour).toString()}`}
                                      className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-sm text-right"
                                    />
                                  </div>
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={roomLoadSaving || !room.coolingLoad.isOverridden}
                                    onClick={() => handleRoomLoadUseSuggested(room)}
                                  >
                                    Use Suggested
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    isLoading={roomLoadSaving}
                                    disabled={roomLoadSaving || roomLoadHasInvalid || !roomLoadIsDirty}
                                    onClick={() => handleRoomLoadSave(room)}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* AC Unit Recommendation — Carrier Psychrometric */}
                        {room.coolingLoad && room.coolingLoad.trValue > 0 && (() => {
                          const rec = psychrometricACRecommendation(
                            room.coolingLoad.totalLoad,
                            room.coolingLoad.trValue,
                            project.outdoorDB,
                            project.outdoorRH || 50,
                            project.indoorDB,
                            project.indoorRH
                          );

                          // Find matching catalog units — if TR is large, find the best single
                          // unit and show how many are needed to cover the load.
                          const maxCatalogTR = Math.max(...EQUIPMENT_CATALOG.map((e) => e.capacityTR));
                          const needsMultiple = rec.adjustedTR > maxCatalogTR;
                          const targetTR = needsMultiple ? maxCatalogTR : rec.adjustedTR;

                          let matchedUnits = EQUIPMENT_CATALOG
                            .filter((eq) => eq.capacityTR >= targetTR * 0.85 && eq.capacityTR <= targetTR * 1.5)
                            .sort((a, b) => Math.abs(a.capacityTR - targetTR) - Math.abs(b.capacityTR - targetTR))
                            .slice(0, 4);

                          // Fallback: if still no match, show the closest units by capacity
                          if (matchedUnits.length === 0) {
                            matchedUnits = [...EQUIPMENT_CATALOG]
                              .sort((a, b) => Math.abs(a.capacityTR - rec.adjustedTR) - Math.abs(b.capacityTR - rec.adjustedTR))
                              .slice(0, 4);
                          }

                          return (
                            <div className="mt-4 pt-4 border-t border-border">
                              <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                  AC Recommendation ({rec.recommendedType})
                                </span>
                                {rec.deratingFactor < 1 && (
                                  <Badge size="sm" variant="warning">
                                    Derated {((1 - rec.deratingFactor) * 100).toFixed(0)}%
                                  </Badge>
                                )}
                                <Badge size="sm" variant={
                                  rec.conditionsSeverity === 'extreme' ? 'warning' :
                                  rec.conditionsSeverity === 'hot' ? 'warning' : 'default'
                                }>
                                  {rec.conditionsSeverity}
                                </Badge>
                              </div>
                              <p className="mb-2 text-sm text-muted-foreground">
                                Need: {rec.adjustedTR} TR (adjusted) · Min EER: {rec.recommendedMinEER} · {rec.notes[rec.notes.length - 1]}
                              </p>
                              {matchedUnits.length > 0 && (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {matchedUnits.map((unit, idx) => {
                                    const qty = needsMultiple ? Math.ceil(rec.adjustedTR / unit.capacityTR) : 1;
                                    return (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between gap-2 rounded border border-border bg-secondary/50 px-3 py-2 text-sm"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium">{unit.manufacturer}</span>
                                          <span className="text-muted-foreground ml-1">{unit.model}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-right shrink-0">
                                          <span className="tabular-nums font-medium">{unit.capacityTR} TR</span>
                                          {qty > 1 && <span className="tabular-nums text-accent font-semibold">×{qty}</span>}
                                          <span className="tabular-nums text-muted-foreground">EER {unit.eer}</span>
                                          <span className="tabular-nums text-muted-foreground">{formatPHP(unit.unitPricePHP * qty)}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  </motion.div>
                  );
                })}
              </motion.div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
