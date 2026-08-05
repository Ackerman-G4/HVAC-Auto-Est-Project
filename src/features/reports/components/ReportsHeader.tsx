'use client';

import { Download, FileDown, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ReportsHeaderProps {
  exporting: null | 'pdf' | 'excel' | 'csv' | 'json';
  snapshotTransfer: null | 'export' | 'import';
  onExportSnapshot: () => void;
  onImportSnapshot: () => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
}

export function ReportsHeader({
  exporting,
  snapshotTransfer,
  onExportSnapshot,
  onImportSnapshot,
  onExportPdf,
  onExportExcel,
  onExportCsv,
  onExportJson,
}: ReportsHeaderProps) {
  return (
    <Card className="panel-glass border-border/70 p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold font-display text-muted-foreground">Reporting Command Deck</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Engineering Reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consolidate load, airflow, equipment, and costing outputs into client-ready deliverables.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onExportSnapshot} isLoading={snapshotTransfer === 'export'}>
            <Download size={14} className="mr-1" />
            Export Snapshot
          </Button>
          <Button variant="secondary" size="sm" onClick={onImportSnapshot} isLoading={snapshotTransfer === 'import'}>
            <Upload size={14} className="mr-1" />
            Import Snapshot
          </Button>
          <Button variant="secondary" size="sm" onClick={onExportPdf} isLoading={exporting === 'pdf'}>
            <FileText size={14} className="mr-1" />
            PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={onExportExcel} isLoading={exporting === 'excel'}>
            <FileSpreadsheet size={14} className="mr-1" />
            Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={onExportCsv} isLoading={exporting === 'csv'}>
            <FileDown size={14} className="mr-1" />
            CSV
          </Button>
          <Button size="sm" onClick={onExportJson} isLoading={exporting === 'json'}>
            <Download size={14} className="mr-1" />
            JSON
          </Button>
        </div>
      </div>
    </Card>
  );
}
