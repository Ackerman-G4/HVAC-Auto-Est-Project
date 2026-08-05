'use client';

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Wind, Thermometer, Play, ShieldCheck, AlertTriangle, Zap, TrendingUp, Server, AirVent, RotateCcw, Settings2, BarChart3, Box, Activity, Layers, Crosshair, Download,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useSimulationViewer } from '@/features/simulation/viewer/useSimulationViewer';
import { SimulationTabContent } from '@/features/simulation/viewer/components/SimulationTabContent';
import { ThreeDTabContent } from '@/features/simulation/viewer/components/ThreeDTabContent';
import { TileFlowTabContent } from '@/features/simulation/viewer/components/TileFlowTabContent';
import { EquipmentPanel } from '@/features/simulation/viewer/components/EquipmentPanel';
import { ConfigPanel } from '@/features/simulation/viewer/components/ConfigPanel';
import { ResultsPanel } from '@/features/simulation/viewer/components/ResultsPanel';
import { FailurePanel } from '@/features/simulation/viewer/components/FailurePanel';
import { ProjectDropdown } from '@/features/simulation/viewer/components/ProjectDropdown';

const CalibrationPanel = dynamic(
  () => import('@/components/building/CalibrationPanel').then(mod => mod.default),
  { ssr: false, loading: () => <div className="panel-glass flex h-64 items-center justify-center rounded-md border border-border/70 bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading calibration...</div> }
);

// ─── Main Page ──────────────────────────────────────────────────────

export default function SimulationPage() {
  const {
    simError,
    projectList,
    loadingProjects,
    activeTab,
    setActiveTab,
    selectedHVACId,
    setSelectedHVACId,
    layoutSaveState,
    tileFlowViewerRef,
    racks,
    hvacUnits,
    isRunning,
    result,
    runSimulation,
    runCompliance,
    runPUE,
    runOptimization,
    activeView,
    showHotspots,
    showAirflow,
    selectedSliceZ,
    setActiveView,
    setShowHotspots,
    setShowAirflow,
    setSelectedSliceZ,
    setConfig,
    setMode,
    config,
    inspectedCell,
    setInspectedCell,
    tileFlowView,
    setTileFlowView,
    alerts,
    tileAirflowData,
    selectedProjectId,
    setSelectedProjectId,
    detectedFloors,
    setDetectedFloors,
    selectedFloorId,
    setSelectedFloorId,
    isDetecting,
    viewerRoomBoundaries,
    handleHVACDragPreview,
    handleHVACDragCommit,
    handleHVACDragInvalid,
    layoutSaveStatusText,
    handleAutoDetect,
    totalHeatKW,
    totalCoolingKW,
    canEditHVACIn3D,
    reportExporting,
    handleExportReport,
  } = useSimulationViewer();

  const tabs = [
    { id: 'equipment', label: 'Equipment', icon: <Server size={16} />, badge: racks.length + hvacUnits.length },
    { id: 'config', label: 'Configuration', icon: <Settings2 size={16} /> },
    { id: 'simulation', label: 'Simulation', icon: <Activity size={16} /> },
    { id: '3d', label: '3D Airflow', icon: <Box size={16} /> },
    { id: 'results', label: 'Results & Analysis', icon: <BarChart3 size={16} /> },
    { id: 'tileflow', label: 'TileFlow Analysis', icon: <Layers size={16} /> },
    { id: 'failure', label: 'Failure Simulation', icon: <AlertTriangle size={16} /> },
    { id: 'calibration', label: 'Calibration', icon: <Crosshair size={16} /> },
  ];

  return (
    <PageWrapper>
      {simError && (
        <div className="mx-auto mb-6 mt-6 max-w-4xl rounded-md border border-red-500/25 bg-red-500/8 p-4 text-sm font-semibold text-destructive">
          {simError}
        </div>
      )}
      <PageHeader
        title="CFD Simulation"
        description="Airflow simulation, thermal analysis, and cooling optimization"
        actions={
          <div className="panel-glass flex flex-wrap items-center gap-2.5 rounded-md border border-border/70 bg-card p-2 shadow-sm">
            <button
              onClick={() => { runPUE(); }}
              disabled={racks.length === 0}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              <Zap size={16} /> PUE
            </button>
            <button
              onClick={() => { runCompliance(); }}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
            >
              <ShieldCheck size={16} /> Compliance
            </button>
            <button
              onClick={() => { runOptimization(); }}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              <TrendingUp size={16} /> Optimize
            </button>
            {/* Engineering report export — carried over from the retired
                /simulation/workspace view. */}
            {(['pdf', 'csv', 'json'] as const).map((format) => (
              <button
                key={format}
                onClick={() => { void handleExportReport(format); }}
                disabled={!result || reportExporting !== null}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
              >
                <Download size={16} />
                {reportExporting === format ? 'Exporting…' : format.toUpperCase()}
              </button>
            ))}
            <button
              onClick={() => runSimulation(selectedProjectId || '', selectedFloorId || '')}
              disabled={racks.length === 0 || isRunning}
              className="flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-md transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {isRunning ? <><RotateCcw size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run Simulation</>}
            </button>
          </div>
        }
      />

      <div className="panel-glass mb-6 rounded-md border border-border/70 bg-primary/5 px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Simulation Command Deck</p>
            <p className="mt-0.5 text-sm text-foreground">
              Configure thermal model inputs, run airflow scenarios, and evaluate compliance and energy outcomes.
            </p>
          </div>
          <div className="rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground tabular-nums">
            {racks.length} racks · {hvacUnits.length} HVAC units · {result ? 'Result ready' : 'Awaiting run'}
          </div>
        </div>
      </div>

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
          className="mb-8 flex items-center gap-3 rounded-md border border-red-500/25 bg-red-500/8 p-4 shadow-sm"
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
            roomBoundaries={viewerRoomBoundaries}
            onFloorChange={setSelectedFloorId}
            onAutoDetect={handleAutoDetect}
            isDetecting={isDetecting}
          />
        </TabPanel>
        <TabPanel tabId="config" activeTab={activeTab}>
          <ConfigPanel />
        </TabPanel>
        <TabPanel tabId="simulation" activeTab={activeTab}>
          <SimulationTabContent
            racks={racks}
            isRunning={isRunning}
            result={result}
            runSimulation={runSimulation}
            setConfig={setConfig}
            setMode={setMode}
            config={config}
            selectedProjectId={selectedProjectId}
            selectedFloorId={selectedFloorId}
          />
        </TabPanel>
        <TabPanel tabId="3d" activeTab={activeTab}>
          <ThreeDTabContent
            selectedHVACId={selectedHVACId}
            setSelectedHVACId={setSelectedHVACId}
            layoutSaveState={layoutSaveState}
            racks={racks}
            hvacUnits={hvacUnits}
            result={result}
            activeView={activeView}
            showHotspots={showHotspots}
            selectedSliceZ={selectedSliceZ}
            setActiveView={setActiveView}
            setShowHotspots={setShowHotspots}
            showAirflow={showAirflow}
          setShowAirflow={setShowAirflow}
            setSelectedSliceZ={setSelectedSliceZ}
            inspectedCell={inspectedCell}
            setInspectedCell={setInspectedCell}
            viewerRoomBoundaries={viewerRoomBoundaries}
            handleHVACDragPreview={handleHVACDragPreview}
            handleHVACDragCommit={handleHVACDragCommit}
            handleHVACDragInvalid={handleHVACDragInvalid}
            layoutSaveStatusText={layoutSaveStatusText}
            canEditHVACIn3D={canEditHVACIn3D}
          />
        </TabPanel>
        <TabPanel tabId="results" activeTab={activeTab}>
          <ResultsPanel />
        </TabPanel>
        <TabPanel tabId="tileflow" activeTab={activeTab}>
          <TileFlowTabContent
            tileFlowViewerRef={tileFlowViewerRef}
            racks={racks}
            hvacUnits={hvacUnits}
            result={result}
            activeView={activeView}
            showHotspots={showHotspots}
            selectedSliceZ={selectedSliceZ}
            setInspectedCell={setInspectedCell}
            tileFlowView={tileFlowView}
            setTileFlowView={setTileFlowView}
            alerts={alerts}
            tileAirflowData={tileAirflowData}
            viewerRoomBoundaries={viewerRoomBoundaries}
          />
        </TabPanel>
        <TabPanel tabId="failure" activeTab={activeTab}>
          <FailurePanel />
        </TabPanel>
        <TabPanel tabId="calibration" activeTab={activeTab}>
          <CalibrationPanel />
        </TabPanel>
      </Tabs>
    </PageWrapper>
  );
}
