'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileDown, FileSpreadsheet, FileText, Info, Upload } from 'lucide-react';
import { Card } from '@/components/rebuild/Card';
import { Button } from '@/components/rebuild/Button';
import { CollapsiblePanel } from '@/components/rebuild/CollapsiblePanel';
import { showToast } from '@/components/ui/toast';
import { buildWorkspaceSnapshot, parseWorkspaceSnapshot } from '@/lib/reports/workspace-snapshot';
import { useAirflowWorkspaceStore } from '@/stores/airflow-workspace-store';
import { useEquipmentWorkspaceStore } from '@/stores/equipment-workspace-store';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';
import { useUIStore } from '@/stores/ui-store';

function toPhp(value: number): string {
  return `PHP ${Math.round(value).toLocaleString('en-PH')}`;
}

function csvEscape(value: string | number): string {
  const text = String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'project';
}

export default function ReportsPage() {
  const [chartsReady, setChartsReady] = React.useState(false);
  const [exporting, setExporting] = React.useState<null | 'pdf' | 'excel' | 'csv' | 'json'>(null);
  const [snapshotTransfer, setSnapshotTransfer] = React.useState<null | 'export' | 'import'>(null);
  const snapshotInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

  const mode = useUIStore((state) => state.workspaceMode);
  const loadInputs = useLoadWorkspaceStore((state) => state.inputs);
  const loadResult = useLoadWorkspaceStore((state) => state.result);
  const getLoadSnapshot = useLoadWorkspaceStore((state) => state.getSnapshot);
  const applyLoadSnapshot = useLoadWorkspaceStore((state) => state.applySnapshot);
  const setSupplyCfm = useAirflowWorkspaceStore((state) => state.setSupplyCfm);
  const airflowInputs = useAirflowWorkspaceStore((state) => state.inputs);
  const airflowResult = useAirflowWorkspaceStore((state) => state.result);
  const getAirflowSnapshot = useAirflowWorkspaceStore((state) => state.getSnapshot);
  const applyAirflowSnapshot = useAirflowWorkspaceStore((state) => state.applySnapshot);
  const setRequiredTr = useEquipmentWorkspaceStore((state) => state.setRequiredTr);
  const equipmentInputs = useEquipmentWorkspaceStore((state) => state.inputs);
  const equipmentResult = useEquipmentWorkspaceStore((state) => state.result);
  const getEquipmentSnapshot = useEquipmentWorkspaceStore((state) => state.getSnapshot);
  const applyEquipmentSnapshot = useEquipmentWorkspaceStore((state) => state.applySnapshot);

  React.useEffect(() => {
    setSupplyCfm(Math.max(200, Math.round(loadResult.breakdown.cfmRequired)));
    setRequiredTr(Number(loadResult.breakdown.trRequired.toFixed(2)));
  }, [loadResult.breakdown.cfmRequired, loadResult.breakdown.trRequired, setRequiredTr, setSupplyCfm]);

  const selectedCandidate = React.useMemo(
    () =>
      equipmentResult.candidates.find((candidate) => candidate.id === equipmentResult.selectedCandidateId)
      ?? equipmentResult.candidates[0]
      ?? null,
    [equipmentResult.candidates, equipmentResult.selectedCandidateId],
  );

  const isProfessional = mode === 'professional';

  const loadBreakdownData = React.useMemo(
    () => [
      { component: 'Envelope', btu: loadResult.breakdown.envelopeBtu },
      { component: 'People', btu: loadResult.breakdown.peopleBtu },
      { component: 'Lighting', btu: loadResult.breakdown.lightingBtu },
      { component: 'Equipment', btu: loadResult.breakdown.equipmentBtu },
      { component: 'Ventilation', btu: loadResult.breakdown.ventilationBtu },
    ],
    [
      loadResult.breakdown.envelopeBtu,
      loadResult.breakdown.equipmentBtu,
      loadResult.breakdown.lightingBtu,
      loadResult.breakdown.peopleBtu,
      loadResult.breakdown.ventilationBtu,
    ],
  );

  const branchVelocityData = React.useMemo(() => airflowResult.branchRows, [airflowResult.branchRows]);
  const equipmentScoreData = React.useMemo(
    () => equipmentResult.candidates.slice(0, 8),
    [equipmentResult.candidates],
  );

  const buildReportPayload = React.useCallback(() => {
    return {
      generatedAt: new Date().toISOString(),
      projectName: loadInputs.projectName,
      summary: {
        designLoadBtuPerHour: loadResult.breakdown.totalBtuAfterFactors,
        designTr: loadResult.breakdown.trRequired,
        designCfm: loadResult.breakdown.cfmRequired,
        totalStaticPressureInWg: airflowResult.totalStaticPressureInWg,
        fanPowerHp: airflowResult.requiredFanPowerHp,
        selectedEquipment: selectedCandidate,
      },
      inputs: {
        load: loadInputs,
        airflow: airflowInputs,
        equipment: equipmentInputs,
      },
      outputs: {
        load: loadResult,
        airflow: airflowResult,
        equipment: equipmentResult,
      },
    };
  }, [
    airflowInputs,
    airflowResult,
    equipmentInputs,
    equipmentResult,
    loadInputs,
    loadResult,
    selectedCandidate,
  ]);

  const exportJson = React.useCallback(async () => {
    setExporting('json');
    try {
      const payload = buildReportPayload();
      downloadTextFile(
        `hvac-report-${slugify(loadInputs.projectName)}.json`,
        JSON.stringify(payload, null, 2),
        'application/json;charset=utf-8',
      );
      showToast('success', 'JSON exported', 'Report payload downloaded successfully.');
    } catch (error) {
      console.error(error);
      showToast('error', 'JSON export failed');
    } finally {
      setExporting(null);
    }
  }, [buildReportPayload, loadInputs.projectName]);

  const exportWorkspaceSnapshot = React.useCallback(async () => {
    setSnapshotTransfer('export');
    try {
      const snapshot = buildWorkspaceSnapshot({
        load: getLoadSnapshot(),
        airflow: getAirflowSnapshot(),
        equipment: getEquipmentSnapshot(),
      });

      const timestamp = snapshot.exportedAt.replace(/[:.]/g, '-');
      const fileName = `hvac-workspace-snapshot-${slugify(loadInputs.projectName)}-${timestamp}.json`;

      downloadTextFile(
        fileName,
        JSON.stringify(snapshot, null, 2),
        'application/json;charset=utf-8',
      );
      showToast('success', 'Workspace snapshot exported', 'Use this file to restore this workspace on another device.');
    } catch (error) {
      console.error(error);
      showToast('error', 'Snapshot export failed');
    } finally {
      setSnapshotTransfer(null);
    }
  }, [getAirflowSnapshot, getEquipmentSnapshot, getLoadSnapshot, loadInputs.projectName]);

  const triggerSnapshotImport = React.useCallback(() => {
    snapshotInputRef.current?.click();
  }, []);

  const handleSnapshotFileSelected = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setSnapshotTransfer('import');
    try {
      const raw = await file.text();
      const parsed = parseWorkspaceSnapshot(raw);

      if (!parsed) {
        showToast('error', 'Invalid snapshot file', 'Snapshot schema validation failed.');
        return;
      }

      applyLoadSnapshot(parsed.modules.load);
      applyAirflowSnapshot(parsed.modules.airflow);
      applyEquipmentSnapshot(parsed.modules.equipment);

      const importedAt = Number.isNaN(Date.parse(parsed.exportedAt))
        ? parsed.exportedAt
        : new Date(parsed.exportedAt).toLocaleString('en-PH');

      showToast(
        'success',
        'Workspace snapshot imported',
        `Module inputs and overrides restored from snapshot (${importedAt}).`,
      );
    } catch (error) {
      console.error(error);
      showToast('error', 'Snapshot import failed');
    } finally {
      setSnapshotTransfer(null);
    }
  }, [applyAirflowSnapshot, applyEquipmentSnapshot, applyLoadSnapshot]);

  const exportCsv = React.useCallback(async () => {
    setExporting('csv');
    try {
      const summaryRows: Array<[string, string | number]> = [
        ['Project', loadInputs.projectName],
        ['Space Type', loadInputs.spaceType],
        ['Design Load (BTU/h)', loadResult.breakdown.totalBtuAfterFactors],
        ['Cooling Tonnage (TR)', loadResult.breakdown.trRequired],
        ['Airflow Demand (CFM)', loadResult.breakdown.cfmRequired],
        ['Total Static Pressure (in.wg)', airflowResult.totalStaticPressureInWg],
        ['Fan Power (HP)', airflowResult.requiredFanPowerHp],
        ['Selected Equipment', selectedCandidate?.model ?? 'None'],
        ['Equipment Quantity', selectedCandidate?.quantity ?? 0],
        ['Equipment Capex', selectedCandidate?.capexPhp ?? 0],
        ['Equipment 5-Year Lifecycle', selectedCandidate?.totalLifecyclePhp ?? 0],
      ];

      const lines: string[] = [
        'Metric,Value',
        ...summaryRows.map(([metric, value]) => `${csvEscape(metric)},${csvEscape(value)}`),
        '',
        'Candidate,Type,Qty,Provided TR,Utilization %,Capex,Annual Energy Cost,Lifecycle,Score',
        ...equipmentResult.candidates.map((candidate) =>
          [
            candidate.model,
            candidate.type,
            candidate.quantity,
            candidate.providedTr,
            candidate.utilizationPct,
            candidate.capexPhp,
            candidate.annualEnergyCostPhp,
            candidate.totalLifecyclePhp,
            candidate.score,
          ]
            .map((value) => csvEscape(value))
            .join(','),
        ),
      ];

      downloadTextFile(
        `hvac-summary-${slugify(loadInputs.projectName)}.csv`,
        lines.join('\n'),
        'text/csv;charset=utf-8',
      );
      showToast('success', 'CSV exported', 'Summary matrix downloaded successfully.');
    } catch (error) {
      console.error(error);
      showToast('error', 'CSV export failed');
    } finally {
      setExporting(null);
    }
  }, [airflowResult, equipmentResult.candidates, loadInputs.projectName, loadInputs.spaceType, loadResult, selectedCandidate]);

  const exportPdf = React.useCallback(async () => {
    setExporting('pdf');
    try {
      const { createAndDownloadPdf, hrLine, boldText } = await import('@/lib/utils/pdf-make');
      type Content = import('pdfmake/interfaces').Content;
      const bold = boldText;

      const summaryRows = [
        ['Project', loadInputs.projectName],
        ['Space Type', loadInputs.spaceType],
        ['Design Load', `${loadResult.breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h`],
        ['Cooling Tonnage', `${loadResult.breakdown.trRequired.toFixed(2)} TR`],
        ['Airflow Demand', `${loadResult.breakdown.cfmRequired.toLocaleString()} CFM`],
        ['Total Static', `${airflowResult.totalStaticPressureInWg.toFixed(2)} in.wg`],
        ['Fan Power', `${airflowResult.requiredFanPowerHp.toFixed(2)} HP`],
        ['Selected Equipment', selectedCandidate?.model ?? 'No candidate selected'],
        ['Equipment Capex', toPhp(selectedCandidate?.capexPhp ?? 0)],
        ['5-Year Lifecycle', toPhp(selectedCandidate?.totalLifecyclePhp ?? 0)],
      ];

      const loadTable: Content = {
        table: {
          headerRows: 1,
          widths: ['*', 120],
          body: [
            ['Load Component', 'BTU/h'].map((header) => bold(header, { fontSize: 9 })),
            ...loadBreakdownData.map((item) => [item.component, item.btu.toLocaleString()]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 4, 0, 8],
      };

      const branchTable: Content = {
        table: {
          headerRows: 1,
          widths: ['*', 60, 60, 60],
          body: [
            ['Branch', 'CFM', 'Velocity', 'Drop'].map((header) => bold(header, { fontSize: 8 })),
            ...airflowResult.branchRows.map((row) => [
              row.branch,
              row.designCfm.toLocaleString(),
              row.velocityFpm.toFixed(0),
              row.pressureDropInWg.toFixed(2),
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 4, 0, 8],
      };

      const candidateTable: Content = {
        table: {
          headerRows: 1,
          widths: ['*', 30, 55, 45, 65, 60],
          body: [
            ['Model', 'Qty', 'TR', 'Score', 'Capex', 'Lifecycle'].map((header) => bold(header, { fontSize: 8 })),
            ...equipmentResult.candidates.slice(0, 10).map((candidate) => [
              candidate.model,
              String(candidate.quantity),
              candidate.providedTr.toFixed(2),
              candidate.score.toFixed(1),
              toPhp(candidate.capexPhp),
              toPhp(candidate.totalLifecyclePhp),
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 4, 0, 8],
      };

      await createAndDownloadPdf(
        {
          content: [
            bold('HVAC Integrated Engineering Report', { fontSize: 18, margin: [0, 0, 0, 8] }),
            { text: `Generated: ${new Date().toLocaleString('en-PH')}`, fontSize: 9, margin: [0, 0, 0, 6] },
            hrLine(),
            bold('Summary', { fontSize: 12, margin: [0, 4, 0, 4] }),
            {
              table: {
                widths: [150, '*'],
                body: summaryRows.map(([label, value]) => [label, value]),
              },
              layout: 'noBorders',
              margin: [0, 0, 0, 6],
            },
            hrLine(),
            bold('Load Breakdown', { fontSize: 12, margin: [0, 4, 0, 2] }),
            loadTable,
            bold('Airflow Branch Profile', { fontSize: 12, margin: [0, 2, 0, 2] }),
            branchTable,
            bold('Equipment Shortlist', { fontSize: 12, margin: [0, 2, 0, 2] }),
            candidateTable,
          ],
          pageSize: 'A4',
          defaultStyle: { font: 'Roboto' },
        },
        `hvac-report-${slugify(loadInputs.projectName)}.pdf`,
      );

      showToast('success', 'PDF exported', 'Engineering report PDF downloaded successfully.');
    } catch (error) {
      console.error(error);
      showToast('error', 'PDF export failed');
    } finally {
      setExporting(null);
    }
  }, [
    airflowResult,
    equipmentResult.candidates,
    loadBreakdownData,
    loadInputs.projectName,
    loadInputs.spaceType,
    loadResult.breakdown.cfmRequired,
    loadResult.breakdown.totalBtuAfterFactors,
    loadResult.breakdown.trRequired,
    selectedCandidate,
  ]);

  const exportExcel = React.useCallback(async () => {
    setExporting('excel');
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'HVAC Auto Estimation';
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRow(['HVAC Integrated Engineering Report']);
      summarySheet.addRow(['Project', loadInputs.projectName]);
      summarySheet.addRow(['Space Type', loadInputs.spaceType]);
      summarySheet.addRow(['Design Load (BTU/h)', loadResult.breakdown.totalBtuAfterFactors]);
      summarySheet.addRow(['Cooling Tonnage (TR)', loadResult.breakdown.trRequired]);
      summarySheet.addRow(['Airflow Demand (CFM)', loadResult.breakdown.cfmRequired]);
      summarySheet.addRow(['Total Static Pressure (in.wg)', airflowResult.totalStaticPressureInWg]);
      summarySheet.addRow(['Fan Power (HP)', airflowResult.requiredFanPowerHp]);
      summarySheet.addRow(['Selected Equipment', selectedCandidate?.model ?? 'None']);
      summarySheet.addRow(['Equipment Capex', selectedCandidate?.capexPhp ?? 0]);
      summarySheet.addRow(['5-Year Lifecycle', selectedCandidate?.totalLifecyclePhp ?? 0]);
      summarySheet.getRow(1).font = { bold: true, size: 14 };
      summarySheet.getColumn(1).width = 32;
      summarySheet.getColumn(2).width = 30;

      const loadSheet = workbook.addWorksheet('Load Breakdown');
      loadSheet.addRow(['Component', 'BTU/h']);
      loadSheet.getRow(1).font = { bold: true };
      loadBreakdownData.forEach((item) => loadSheet.addRow([item.component, item.btu]));
      loadSheet.getColumn(1).width = 22;
      loadSheet.getColumn(2).width = 18;

      const airflowSheet = workbook.addWorksheet('Airflow Branches');
      airflowSheet.addRow(['Branch', 'Design CFM', 'Velocity (FPM)', 'Round Diameter (in)', 'Rectangular', 'Pressure Drop (in.wg)']);
      airflowSheet.getRow(1).font = { bold: true };
      airflowResult.branchRows.forEach((row) => {
        airflowSheet.addRow([
          row.branch,
          row.designCfm,
          row.velocityFpm,
          row.roundDiameterIn,
          row.rectangularSizeIn,
          row.pressureDropInWg,
        ]);
      });
      airflowSheet.columns.forEach((column) => {
        column.width = 18;
      });

      const equipmentSheet = workbook.addWorksheet('Equipment Candidates');
      equipmentSheet.addRow([
        'ID',
        'Model',
        'Type',
        'Qty',
        'Provided TR',
        'Utilization %',
        'Capex',
        'Annual Energy Cost',
        'Lifecycle',
        'Score',
      ]);
      equipmentSheet.getRow(1).font = { bold: true };
      equipmentResult.candidates.forEach((candidate) => {
        equipmentSheet.addRow([
          candidate.id,
          candidate.model,
          candidate.type,
          candidate.quantity,
          candidate.providedTr,
          candidate.utilizationPct,
          candidate.capexPhp,
          candidate.annualEnergyCostPhp,
          candidate.totalLifecyclePhp,
          candidate.score,
        ]);
      });
      equipmentSheet.columns.forEach((column) => {
        column.width = 18;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob(
        [buffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `hvac-report-${slugify(loadInputs.projectName)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);

      showToast('success', 'Excel exported', 'Multi-sheet engineering workbook downloaded.');
    } catch (error) {
      console.error(error);
      showToast('error', 'Excel export failed');
    } finally {
      setExporting(null);
    }
  }, [
    airflowResult,
    equipmentResult.candidates,
    loadBreakdownData,
    loadInputs.projectName,
    loadInputs.spaceType,
    loadResult.breakdown.cfmRequired,
    loadResult.breakdown.totalBtuAfterFactors,
    loadResult.breakdown.trRequired,
    selectedCandidate,
  ]);

  return (
    <div className="space-y-8 lg:space-y-10">
      <input
        ref={snapshotInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          void handleSnapshotFileSelected(event);
        }}
      />

      <Card
        title="Engineering Reports"
        subtitle="Live report surface combining load, airflow, and equipment modules"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void exportWorkspaceSnapshot()} loading={snapshotTransfer === 'export'}>
              <Download size={14} />
              Export Snapshot
            </Button>
            <Button variant="secondary" size="sm" onClick={triggerSnapshotImport} loading={snapshotTransfer === 'import'}>
              <Upload size={14} />
              Import Snapshot
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportPdf()} loading={exporting === 'pdf'}>
              <FileText size={14} />
              Export PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportExcel()} loading={exporting === 'excel'}>
              <FileSpreadsheet size={14} />
              Export Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} loading={exporting === 'csv'}>
              <FileDown size={14} />
              Export CSV
            </Button>
            <Button size="sm" onClick={() => void exportJson()} loading={exporting === 'json'}>
              <Download size={14} />
              Export JSON
            </Button>
          </div>
        }
      >
        <div className="grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Design Load</p>
            <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
              {loadResult.breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h
            </p>
          </div>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Total Static</p>
            <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
              {airflowResult.totalStaticPressureInWg.toFixed(2)} in.wg
            </p>
          </div>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">Selected Lifecycle</p>
            <p className="mt-1.5 text-[2.05rem] font-extrabold leading-tight tabular-nums text-[color:var(--foreground)]">
              {toPhp(selectedCandidate?.totalLifecyclePhp ?? 0)}
            </p>
          </div>
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card title="Load Breakdown" subtitle="BTU contribution by source">
          <div className="h-[300px] w-full">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={loadBreakdownData} margin={{ top: 6, right: 12, bottom: 6, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                  <XAxis dataKey="component" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <Tooltip />
                  <Bar dataKey="btu" name="BTU/h" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
            )}
          </div>
        </Card>

        <Card title="Branch Velocity" subtitle="Velocity and pressure drop across branches">
          <div className="h-[300px] w-full">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={branchVelocityData} margin={{ top: 6, right: 12, bottom: 6, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                  <XAxis dataKey="branch" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="velocityFpm" name="Velocity (FPM)" stroke="var(--brand-copper)" strokeWidth={2.4} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="pressureDropInWg" name="Pressure Drop (in.wg)" stroke="var(--accent)" strokeWidth={2.4} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
            )}
          </div>
        </Card>

        <Card title="Equipment Ranking" subtitle="Shortlist score and utilization">
          <div className="h-[300px] w-full">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equipmentScoreData} margin={{ top: 6, right: 12, bottom: 6, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab,var(--border) 78%,transparent)" />
                  <XAxis dataKey="id" tick={{ fontSize: 9 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="color-mix(in oklab,var(--muted-foreground) 80%,transparent)" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="score" name="Score" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="right" dataKey="utilizationPct" name="Utilization %" fill="var(--brand-copper)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">Preparing chart...</div>
            )}
          </div>
        </Card>
      </section>

      <CollapsiblePanel
        title="Cross-Module Snapshot"
        subtitle="Key values that drive generated exports"
        defaultOpen
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted-foreground)]">
            <p className="font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">Load Module</p>
            <p className="mt-1">Project: {loadInputs.projectName}</p>
            <p>Space Type: {loadInputs.spaceType}</p>
            <p>Required TR: {loadResult.breakdown.trRequired.toFixed(2)}</p>
            <p>Required CFM: {loadResult.breakdown.cfmRequired.toLocaleString()}</p>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted-foreground)]">
            <p className="font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">Airflow Module</p>
            <p className="mt-1">Supply CFM: {airflowInputs.supplyCfm.toLocaleString()}</p>
            <p>Branches: {airflowInputs.branches}</p>
            <p>Trunk Duct: {airflowResult.trunkDiameterIn} in</p>
            <p>Fan HP: {airflowResult.requiredFanPowerHp.toFixed(2)}</p>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted-foreground)]">
            <p className="font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">Equipment Module</p>
            <p className="mt-1">Budget: {equipmentInputs.budgetBand}</p>
            <p>Priority: {equipmentInputs.optimizationPriority}</p>
            <p>Selected: {selectedCandidate?.model ?? 'No candidate'}</p>
            <p>Lifecycle: {toPhp(selectedCandidate?.totalLifecyclePhp ?? 0)}</p>
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Formula Transparency"
        subtitle="Combined formula traces from load, airflow, and equipment engines"
        defaultOpen={isProfessional}
      >
        {isProfessional ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-[color:var(--muted-foreground)]">Load Equations</p>
              <div className="space-y-3">
                {loadResult.formulas.map((formula) => (
                  <div key={`load-${formula.label}`} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">{formula.label}</p>
                    <p className="mt-1 font-mono text-xs text-[color:var(--muted-foreground)]">{formula.expression}</p>
                    <p className="mt-1.5 text-xs font-semibold text-[color:var(--accent)]">{formula.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-[color:var(--muted-foreground)]">Airflow Equations</p>
              <div className="space-y-3">
                {airflowResult.formulas.map((formula) => (
                  <div key={`air-${formula.label}`} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">{formula.label}</p>
                    <p className="mt-1 font-mono text-xs text-[color:var(--muted-foreground)]">{formula.expression}</p>
                    <p className="mt-1.5 text-xs font-semibold text-[color:var(--accent)]">{formula.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-[color:var(--muted-foreground)]">Equipment Equations</p>
              <div className="space-y-3">
                {equipmentResult.formulas.map((formula) => (
                  <div key={`equip-${formula.label}`} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--foreground)]">{formula.label}</p>
                    <p className="mt-1 font-mono text-xs text-[color:var(--muted-foreground)]">{formula.expression}</p>
                    <p className="mt-1.5 text-xs font-semibold text-[color:var(--accent)]">{formula.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted-foreground)]">
            <Info size={14} className="mt-0.5 shrink-0" />
            Formula traces are available in Professional mode.
          </div>
        )}
      </CollapsiblePanel>

      {(loadResult.alerts.length > 0 || airflowResult.alerts.length > 0 || equipmentResult.alerts.length > 0) && (
        <Card title="Advisories" subtitle="Cross-module warnings and checks">
          <div className="space-y-2 rounded-xl border border-[color:var(--warning)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--foreground)]">
            {loadResult.alerts.map((alert) => (
              <p key={`load-alert-${alert}`}>Load: {alert}</p>
            ))}
            {airflowResult.alerts.map((alert) => (
              <p key={`air-alert-${alert}`}>Airflow: {alert}</p>
            ))}
            {equipmentResult.alerts.map((alert) => (
              <p key={`equip-alert-${alert}`}>Equipment: {alert}</p>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}