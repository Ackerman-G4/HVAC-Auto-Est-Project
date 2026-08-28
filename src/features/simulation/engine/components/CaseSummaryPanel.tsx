import type { useSimulationEngine } from '../useSimulationEngine';
import { Trash2, Settings2, Layers, BarChart3, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CaseStatusBadge } from './CaseStatusBadge';

type CaseSummaryPanelProps = Pick<
  ReturnType<typeof useSimulationEngine>,
  | 'activeCase'
  | 'deleteCase'
  | 'activeRun'
>;

export function CaseSummaryPanel({
  activeCase,
  deleteCase,
  activeRun,
}: CaseSummaryPanelProps) {
  if (!activeCase) return null;

  return (
    <>
            {/* Case Header */}
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{activeCase.name}</h2>
                  <p className="text-xs text-muted-foreground">{activeCase.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CaseStatusBadge status={activeCase.status} />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteCase(activeCase.id)}
                    disabled={activeCase.status === 'running'}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Geometry Summary */}
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Layers size={14} /> Geometry & Mesh
              </h3>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Room</span>
                  <p className="font-mono">{activeCase.geometry.lengthM}×{activeCase.geometry.widthM}×{activeCase.geometry.heightM}m</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Racks</span>
                  <p className="font-mono">{activeCase.geometry.racks.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">HVAC Units</span>
                  <p className="font-mono">{activeCase.geometry.hvacUnits.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tiles</span>
                  <p className="font-mono">{activeCase.geometry.tiles.length}</p>
                </div>
              </div>
              {activeCase.mesh && (
                <div className="mt-2 grid grid-cols-4 gap-3 border-t border-border/50 pt-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Grid</span>
                    <p className="font-mono">{activeCase.mesh.nx}×{activeCase.mesh.ny}×{activeCase.mesh.nz}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cell Size</span>
                    <p className="font-mono">{activeCase.mesh.cellSizeM.toFixed(3)}m</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fluid Cells</span>
                    <p className="font-mono">{activeCase.mesh.fluidCellCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Patches</span>
                    <p className="font-mono">{activeCase.mesh.patches.length}</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Physics & Solver Config */}
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Settings2 size={14} /> Physics & Solver
              </h3>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Turbulence</span>
                  <p className="font-mono">{activeCase.physics.turbulenceModel}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Algorithm</span>
                  <p className="font-mono">{activeCase.solver.algorithm}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Iterations</span>
                  <p className="font-mono">{activeCase.solver.maxIterations}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Convergence Target</span>
                  <p className="font-mono">{activeCase.solver.convergenceTarget}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Buoyancy</span>
                  <p className="font-mono">{activeCase.physics.buoyancy ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Run Source</span>
                  <p className="font-mono">{activeCase.runSource}</p>
                </div>
              </div>
            </Card>

            {/* Active Run Progress */}
            {activeRun && (
              <Card className="p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <BarChart3 size={14} /> Run Progress
                </h3>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-mono capitalize">{activeRun.status}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Iteration</span>
                    <p className="font-mono">{activeRun.currentIteration} / {activeRun.totalIterations}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Elapsed</span>
                    <p className="font-mono">{activeRun.elapsedSeconds.toFixed(1)}s</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source</span>
                    <p className="font-mono">{activeRun.source}</p>
                  </div>
                </div>
                {activeRun.residuals.length > 0 && (
                  <div className="mt-2 border-t border-border/50 pt-2">
                    <p className="text-[10px] font-medium text-muted-foreground">Latest Residuals</p>
                    <div className="mt-1 grid grid-cols-5 gap-2 text-[10px] font-mono">
                      <span>Cont: {activeRun.residuals[activeRun.residuals.length - 1].continuity.toExponential(2)}</span>
                      <span>Mom-X: {activeRun.residuals[activeRun.residuals.length - 1].momentumX.toExponential(2)}</span>
                      <span>Mom-Y: {activeRun.residuals[activeRun.residuals.length - 1].momentumY.toExponential(2)}</span>
                      <span>Energy: {activeRun.residuals[activeRun.residuals.length - 1].energy.toExponential(2)}</span>
                      {activeRun.residuals[activeRun.residuals.length - 1].k !== undefined && (
                        <span>k: {activeRun.residuals[activeRun.residuals.length - 1].k!.toExponential(2)}</span>
                      )}
                    </div>
                  </div>
                )}
                {activeRun.errorMessage && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle size={12} /> {activeRun.errorMessage}
                  </div>
                )}
                {activeRun.status === 'completed' && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 size={12} /> Run completed successfully
                  </div>
                )}
              </Card>
            )}
    </>
  );
}
