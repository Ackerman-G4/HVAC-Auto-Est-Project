'use client';

import { use } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Thermometer,
  Calculator,
  Package,
  FileText,
  MapPin,
  Building2,
  Trash2,
  Save,
  Zap,
  Box,
  Download,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { showToast } from '@/components/ui/toast';
import { DualValueExplainer } from '@/components/ui/dual-value-explainer';
import { WorkflowRail, deriveWorkflowStages } from '@/components/ui/workflow-rail';
import { TermHint } from '@/components/ui/term-hint';
import { listContainerVariants, listItemVariants } from '@/animations/list-variants';
import { formatPHP } from '@/lib/utils/format-currency';
import { feetToMeters, metersToFeet, sqmToSqft } from '@/lib/utils/unit-conversion';
import { psychrometricState, psychrometricACRecommendation } from '@/lib/functions/psychrometric';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import Link from 'next/link';
import { authFetch } from '@/lib/api-client';
import {
  SPACE_TYPES,
  WALL_TYPES,
  GLASS_TYPES,
  ORIENTATIONS,
  EMPTY_ROOM_LOAD_DRAFT,
} from '@/features/project-detail/constants';
import { parsePricingDraftValue } from '@/features/project-detail/helpers';
import { useProjectDetail } from '@/features/project-detail/useProjectDetail';
import { PsychrometricMetricGrid } from '@/features/project-detail/components/PsychrometricMetricGrid';
import { ExportTab } from '@/features/project-detail/components/ExportTab';
import { EquipmentTab } from '@/features/project-detail/components/EquipmentTab';
import { ThreeDTab } from '@/features/project-detail/components/ThreeDTab';
import type { WorkflowStageId } from '@/components/ui/workflow-rail';

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const {
    project,
    loading,
    calculating,
    autoSizing,
    generatingBOQ,
    showAddRoom,
    setShowAddRoom,
    activeTab,
    setActiveTab,
    boqDraftPrices,
    boqSavingItemId,
    boqVerification,
    pricingDraft,
    pricingSaving,
    roomLoadDrafts,
    roomLoadSavingId,
    equipmentDrafts,
    equipmentSavingId,
    snapshotSavedAt,
    roomForm,
    setRoomForm,
    numVal,
    strVal,
    handleRoomNumChange,
    handleRoomNumBlur,
    computedAreaSqft,
    computedAreaSqm,
    computedWindowSqm,
    fetchProject,
    saveLocalSnapshot,
    restoreLocalSnapshot,
    clearLocalSnapshot,
    handleAddRoom,
    runCalculation,
    autoSizeEquipment,
    generateBOQ,
    handleBoqDraftChange,
    handleBoqItemSave,
    handleBoqUseSuggested,
    handlePricingDraftChange,
    handlePricingResetDraft,
    handlePricingSave,
    handleRoomLoadDraftChange,
    handleRoomLoadSave,
    handleRoomLoadUseSuggested,
    handleEquipmentDraftChange,
    handleEquipmentSave,
    handleEquipmentUseSuggested,
  } = useProjectDetail(id);

  if (loading) {
    return (
      <PageWrapper>
        <Skeleton className="h-10 w-64 mb-4" />
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </PageWrapper>
    );
  }

  if (!project) {
    return (
      <PageWrapper>
        <EmptyState
          icon={<Building2 className="w-12 h-12" />}
          title="Project not found"
          description="This project may have been deleted."
          action={<Link href="/projects"><Button variant="accent">Back to Projects</Button></Link>}
        />
      </PageWrapper>
    );
  }

  const allRooms = project.floors.flatMap((f) => f.rooms);
  const totalTR = allRooms.reduce((sum, r) => sum + (r.coolingLoad?.trValue || 0), 0);
  const totalArea = allRooms.reduce((sum, r) => sum + r.area, 0);
  const equipmentCost = project.selectedEquipment.reduce((sum, e) => sum + e.totalPrice, 0);
  const boqTotal = project.boqItems.reduce((sum, b) => sum + b.totalPrice, 0);

  const boqVerified =
    boqVerification?.status === 'verified' && !project.isBoqStale && project.boqItems.length > 0;
  const boqTampered = boqVerification?.status === 'tampered';
  const exportEnabled = boqVerified;

  const pricingParsed = {
    laborMultiplier: parsePricingDraftValue(pricingDraft.laborMultiplier),
    overheadPercent: parsePricingDraftValue(pricingDraft.overheadPercent),
    contingencyPercent: parsePricingDraftValue(pricingDraft.contingencyPercent),
    vatRate: parsePricingDraftValue(pricingDraft.vatRate),
  };

  const currentOverrides = {
    laborMultiplier: project.laborMultiplierOverride ?? null,
    overheadPercent: project.overheadPercentOverride ?? null,
    contingencyPercent: project.contingencyPercentOverride ?? null,
    vatRate: project.vatRateOverride ?? null,
  };

  const pricingHasInvalidInput =
    !pricingParsed.laborMultiplier.valid ||
    !pricingParsed.overheadPercent.valid ||
    !pricingParsed.contingencyPercent.valid ||
    !pricingParsed.vatRate.valid;

  const pricingHasChanges =
    pricingParsed.laborMultiplier.value !== currentOverrides.laborMultiplier ||
    pricingParsed.overheadPercent.value !== currentOverrides.overheadPercent ||
    pricingParsed.contingencyPercent.value !== currentOverrides.contingencyPercent ||
    pricingParsed.vatRate.value !== currentOverrides.vatRate;

  const pricingFinal = {
    laborMultiplier: project.pricingPolicy?.laborMultiplier ?? project.suggestedLaborMultiplier ?? 1,
    overheadPercent: project.pricingPolicy?.overheadPercent ?? project.suggestedOverheadPercent ?? 12,
    contingencyPercent: project.pricingPolicy?.contingencyPercent ?? project.suggestedContingencyPercent ?? 8,
    vatRate: project.pricingPolicy?.vatRate ?? project.suggestedVatRate ?? 12,
  };

  const tabs = [
    { id: 'rooms', label: 'Rooms & Loads', icon: <Thermometer className="w-4 h-4" /> },
    { id: '3d', label: '3D View', icon: <Box className="w-4 h-4" /> },
    { id: 'equipment', label: 'Equipment', icon: <Package className="w-4 h-4" /> },
    { id: 'boq', label: 'BOQ', icon: <FileText className="w-4 h-4" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
  ];

  // Workflow rail (overhaul-v3 §4.2): derive pipeline status from data this
  // page already computes. `isBoqStale` maps straight onto the stale badge.
  const workflowStages = deriveWorkflowStages({
    roomCount: allRooms.length,
    loadsCalculated: allRooms.some((r) => Boolean(r.coolingLoad)),
    equipmentSelected: project.selectedEquipment.length > 0,
    ductsSized: project.boqItems.some((b) => b.section.toLowerCase().includes('duct')),
    boqItemCount: project.boqItems.length,
    quotationGenerated: boqVerified,
    reportsGenerated: false,
    staleStages: project.isBoqStale ? ['boq', 'quotation'] : undefined,
  });

  // Reflect the active tab on the workflow rail instead of a hardcoded stage.
  const TAB_TO_STAGE: Record<string, WorkflowStageId> = {
    rooms: 'loads',
    '3d': 'floorplan',
    equipment: 'equipment',
    boq: 'boq',
    export: 'reports',
  };
  const activeStage = TAB_TO_STAGE[activeTab] ?? 'boq';

  return (
    <PageWrapper>
      <PageHeader
        title={project.name}
        description={`${project.clientName || 'No client'} · ${project.buildingType} · ${project.city}`}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project.name },
        ]}
        actions={
          <div className="panel-glass flex flex-wrap gap-2.5 rounded-xl border border-border/70 bg-card p-2">
            <Button variant="secondary" size="md" onClick={runCalculation} isLoading={calculating}>
              <Calculator className="w-4 h-4 mr-1" /> Calculate
            </Button>
            <Button variant="secondary" size="md" onClick={autoSizeEquipment} isLoading={autoSizing}>
              <Zap className="w-4 h-4 mr-1" /> Auto-Size
            </Button>
            <Button variant="accent" size="md" onClick={generateBOQ} isLoading={generatingBOQ}>
              <FileText className="w-4 h-4 mr-1" /> Generate BOQ
            </Button>
          </div>
        }
      />

      {/* Workflow rail — the golden path, always visible */}
      <WorkflowRail
        projectId={id}
        stages={workflowStages}
        activeStage={activeStage}
        className="mb-6"
      />

      {/* Stats */}
      <div className="mb-7 grid grid-cols-2 gap-5 sm:grid-cols-5">
        <StatCard title="Rooms" value={allRooms.length} icon={MapPin} />
        <StatCard title="Total TR" value={totalTR.toFixed(1)} icon={Thermometer} />
        <StatCard title="Total Area" value={`${totalArea.toFixed(0)} m²`} icon={Building2} />
        <StatCard title="Equipment" value={formatPHP(equipmentCost)} icon={Package} />
        <StatCard title="BOQ Total" value={formatPHP(boqTotal)} icon={FileText} />
      </div>

      {/* Psychrometric Conditions Panel — Carrier Chart */}
      {(() => {
        const outdoorPS = psychrometricState(project.outdoorDB, project.outdoorRH || 50);
        const indoorPS = psychrometricState(project.indoorDB, project.indoorRH);
        return (
          <Card className="panel-glass mb-6 border-border/70 bg-accent/5 shadow-sm">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-accent" />
                <h3 className="text-base font-semibold">Carrier Psychrometric Chart — Design Conditions</h3>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Outdoor */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Outdoor Air</p>
                  <PsychrometricMetricGrid state={outdoorPS} toneClassName="bg-[rgba(219,142,47,0.14)]" />
                </div>
                {/* Indoor */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Indoor Air (Design)</p>
                  <PsychrometricMetricGrid state={indoorPS} toneClassName="bg-[rgba(15,139,141,0.14)]" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
      <div className="mt-5 space-y-5">
        {/* Rooms & Loads Tab */}
        {activeTab === 'rooms' && (
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
                          className={`rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors ${roomForm.useFootInput ? 'border-accent/35 bg-accent text-accent-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
                        >
                          Feet (ft)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoomForm({ ...roomForm, useFootInput: !roomForm.useFootInput })}
                          className={`rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors ${!roomForm.useFootInput ? 'border-accent/35 bg-accent text-accent-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
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
                              <div className="flex h-10 items-center rounded-lg border border-border bg-secondary/50 px-3.5 text-sm tabular-nums">
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
                  <div key={floor.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
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
                                      onClick={async () => {
                                        if (!confirm(`Delete room "${room.name}"?`)) return;
                                        try {
                                          const res = await authFetch(`/api/projects/${id}/rooms/${room.id}`, { method: 'DELETE' });
                                          if (res.ok) {
                                            showToast('success', `Room "${room.name}" deleted`);
                                            fetchProject();
                                          } else {
                                            showToast('error', 'Failed to delete room');
                                          }
                                        } catch {
                                          showToast('error', 'Failed to delete room');
                                        }
                                      }}
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
                                      <div className="rounded-lg border border-accent/30 bg-accent/12 px-3.5 py-2">
                                        <div className="flex items-center justify-end gap-2 mb-1">
                                          <Badge size="sm" variant={room.coolingLoad.isOverridden ? 'accent' : 'secondary'}>
                                            {room.coolingLoad.isOverridden ? 'Override' : 'Suggested'}
                                          </Badge>
                                        </div>
                                        <p className="text-lg font-bold text-accent">{room.coolingLoad.trValue} TR</p>
                                        <p className="text-sm text-muted-foreground">{(room.coolingLoad.btuPerHour || 0).toLocaleString()} BTU/h</p>
                                      </div>
                                      <div className="rounded-lg border border-border bg-secondary/50 px-3.5 py-2">
                                        <p className="text-base font-semibold">{room.coolingLoad.cfmSupply} CFM</p>
                                        <p className="text-sm text-muted-foreground">
                                          <TermHint
                                            term="Supply Air"
                                            definition="CFM is cubic feet per minute of airflow delivered to the room to offset sensible and latent heat."
                                            compact
                                          />
                                        </p>
                                      </div>
                                      <div className="rounded-lg border border-border bg-secondary/50 px-3.5 py-2">
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
                                      <div className="rounded-lg border border-border bg-secondary/50 px-3.5 py-2 text-right">
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
                                      <div className="rounded-lg border border-border bg-secondary/50 px-3.5 py-2 text-right">
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

                                    <div className="w-full rounded-lg border border-border bg-card p-3.5 shadow-sm sm:w-90">
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
                                            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-right"
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
                                            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-right"
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
        )}

        {/* 3D Visualization Tab */}
        <ThreeDTab project={project} active={activeTab === '3d'} />

        {/* Equipment Tab */}
        {activeTab === 'equipment' && (
          <EquipmentTab
            project={project}
            equipmentDrafts={equipmentDrafts}
            equipmentSavingId={equipmentSavingId}
            autoSizing={autoSizing}
            equipmentCost={equipmentCost}
            autoSizeEquipment={autoSizeEquipment}
            handleEquipmentDraftChange={handleEquipmentDraftChange}
            handleEquipmentSave={handleEquipmentSave}
            handleEquipmentUseSuggested={handleEquipmentUseSuggested}
          />
        )}


        {/* BOQ Tab */}
        {activeTab === 'boq' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Bill of Quantities</h3>

              <div className="flex items-center gap-2">
                {boqTampered ? (
                  <Badge variant="destructive" size="sm">
                    <AlertTriangle className="mr-1 h-3 w-3" /> Integrity check failed
                  </Badge>
                ) : boqVerified ? (
                  <Badge
                    variant="success"
                    size="sm"
                    title={boqVerification?.lockedAt ? `Locked ${new Date(boqVerification.lockedAt).toLocaleString()}` : undefined}
                  >
                    <ShieldCheck className="mr-1 h-3 w-3" /> Verified
                  </Badge>
                ) : boqVerification?.status === 'empty' || project.boqItems.length === 0 ? (
                  <Badge variant="outline" size="sm">No BOQ yet</Badge>
                ) : (
                  <Badge variant="warning" size="sm">Outdated — recalculate</Badge>
                )}
              </div>
            </div>

            <Card className="panel-glass mb-4 border border-border/70 bg-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pricing Policy Overrides</CardTitle>
                <CardDescription>
                  Suggested values are system defaults. Enter an override to force a final value, or leave blank to use suggested.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-secondary/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Labor Multiplier</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedLaborMultiplier ?? 1}</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.laborMultiplier}
                    onChange={(event) => handlePricingDraftChange('laborMultiplier', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.laborMultiplier}</p>
                </div>

                <div className="rounded-lg border border-border bg-secondary/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Overhead %</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedOverheadPercent ?? 12}%</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.overheadPercent}
                    onChange={(event) => handlePricingDraftChange('overheadPercent', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.overheadPercent}%</p>
                </div>

                <div className="rounded-lg border border-border bg-secondary/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Contingency %</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedContingencyPercent ?? 8}%</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.contingencyPercent}
                    onChange={(event) => handlePricingDraftChange('contingencyPercent', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.contingencyPercent}%</p>
                </div>

                <div className="rounded-lg border border-border bg-secondary/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">VAT %</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedVatRate ?? 12}%</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.vatRate}
                    onChange={(event) => handlePricingDraftChange('vatRate', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.vatRate}%</p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={pricingSaving} onClick={handlePricingResetDraft}>
                  Use Suggested Values
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  isLoading={pricingSaving}
                  disabled={pricingSaving || pricingHasInvalidInput || !pricingHasChanges}
                  onClick={handlePricingSave}
                >
                  Save Pricing Overrides
                </Button>
              </CardFooter>
            </Card>

            {project.boqItems.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="No BOQ generated"
                description="Select equipment first, then generate the Bill of Quantities"
                action={
                  <Button variant="accent" size="sm" onClick={generateBOQ} isLoading={generatingBOQ}>
                    {project.isBoqStale ? 'Regenerate BOQ' : 'Generate BOQ'}
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Section</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit Price</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.boqItems.map((item) => {
                      const draftValue = boqDraftPrices[item.id] ?? String(item.unitPrice);
                      const parsedDraft = parseFloat(draftValue);
                      const isDirty = Number.isFinite(parsedDraft) && Math.abs(parsedDraft - item.unitPrice) > 0.0001;
                      const isSaving = boqSavingItemId === item.id;
                      const suggestedUnitPrice = item.suggestedUnitPrice ?? item.unitPrice;
                      const finalUnitPrice = item.finalUnitPrice ?? item.unitPrice;
                      const suggestedTotalPrice = item.suggestedTotalPrice ?? suggestedUnitPrice * item.quantity;
                      const finalTotalPrice = item.finalTotalPrice ?? item.totalPrice;

                      return [
                        <tr key={`${item.id}-main`} className="border-b border-border">
                          <td className="px-4 py-2.5 text-sm text-muted-foreground">{item.section}</td>
                          <td className="px-4 py-2.5">{item.description}</td>
                          <td className="px-4 py-2.5">
                            <Badge
                              size="sm"
                              variant={item.isOverridden ? 'accent' : 'secondary'}
                            >
                              {item.isOverridden ? 'Override' : 'Suggested'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right">{item.unit}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={draftValue}
                                onChange={(event) => handleBoqDraftChange(item.id, event.target.value)}
                                aria-label="Unit price"
                                className="w-28 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm"
                              />
                            </div>
                            {item.suggestedUnitPrice !== undefined && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Suggested: {formatPHP(item.suggestedUnitPrice)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">{formatPHP(item.totalPrice)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isSaving || !isDirty}
                                isLoading={isSaving}
                                onClick={() => handleBoqItemSave(item)}
                              >
                                Save
                              </Button>
                              {item.isOverridden && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isSaving}
                                  onClick={() => handleBoqUseSuggested(item)}
                                >
                                  Use Suggested
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>,
                        <tr key={`${item.id}-explain`} className="border-b border-border bg-secondary/20">
                          <td colSpan={8} className="px-4 pb-3 pt-2">
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                              <DualValueExplainer
                                compact
                                title="Unit Price Decision"
                                suggested={formatPHP(suggestedUnitPrice)}
                                override={
                                  item.userUnitPriceOverride !== null && item.userUnitPriceOverride !== undefined
                                    ? formatPHP(item.userUnitPriceOverride)
                                    : null
                                }
                                final={formatPHP(finalUnitPrice)}
                                formula="Final unit price = override when provided, otherwise suggested unit price."
                              />
                              <DualValueExplainer
                                compact
                                title="Total Price Decision"
                                suggested={formatPHP(suggestedTotalPrice)}
                                override={
                                  item.userTotalPriceOverride !== null && item.userTotalPriceOverride !== undefined
                                    ? formatPHP(item.userTotalPriceOverride)
                                    : null
                                }
                                final={formatPHP(finalTotalPrice)}
                                formula="Final total price is quantity × final unit price; override fields track source state."
                              />
                            </div>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-lg">
                      <td colSpan={7} className="px-4 py-3 text-right">Grand Total:</td>
                      <td className="px-4 py-3 text-right">{formatPHP(boqTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <ExportTab
            project={project}
            snapshotSavedAt={snapshotSavedAt}
            exportEnabled={exportEnabled}
            boqTampered={boqTampered}
            onSaveSnapshot={() => saveLocalSnapshot(true)}
            onRestoreSnapshot={restoreLocalSnapshot}
            onClearSnapshot={clearLocalSnapshot}
          />
        )}
      </div>
      </Tabs>
    </PageWrapper>
  );
}


