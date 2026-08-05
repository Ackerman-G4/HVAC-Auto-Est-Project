'use client';

import { FileText, FileDown, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { showToast } from '@/components/ui/toast';
import { exportProjectPDF, exportProjectDXF, exportProjectCSV, exportProjectExcel } from '@/lib/utils/project-export';
import type { ProjectData } from '../types';

interface ExportTabProps {
  project: ProjectData;
  snapshotSavedAt: string | null;
  exportEnabled: boolean;
  boqTampered: boolean;
  onSaveSnapshot: () => void;
  onRestoreSnapshot: () => void;
  onClearSnapshot: () => void;
}

export function ExportTab({
  project,
  snapshotSavedAt,
  exportEnabled,
  boqTampered,
  onSaveSnapshot,
  onRestoreSnapshot,
  onClearSnapshot,
}: ExportTabProps) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1">Export Project</h3>
        <p className="text-sm text-muted-foreground">Download project data in various formats for documentation, CAD, or spreadsheet analysis.</p>
      </div>

      <Card className="panel-glass mb-4 border border-border/70 bg-card shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Offline Snapshot (v1)</CardTitle>
          <CardDescription>
            Autosaves locally in your browser and can be restored when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Last local snapshot:{' '}
            <span className="text-foreground font-medium">
              {snapshotSavedAt ? new Date(snapshotSavedAt).toLocaleString() : 'No snapshot saved'}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onSaveSnapshot}>
              Save Snapshot
            </Button>
            <Button variant="accent" size="sm" onClick={onRestoreSnapshot}>
              Restore Snapshot
            </Button>
            <Button variant="ghost" size="sm" onClick={onClearSnapshot}>
              Clear Snapshot
            </Button>
          </div>
        </CardContent>
      </Card>

      {!exportEnabled && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {boqTampered
            ? 'BOQ integrity check failed. Regenerate the BOQ to restore a verified export.'
            : 'Exports are locked until the BOQ is verified. Recalculate the BOQ to lock it before exporting.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* PDF Report */}
        <Card className={`panel-glass border border-border/70 bg-card transition-all duration-200 ${exportEnabled ? 'cursor-pointer hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md' : 'cursor-not-allowed opacity-50'}`} onClick={() => {
          if (!exportEnabled) {
            showToast('warning', 'Export blocked', 'Recalculate the BOQ to lock it before exporting.');
            return;
          }
          exportProjectPDF(project);
          showToast('success', 'PDF report downloaded');
        }}>
          <CardContent className="p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-red-500/25 bg-red-500/10">
              <FileText className="w-6 h-6 text-red-600" />
            </div>
            <h4 className="font-semibold mb-1">PDF Report</h4>
            <p className="text-sm text-muted-foreground">Full project report with cooling loads, equipment, and BOQ</p>
          </CardContent>
        </Card>

        {/* DXF / CAD */}
        <Card className={`panel-glass border border-border/70 bg-card transition-all duration-200 ${exportEnabled ? 'cursor-pointer hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md' : 'cursor-not-allowed opacity-50'}`} onClick={() => {
          if (!exportEnabled) {
            showToast('warning', 'Export blocked', 'Recalculate the BOQ to lock it before exporting.');
            return;
          }
          exportProjectDXF(project);
          showToast('success', 'DXF file downloaded — open in AutoCAD or BricsCAD');
        }}>
          <CardContent className="p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[rgba(15,139,141,0.3)] bg-[rgba(15,139,141,0.14)]">
              <FileDown className="w-6 h-6 text-accent" />
            </div>
            <h4 className="font-semibold mb-1">CAD Export (DXF)</h4>
            <p className="text-sm text-muted-foreground">AutoCAD-compatible floor plans with room labels and loads</p>
          </CardContent>
        </Card>

        {/* Excel */}
        <Card className={`panel-glass border border-border/70 bg-card transition-all duration-200 ${exportEnabled ? 'cursor-pointer hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md' : 'cursor-not-allowed opacity-50'}`} onClick={async () => {
          if (!exportEnabled) {
            showToast('warning', 'Export blocked', 'Recalculate the BOQ to lock it before exporting.');
            return;
          }
          await exportProjectExcel(project);
          showToast('success', 'Excel workbook downloaded');
        }}>
          <CardContent className="p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
            </div>
            <h4 className="font-semibold mb-1">Excel Workbook</h4>
            <p className="text-sm text-muted-foreground">Multi-sheet workbook with loads, equipment, and BOQ</p>
          </CardContent>
        </Card>

        {/* CSV */}
        <Card className={`panel-glass border border-border/70 bg-card transition-all duration-200 ${exportEnabled ? 'cursor-pointer hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md' : 'cursor-not-allowed opacity-50'}`} onClick={() => {
          if (!exportEnabled) {
            showToast('warning', 'Export blocked', 'Recalculate the BOQ to lock it before exporting.');
            return;
          }
          exportProjectCSV(project);
          showToast('success', 'CSV file downloaded');
        }}>
          <CardContent className="p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <h4 className="font-semibold mb-1">CSV Data</h4>
            <p className="text-sm text-muted-foreground">Cooling load data in CSV format for custom analysis</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
