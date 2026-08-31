'use client';

import type { useSimulationViewer } from '../useSimulationViewer';
import dynamic from 'next/dynamic';
import { Layers } from 'lucide-react';
import { useId } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
const AirflowViewer3D = dynamic(() => import('@/components/building/AirflowViewer3D').then(m => m.default), { ssr: false, loading: () => <div className="panel-glass flex h-125 items-center justify-center rounded-md border border-border/70 bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading 3D viewer...</div> });
const TileFlowDashboard = dynamic(() => import('@/components/building/TileFlowDashboard').then(m => m.default), { ssr: false, loading: () => <div className="panel-glass flex h-64 items-center justify-center rounded-md border border-border/70 bg-card text-sm font-medium text-muted-foreground shadow-sm">Loading dashboard...</div> });

type TileFlowTabContentProps = Pick<
  ReturnType<typeof useSimulationViewer>,
  | 'tileFlowViewerRef'
  | 'racks'
  | 'hvacUnits'
  | 'result'
  | 'activeView'
  | 'showHotspots'
  | 'selectedSliceZ'
  | 'setInspectedCell'
  | 'tileFlowView'
  | 'setTileFlowView'
  | 'alerts'
  | 'tileAirflowData'
  | 'viewerRoomBoundaries'
>;

export function TileFlowTabContent({
  tileFlowViewerRef,
  racks,
  hvacUnits,
  result,
  activeView,
  showHotspots,
  selectedSliceZ,
  setInspectedCell,
  tileFlowView,
  setTileFlowView,
  alerts,
  tileAirflowData,
  viewerRoomBoundaries,
}: TileFlowTabContentProps) {
  // useId, not a literal: a duplicated id points every label at the first control.
  const fogOpacityId = useId();

  return (
    <>
          {result ? (
            <div className="space-y-6">
              {/* TileFlow 3D Controls */}
              <div className="panel-glass rounded-md border border-border/70 bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="mr-1 text-[11px] font-semibold font-display text-muted-foreground">TileFlow Overlays</span>
                  {([
                    { key: 'showStreamlines' as const, label: 'Streamlines' },
                    { key: 'showFog' as const, label: 'Temp Fog' },
                    { key: 'showTileOverlay' as const, label: 'Tile Airflow' },
                    { key: 'showAlerts' as const, label: 'Alert Zones' },
                  ]).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={tileFlowView[key]}
                        onChange={(e) => setTileFlowView({ [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                  <div className="ml-auto flex items-center gap-2">
                    <label htmlFor={fogOpacityId} className="text-xs text-muted-foreground">Fog Opacity</label>
                    <input
                      id={fogOpacityId}
                      type="range"
                      min={0.05}
                      max={0.8}
                      step={0.05}
                      value={tileFlowView.fogOpacity}
                      onChange={(e) => setTileFlowView({ fogOpacity: Number(e.target.value) })}
                      className="w-24"
                      aria-label="Fog opacity"
                    />
                    <span className="w-8 text-xs tabular-nums text-foreground">{(tileFlowView.fogOpacity * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {/* 3D Viewer with TileFlow overlays */}
              <AirflowViewer3D
                ref={tileFlowViewerRef}
                result={result}
                racks={racks}
                hvacUnits={hvacUnits}
                roomBoundaries={viewerRoomBoundaries}
                showHotspots={showHotspots}
                showAirflow={false}
                selectedSliceZ={selectedSliceZ}
                viewMode={activeView}
                onInspect={setInspectedCell}
                tileFlowView={tileFlowView}
                tileAirflowData={tileAirflowData}
                alerts={alerts}
                // The only consumer of captureSnapshot, so the only viewer that
                // needs the GPU drawing buffer retained.
                enableSnapshotCapture
              />

              {/* TileFlow Dashboard */}
              <TileFlowDashboard
                result={result}
                alerts={alerts}
                tileAirflowData={tileAirflowData}
                onSnapshotCapture={() => tileFlowViewerRef.current?.captureSnapshot() ?? null}
              />
            </div>
          ) : (
            <EmptyState
              className="panel-glass h-64"
              icon={<Layers size={28} />}
              title="No simulation results yet"
              description="Run a CFD simulation to view TileFlow analysis"
            />
          )}
    </>
  );
}
