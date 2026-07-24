'use client';

import React from 'react';
import { showToast } from '@/components/ui/toast';
import { buildWorkspaceSnapshot, parseWorkspaceSnapshot } from '@/lib/reports/workspace-snapshot';
import { safeJsonParse } from '@/lib/utils/safe-json';
import {
  exportSimulationReportCsv,
  exportSimulationReportJson,
  exportSimulationReportPdf,
} from '@/lib/reports/simulation-report';
import {
  backfillLegacySimulationReportHistory,
  clearSimulationReportHistory,
  listSimulationReportHistory,
  type SimulationReportHistoryEntry,
} from '@/lib/reports/simulation-report-history';
import {
  calculateTotalProjectCost,
  type CostBreakdown,
} from '@/lib/engine/pricing-engine';
import { useAirflowWorkspaceStore } from '@/stores/airflow-workspace-store';
import { useEquipmentWorkspaceStore } from '@/stores/equipment-workspace-store';
import { useLoadWorkspaceStore } from '@/stores/load-workspace-store';
import { csvEscape, downloadTextFile, slugify, toPhp } from './helpers';
import {
  BACKFILL_STATUS_STORAGE_KEY,
  normalizeBackfillRunStatus,
  type BackfillRunStatus,
} from './backfill-status';

/**
 * Owns all reporting state, cross-module store wiring, derived chart data,
 * and every export path (JSON / CSV / PDF / Excel / snapshot / history).
 * Extracted verbatim from the former monolith page — behavior unchanged.
 */
