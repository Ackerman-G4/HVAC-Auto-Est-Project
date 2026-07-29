import type { useSimulationEngine } from '../useSimulationEngine';
import { Plus, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CaseStatusBadge } from '../components/CaseStatusBadge';
import { Stagger, StaggerItem } from '@/components/ui/reveal';

type CaseListPanelProps = Pick<
  ReturnType<typeof useSimulationEngine>,
  | 'projectId'
  | 'cases'
  | 'isLoadingCases'
  | 'loadCases'
  | 'activeCase'
  | 'selectCase'
  | 'selectedProjectId'
  | 'setSelectedProjectId'
  | 'showCreateForm'
  | 'setShowCreateForm'
  | 'newCaseName'
  | 'setNewCaseName'
  | 'newCaseInputRef'
  | 'projects'
  | 'geometry'
  | 'setGeometry'
  | 'handleLoadProject'
  | 'handleCreateCase'
>;

export function CaseListPanel({
  projectId,
  cases,
  isLoadingCases,
  loadCases,
  activeCase,
  selectCase,
  selectedProjectId,
  setSelectedProjectId,
  showCreateForm,
  setShowCreateForm,
  newCaseName,
  setNewCaseName,
  newCaseInputRef,
  projects,
  geometry,
  setGeometry,
  handleLoadProject,
  handleCreateCase,
}: CaseListPanelProps) {
  return (
      <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
        {/* Project Selector */}
        <Card className="p-3">
          <label className="text-xs font-medium text-muted-foreground">Select Project</label>
          <div className="mt-1 flex gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={handleLoadProject} disabled={!selectedProjectId}>
              Load
            </Button>
          </div>
        </Card>

        {/* Case List */}
        <Card className="flex-1 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Simulation Cases</h3>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => projectId && loadCases(projectId)} disabled={!projectId}>
                <RefreshCw size={12} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(true)} disabled={!projectId}>
                <Plus size={12} />
              </Button>
            </div>
          </div>

          {isLoadingCases && (
            <div className="space-y-1.5 py-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-md" />
              ))}
            </div>
          )}

          {!isLoadingCases && cases.length === 0 && projectId && (
            <p className="py-4 text-center text-xs text-muted-foreground">No simulation cases yet</p>
          )}

          {!isLoadingCases && cases.length > 0 && (
            <Stagger className="space-y-1.5">
              {cases.map((c) => (
                <StaggerItem key={c.id}>
                  <button
                    onClick={() => selectCase(c.id)}
                    className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                      activeCase?.id === c.id
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      <CaseStatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{c.runSource} &middot; {c.geometry.lengthM}×{c.geometry.widthM}×{c.geometry.heightM}m</p>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="mt-3 space-y-2 rounded-md border border-border p-2">
              <input
                ref={newCaseInputRef}
                type="text"
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                placeholder="Case name..."
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] text-muted-foreground">Length (m)</label>
                  <input
                    type="number"
                    value={geometry.lengthM}
                    onChange={(e) => setGeometry({ ...geometry, lengthM: Number(e.target.value) || 1 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Width (m)</label>
                  <input
                    type="number"
                    value={geometry.widthM}
                    onChange={(e) => setGeometry({ ...geometry, widthM: Number(e.target.value) || 1 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Height (m)</label>
                  <input
                    type="number"
                    value={geometry.heightM}
                    onChange={(e) => setGeometry({ ...geometry, heightM: Number(e.target.value) || 1 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] text-muted-foreground">Raised Floor (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={geometry.raisedFloorHeightM}
                    onChange={(e) => setGeometry({ ...geometry, raisedFloorHeightM: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Ceiling Plenum (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={geometry.ceilingPlenumHeightM}
                    onChange={(e) => setGeometry({ ...geometry, ceilingPlenumHeightM: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={handleCreateCase} disabled={!newCaseName.trim()}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
  );
}
