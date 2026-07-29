import type { useSimulationEngine } from '../useSimulationEngine';
import { Plus, Play, Download, Upload, Trash2, RefreshCw, Layers, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';
import type { ContourSliceConfig } from '@/types/simulation';

type RunActionsPanelProps = Pick<
  ReturnType<typeof useSimulationEngine>,
  | 'activeCase'
  | 'startRun'
  | 'loadRunHistory'
  | 'isPolling'
  | 'importResults'
  | 'isExporting'
  | 'isImporting'
  | 'contourSlices'
  | 'addContourSlice'
  | 'removeContourSlice'
  | 'updateContourSlice'
  | 'handleExport'
>;

export function RunActionsPanel({
  activeCase,
  startRun,
  loadRunHistory,
  isPolling,
  importResults,
  isExporting,
  isImporting,
  contourSlices,
  addContourSlice,
  removeContourSlice,
  updateContourSlice,
  handleExport,
}: RunActionsPanelProps) {
  return (
    <>
      <div className="flex w-64 shrink-0 flex-col gap-3">
        {/* Run Controls — solver tier split (plan §D2, §4.3) */}
        <Card className="elev-raised p-3">
          <SectionLabel icon={<Play size={12} />}>Run Controls</SectionLabel>
          <div className="space-y-2">
            <div className="rounded-md border border-accent/30 bg-accent/5 p-2">
              <Button
                size="sm"
                variant="accent"
                className="cta-glow w-full"
                onClick={() => startRun('internal')}
                disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
              >
                {isPolling ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Play size={12} className="mr-1.5" />}
                Run Preview
              </Button>
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                Instant, in-browser. Temperature, velocity, pressure &amp; humidity. Free tier.
              </p>
            </div>
            <div className="rounded-md border border-[color:color-mix(in_oklab,var(--copper)_45%,var(--border))] p-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full border-[color:color-mix(in_oklab,var(--copper)_55%,var(--border))] text-[color:var(--copper)] hover:bg-[color:color-mix(in_oklab,var(--copper)_12%,transparent)]"
                onClick={() => startRun('openfoam')}
                disabled={!activeCase || activeCase.status === 'running' || activeCase.status === 'queued'}
              >
                <Play size={12} className="mr-1.5" />
                Run Engineering
              </Button>
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                OpenFOAM cloud solve (minutes). Defensible numbers. No humidity field.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => activeCase && loadRunHistory()}
              disabled={!activeCase}
            >
              <RefreshCw size={12} className="mr-1.5" />
              Refresh Run History
            </Button>
          </div>
        </Card>

        {/* Export / Import */}
        <Card className="elev-raised p-3">
          <SectionLabel icon={<Download size={12} />}>Export / Import</SectionLabel>
          <div className="space-y-1.5">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleExport}
              disabled={!activeCase || !activeCase.mesh || isExporting}
            >
              {isExporting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Download size={12} className="mr-1.5" />}
              Export OpenFOAM Case
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                // Trigger file upload for result import
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    await importResults(data.fields || data, data.source);
                  } catch { /* handled by store */ }
                };
                input.click();
              }}
              disabled={!activeCase || !activeCase.mesh || isImporting}
            >
              {isImporting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Upload size={12} className="mr-1.5" />}
              Import Results
            </Button>
          </div>
        </Card>

        {/* Contour Slices */}
        <Card className="elev-raised flex-1 p-3">
          <SectionLabel icon={<Layers size={12} />}>Contour Slices</SectionLabel>
          <Button
            size="sm"
            variant="ghost"
            className="mb-2 w-full"
            onClick={() =>
              addContourSlice({
                id: crypto.randomUUID(),
                field: 'temperature',
                orientation: 'xy',
                position: 1.5,
                levels: 20,
                colorMap: 'jet',
                opacity: 0.5,
                showLines: false,
              })
            }
          >
            <Plus size={12} className="mr-1" /> Add Slice
          </Button>

          <div className="space-y-2">
            {contourSlices.map((slice) => (
              <div key={slice.id} className="rounded border border-border p-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{slice.field} — {slice.orientation}</span>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeContourSlice(slice.id)}>
                    <Trash2 size={10} />
                  </Button>
                </div>
                <div className="mt-1 flex gap-1">
                  <select
                    value={slice.orientation}
                    onChange={(e) => updateContourSlice(slice.id, { orientation: e.target.value as ContourSliceConfig['orientation'] })}
                    className="rounded border border-border bg-background px-1 text-[10px]"
                  >
                    <option value="xy">XY (horizontal)</option>
                    <option value="xz">XZ (vertical)</option>
                    <option value="yz">YZ (vertical)</option>
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    value={slice.position}
                    onChange={(e) => updateContourSlice(slice.id, { position: Number(e.target.value) })}
                    className="w-14 rounded border border-border bg-background px-1 text-[10px]"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