export function useReportsWorkspace() {
  const [chartsReady, setChartsReady] = React.useState(false);
  const [exporting, setExporting] = React.useState<null | 'pdf' | 'excel' | 'csv' | 'json'>(null);
  const [snapshotTransfer, setSnapshotTransfer] = React.useState<null | 'export' | 'import'>(null);
  const [historyAction, setHistoryAction] = React.useState<null | 'refresh' | 'clear' | 'backfill'>(null);
  const [historyExporting, setHistoryExporting] = React.useState<null | { id: string; format: 'pdf' | 'csv' | 'json' }>(null);
  const [simulationReportHistory, setSimulationReportHistory] = React.useState<SimulationReportHistoryEntry[]>([]);
  const [lastBackfillRun, setLastBackfillRun] = React.useState<BackfillRunStatus | null>(null);
  const [backfillStatusHydrated, setBackfillStatusHydrated] = React.useState(false);
  const snapshotInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setChartsReady(true);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(BACKFILL_STATUS_STORAGE_KEY);
    const parsed = safeJsonParse<unknown>(raw);
    setLastBackfillRun(normalizeBackfillRunStatus(parsed));
    setBackfillStatusHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!backfillStatusHydrated || typeof window === 'undefined') return;

    if (!lastBackfillRun) {
      window.localStorage.removeItem(BACKFILL_STATUS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(BACKFILL_STATUS_STORAGE_KEY, JSON.stringify(lastBackfillRun));
  }, [backfillStatusHydrated, lastBackfillRun]);

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

  // Compute full project cost via pricing engine
  const costBreakdown: CostBreakdown | null = React.useMemo(() => {
    if (!selectedCandidate) return null;
    return calculateTotalProjectCost({
      equipment: [
        {
          manufacturer: selectedCandidate.model.split(' ')[0] ?? 'Unknown',
          unitPricePHP: selectedCandidate.capexPhp / Math.max(1, selectedCandidate.quantity),
          quantity: selectedCandidate.quantity,
          type: selectedCandidate.type,
        },
      ],
    });
  }, [selectedCandidate]);

  const loadBreakdownData = React.useMemo(
    () => [
      { component: 'Envelope', btu: loadResult.breakdown.envelopeBtu },
      { component: 'People (Sensible)', btu: loadResult.breakdown.peopleSensibleBtu },
      { component: 'People (Latent)', btu: loadResult.breakdown.peopleLatentBtu },
      { component: 'Lighting', btu: loadResult.breakdown.lightingBtu },
      { component: 'Equipment', btu: loadResult.breakdown.equipmentBtu },
      { component: 'Ventilation (Sensible)', btu: loadResult.breakdown.ventilationSensibleBtu },
      { component: 'Ventilation (Latent)', btu: loadResult.breakdown.ventilationLatentBtu },
    ],
    [
      loadResult.breakdown.envelopeBtu,
      loadResult.breakdown.equipmentBtu,
      loadResult.breakdown.lightingBtu,
      loadResult.breakdown.peopleSensibleBtu,
      loadResult.breakdown.peopleLatentBtu,
      loadResult.breakdown.ventilationSensibleBtu,
      loadResult.breakdown.ventilationLatentBtu,
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

  const refreshSimulationHistory = React.useCallback(async () => {
    setHistoryAction('refresh');
    try {
      const history = await listSimulationReportHistory({ limit: 100 });
      setSimulationReportHistory(history);
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to load simulation export history');
    } finally {
      setHistoryAction(null);
    }
  }, []);

  React.useEffect(() => {
    void refreshSimulationHistory();
  }, [refreshSimulationHistory]);

  const legacyPayloadMissingCount = React.useMemo(
    () => simulationReportHistory.filter((entry) => !entry.report).length,
    [simulationReportHistory],
  );

  const clearHistory = React.useCallback(async () => {
    setHistoryAction('clear');
    try {
      const deletedCount = await clearSimulationReportHistory();
      const plural = deletedCount === 1 ? 'entry' : 'entries';
      setSimulationReportHistory([]);
      showToast('success', 'Simulation export history cleared', `${deletedCount} ${plural} removed.`);
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to clear simulation export history');
    } finally {
      setHistoryAction(null);
    }
  }, []);

  const backfillHistory = React.useCallback(async () => {
    setHistoryAction('backfill');
    try {
      const result = await backfillLegacySimulationReportHistory();
      const history = await listSimulationReportHistory({ limit: 100 });
      setSimulationReportHistory(history);
      setLastBackfillRun({
        attemptedAt: new Date().toISOString(),
        checkedCount: result.checkedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        ok: true,
      });

      if (result.updatedCount > 0) {
        const plural = result.updatedCount === 1 ? 'entry' : 'entries';
        showToast(
          'success',
          'Legacy payload backfill complete',
          `${result.updatedCount} ${plural} updated, ${result.skippedCount} skipped (${result.checkedCount} records checked).`,
        );
      } else {
        showToast(
          'success',
          'No legacy payloads found',
          `${result.skippedCount} records skipped because payloads already exist.`,
        );
      }
    } catch (error) {
      setLastBackfillRun({
        attemptedAt: new Date().toISOString(),
        checkedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown backfill error',
      });
      console.error(error);
      showToast('error', 'Failed to backfill legacy export history');
    } finally {
      setHistoryAction(null);
    }
  }, []);

  const exportHistoryEntry = React.useCallback(async (
    entry: SimulationReportHistoryEntry,
    format: 'pdf' | 'csv' | 'json',
  ) => {
    if (!entry.report) {
      showToast(
        'warning',
        'Report payload unavailable',
        'This export record was created before server payload persistence was enabled.',
      );
      return;
    }

    setHistoryExporting({ id: entry.id, format });
    try {
      if (format === 'pdf') {
        await exportSimulationReportPdf(entry.report);
      } else if (format === 'csv') {
        exportSimulationReportCsv(entry.report);
      } else {
        exportSimulationReportJson(entry.report);
      }

      showToast('success', `${format.toUpperCase()} exported`, `Re-exported ${entry.projectName}.`);
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to export history report');
    } finally {
      setHistoryExporting(null);
    }
  }, []);

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

  return {
    // refs
    snapshotInputRef,
    // ui state
    chartsReady,
    exporting,
    snapshotTransfer,
    historyAction,
    historyExporting,
    simulationReportHistory,
    lastBackfillRun,
    legacyPayloadMissingCount,
    // module data
    loadInputs,
    loadResult,
    airflowInputs,
    airflowResult,
    equipmentInputs,
    equipmentResult,
    selectedCandidate,
    costBreakdown,
    // chart data
    loadBreakdownData,
    branchVelocityData,
    equipmentScoreData,
    // actions
    exportJson,
    exportCsv,
    exportPdf,
    exportExcel,
    exportWorkspaceSnapshot,
    triggerSnapshotImport,
    handleSnapshotFileSelected,
    refreshSimulationHistory,
    clearHistory,
    backfillHistory,
    exportHistoryEntry,
  };
}
