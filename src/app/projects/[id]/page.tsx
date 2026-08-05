'use client';

import { use } from 'react';
import {
  Thermometer,
  Calculator,
  Package,
  FileText,
  MapPin,
  Building2,
  Zap,
  Box,
  Download,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { AutosaveIndicator } from '@/components/ui/autosave-indicator';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { WorkflowRail, deriveWorkflowStages } from '@/components/ui/workflow-rail';
import { formatPHP } from '@/lib/utils/format-currency';
import { psychrometricState } from '@/lib/functions/psychrometric';
import Link from 'next/link';
import { parsePricingDraftValue } from '@/features/project-detail/helpers';
import { useProjectDetail } from '@/features/project-detail/useProjectDetail';
import { PsychrometricMetricGrid } from '@/features/project-detail/components/PsychrometricMetricGrid';
import { ExportTab } from '@/features/project-detail/components/ExportTab';
import { EquipmentTab } from '@/features/project-detail/components/EquipmentTab';
import { ThreeDTab } from '@/features/project-detail/components/ThreeDTab';
import { BoqTab } from '@/features/project-detail/components/BoqTab';
import { RoomsTab } from '@/features/project-detail/components/RoomsTab';
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
    snapshotStatus,
    roomForm,
    setRoomForm,
    numVal,
    strVal,
    handleRoomNumChange,
    handleRoomNumBlur,
    computedAreaSqft,
    computedAreaSqm,
    computedWindowSqm,
    saveLocalSnapshot,
    restoreLocalSnapshot,
    clearLocalSnapshot,
    handleAddRoom,
    handleDeleteRoom,
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
          <div className="flex flex-wrap items-center gap-3">
            <AutosaveIndicator status={snapshotStatus} savedAt={snapshotSavedAt} />
            <div className="panel-glass flex flex-wrap gap-2.5 rounded-md border border-border/70 bg-card p-2">
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
          <RoomsTab
            project={project}
            allRooms={allRooms}
            showAddRoom={showAddRoom}
            setShowAddRoom={setShowAddRoom}
            roomForm={roomForm}
            setRoomForm={setRoomForm}
            numVal={numVal}
            strVal={strVal}
            computedAreaSqft={computedAreaSqft}
            computedAreaSqm={computedAreaSqm}
            computedWindowSqm={computedWindowSqm}
            handleRoomNumChange={handleRoomNumChange}
            handleRoomNumBlur={handleRoomNumBlur}
            handleAddRoom={handleAddRoom}
            onDeleteRoom={handleDeleteRoom}
            roomLoadDrafts={roomLoadDrafts}
            roomLoadSavingId={roomLoadSavingId}
            handleRoomLoadDraftChange={handleRoomLoadDraftChange}
            handleRoomLoadSave={handleRoomLoadSave}
            handleRoomLoadUseSuggested={handleRoomLoadUseSuggested}
          />
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
          <BoqTab
            project={project}
            boqVerification={boqVerification}
            boqVerified={boqVerified}
            boqTampered={boqTampered}
            boqTotal={boqTotal}
            boqDraftPrices={boqDraftPrices}
            boqSavingItemId={boqSavingItemId}
            generatingBOQ={generatingBOQ}
            pricingDraft={pricingDraft}
            pricingFinal={pricingFinal}
            pricingSaving={pricingSaving}
            pricingHasInvalidInput={pricingHasInvalidInput}
            pricingHasChanges={pricingHasChanges}
            handlePricingDraftChange={handlePricingDraftChange}
            handlePricingResetDraft={handlePricingResetDraft}
            handlePricingSave={handlePricingSave}
            generateBOQ={generateBOQ}
            handleBoqDraftChange={handleBoqDraftChange}
            handleBoqItemSave={handleBoqItemSave}
            handleBoqUseSuggested={handleBoqUseSuggested}
          />
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


