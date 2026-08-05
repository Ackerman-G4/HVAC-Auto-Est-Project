'use client';

import { Download, FileDown, FileText, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import type { SimulationReportHistoryEntry } from '@/lib/reports/simulation-report-history';
import type { BackfillRunStatus } from '../backfill-status';

interface SimulationExportHistoryPanelProps {
  historyAction: null | 'refresh' | 'clear' | 'backfill';
  historyExporting: null | { id: string; format: 'pdf' | 'csv' | 'json' };
  simulationReportHistory: SimulationReportHistoryEntry[];
  lastBackfillRun: BackfillRunStatus | null;
  legacyPayloadMissingCount: number;
  onRefresh: () => void;
  onBackfill: () => void;
  onClear: () => void;
  onExportEntry: (entry: SimulationReportHistoryEntry, format: 'pdf' | 'csv' | 'json') => void;
}

export function SimulationExportHistoryPanel({
  historyAction,
  historyExporting,
  simulationReportHistory,
  lastBackfillRun,
  legacyPayloadMissingCount,
  onRefresh,
  onBackfill,
  onClear,
  onExportEntry,
}: SimulationExportHistoryPanelProps) {
  return (
    <CollapsiblePanel
      title="Simulation Export History"
      subtitle="Recent simulation report exports from Viewer and Workspace"
      defaultOpen={false}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          isLoading={historyAction === 'refresh'}
        >
          <RotateCcw size={14} className="mr-1" />
          Refresh
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onBackfill}
          isLoading={historyAction === 'backfill'}
        >
          <Download size={14} className="mr-1" />
          Backfill Legacy
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onClear}
          isLoading={historyAction === 'clear'}
        >
          <Trash2 size={14} className="mr-1" />
          Clear
        </Button>
        <span className="ml-1 text-[11px] text-muted-foreground">
          Missing payload (visible): {legacyPayloadMissingCount}
        </span>
      </div>

      {lastBackfillRun && (
        <div className="mb-3 rounded-sm border border-border bg-secondary/70 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Last backfill:</span>{' '}
          {new Date(lastBackfillRun.attemptedAt).toLocaleString('en-PH')} · Checked {lastBackfillRun.checkedCount}
          {' · '}Updated {lastBackfillRun.updatedCount}
          {' · '}Skipped {lastBackfillRun.skippedCount}
          {' · '}
          <span className={lastBackfillRun.ok ? 'text-success' : 'text-destructive'}>
            {lastBackfillRun.ok ? 'Success' : 'Failed'}
          </span>
          {lastBackfillRun.message ? ` (${lastBackfillRun.message})` : ''}
        </div>
      )}

      {simulationReportHistory.length === 0 ? (
        <div className="rounded-sm border border-border bg-secondary p-4 text-sm text-muted-foreground">
          No simulation report exports recorded yet. Export from the simulation viewer or workspace to populate history.
        </div>
      ) : (
        <div className="space-y-2">
          {simulationReportHistory.slice(0, 12).map((entry) => (
            <div key={entry.id} className="rounded-sm border border-border bg-secondary p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold font-display text-foreground">
                  {entry.projectName} · {entry.format.toUpperCase()} · {entry.source}
                </span>
                <span>{new Date(entry.generatedAt).toLocaleString('en-PH')}</span>
              </div>
              <div className="mt-1 grid gap-1 sm:grid-cols-3">
                <span>Max Temp: {entry.maxTemperatureC.toFixed(2)}°C</span>
                <span>PUE: {entry.pue.toFixed(3)}</span>
                <span>Hotspots: {entry.hotspotCount}</span>
              </div>
              <div className="mt-1 grid gap-1 sm:grid-cols-3">
                <span>Project: {entry.projectId}</span>
                <span>Floor: {entry.floorId}</span>
                <span>Runtime: {entry.runtimeMode}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onExportEntry(entry, 'pdf')}
                  disabled={!entry.report}
                  isLoading={historyExporting?.id === entry.id && historyExporting?.format === 'pdf'}
                >
                  <FileText size={12} className="mr-1" /> PDF
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onExportEntry(entry, 'csv')}
                  disabled={!entry.report}
                  isLoading={historyExporting?.id === entry.id && historyExporting?.format === 'csv'}
                >
                  <FileDown size={12} className="mr-1" /> CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onExportEntry(entry, 'json')}
                  disabled={!entry.report}
                  isLoading={historyExporting?.id === entry.id && historyExporting?.format === 'json'}
                >
                  <Download size={12} className="mr-1" /> JSON
                </Button>
                {!entry.report && (
                  <span className="text-[10px] text-muted-foreground">Payload unavailable for this entry.</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsiblePanel>
  );
}
