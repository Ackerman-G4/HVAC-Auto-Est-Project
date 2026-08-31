'use client';

import type { useSimulationViewer } from '../useSimulationViewer';
import dynamic from 'next/dynamic';
import { Box } from 'lucide-react';
import { useId } from 'react';
const AirflowViewer3D = dynamic(() => import('@/components/building/AirflowViewer3D').then(m => m.default), { ssr: false, loading: () => <div className="panel-glass flex h-125 items-center justify-center rounded-md border border-border/70 bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading 3D viewer...</div> });

type ThreeDTabContentProps = Pick<
  ReturnType<typeof useSimulationViewer>,
  | 'selectedHVACId'
  | 'setSelectedHVACId'
  | 'layoutSaveState'
  | 'racks'
  | 'hvacUnits'
  | 'result'
  | 'activeView'
  | 'showHotspots'
  | 'selectedSliceZ'
  | 'setActiveView'
  | 'setShowHotspots'
  | 'showAirflow'
  | 'setShowAirflow'
  | 'setSelectedSliceZ'
  | 'inspectedCell'
  | 'setInspectedCell'
  | 'viewerRoomBoundaries'
  | 'handleHVACDragPreview'
  | 'handleHVACDragCommit'
  | 'handleHVACDragInvalid'
  | 'layoutSaveStatusText'
  | 'canEditHVACIn3D'
>;

export function ThreeDTabContent({
  selectedHVACId,
  setSelectedHVACId,
  layoutSaveState,
  racks,
  hvacUnits,
  result,
  activeView,
  showHotspots,
  selectedSliceZ,
  setActiveView,
  setShowHotspots,
  showAirflow,
  setShowAirflow,
  setSelectedSliceZ,
  inspectedCell,
  setInspectedCell,
  viewerRoomBoundaries,
  handleHVACDragPreview,
  handleHVACDragCommit,
  handleHVACDragInvalid,
  layoutSaveStatusText,
  canEditHVACIn3D,
}: ThreeDTabContentProps) {
  // useId, not a literal: a duplicated id points every label at the first control.
  const sliceZId = useId();

  return (
    <>
          {result ? (
            <>
              <div className="panel-glass mb-4 rounded-md border border-border/70 bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[11px] font-semibold font-display text-muted-foreground">
                    View Mode
                  </span>
                  {(['temperature', 'velocity', 'pressure', 'humidity'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setActiveView(mode)}
                      className={`rounded-sm border px-3 py-2 text-sm font-semibold font-display transition-colors ${
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
                    <label htmlFor={sliceZId} className="text-[11px] font-semibold font-display text-muted-foreground">
                      Slice Z
                    </label>
                    <input
                      id={sliceZId}
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

                  <label className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showHotspots}
                      onChange={(event) => setShowHotspots(event.target.checked)}
                    />
                    Hotspots
                  </label>

                  <label className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showAirflow}
                      onChange={(event) => setShowAirflow(event.target.checked)}
                    />
                    Airflow Particles
                  </label>

                  <div className="ml-auto rounded-sm border border-border/80 bg-background px-3 py-2 text-xs">
                    <p className="font-semibold text-foreground">
                      {canEditHVACIn3D ? 'Drag HVAC in 3D to reposition' : 'Room polygons required for HVAC drag editing'}
                    </p>
                    <p className={`mt-0.5 font-medium ${layoutSaveState === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {layoutSaveStatusText}
                    </p>
                  </div>
                </div>
              </div>

              <AirflowViewer3D
                result={result}
                racks={racks}
                hvacUnits={hvacUnits}
                roomBoundaries={viewerRoomBoundaries}
                editableHVAC={canEditHVACIn3D}
                selectedHVACId={selectedHVACId}
                onSelectHVAC={setSelectedHVACId}
                onHVACDragPreview={handleHVACDragPreview}
                onHVACDragCommit={handleHVACDragCommit}
                onHVACDragInvalid={handleHVACDragInvalid}
                showHotspots={showHotspots}
                showAirflow={showAirflow}
                selectedSliceZ={selectedSliceZ}
                viewMode={activeView}
                onInspect={setInspectedCell}
              />

              {/* Inspect overlay card */}
              {inspectedCell && (
                <div className="mt-3 panel-glass rounded-md border border-accent/30 bg-card p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold font-display text-accent">Inspected Cell</h4>
                    <button
                      onClick={() => setInspectedCell(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Position</span>
                      <p className="font-semibold tabular-nums text-foreground">
                        ({inspectedCell.position.x.toFixed(1)}, {inspectedCell.position.y.toFixed(1)}, {inspectedCell.position.z.toFixed(1)}) m
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Temperature</span>
                      <p className="font-semibold tabular-nums text-foreground">{inspectedCell.temperature.toFixed(1)} °C</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Velocity</span>
                      <p className="font-semibold tabular-nums text-foreground">
                        {Math.sqrt(inspectedCell.velocity.x ** 2 + inspectedCell.velocity.y ** 2 + inspectedCell.velocity.z ** 2).toFixed(2)} m/s
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Pressure</span>
                      <p className="font-semibold tabular-nums text-foreground">{inspectedCell.pressure.toFixed(1)} Pa</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="panel-glass flex h-125 flex-col items-center justify-center rounded-md border border-border/70 bg-card shadow-sm">
              <Box size={48} className="mb-4 text-muted-foreground/45" />
              <p className="font-semibold text-foreground">Run a simulation to view 3D airflow</p>
            </div>
          )}
    </>
  );
}
