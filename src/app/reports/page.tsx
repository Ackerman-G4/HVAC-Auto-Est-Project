'use client';

import { useReportsWorkspace } from '@/features/reports/useReportsWorkspace';
import { ReportsHeader } from '@/features/reports/components/ReportsHeader';
import { SimulationExportHistoryPanel } from '@/features/reports/components/SimulationExportHistoryPanel';
import { ReportsKpiRow } from '@/features/reports/components/ReportsKpiRow';
import { ReportsCharts } from '@/features/reports/components/ReportsCharts';
import { CrossModuleSnapshot } from '@/features/reports/components/CrossModuleSnapshot';
import { FormulaTransparency } from '@/features/reports/components/FormulaTransparency';
import { AdvisoriesCard } from '@/features/reports/components/AdvisoriesCard';

export default function ReportsPage() {
  const {
    snapshotInputRef,
    chartsReady,
    exporting,
    snapshotTransfer,
    historyAction,
    historyExporting,
    simulationReportHistory,
    lastBackfillRun,
    legacyPayloadMissingCount,
    loadInputs,
    loadResult,
    airflowInputs,
    airflowResult,
    equipmentInputs,
    equipmentResult,
    selectedCandidate,
    costBreakdown,
    loadBreakdownData,
    branchVelocityData,
    equipmentScoreData,
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
  } = useReportsWorkspace();

  return (
    <div className="space-y-(--space-section-gap)">
      <input
        ref={snapshotInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Import snapshot file"
        onChange={(event) => {
          void handleSnapshotFileSelected(event);
        }}
      />

      <ReportsHeader
        exporting={exporting}
        snapshotTransfer={snapshotTransfer}
        onExportSnapshot={() => void exportWorkspaceSnapshot()}
        onImportSnapshot={triggerSnapshotImport}
        onExportPdf={() => void exportPdf()}
        onExportExcel={() => void exportExcel()}
        onExportCsv={() => void exportCsv()}
        onExportJson={() => void exportJson()}
      />

      <SimulationExportHistoryPanel
        historyAction={historyAction}
        historyExporting={historyExporting}
        simulationReportHistory={simulationReportHistory}
        lastBackfillRun={lastBackfillRun}
        legacyPayloadMissingCount={legacyPayloadMissingCount}
        onRefresh={() => void refreshSimulationHistory()}
        onBackfill={() => void backfillHistory()}
        onClear={() => void clearHistory()}
        onExportEntry={(entry, format) => void exportHistoryEntry(entry, format)}
      />

      <ReportsKpiRow
        loadResult={loadResult}
        airflowResult={airflowResult}
        selectedCandidate={selectedCandidate}
        costBreakdown={costBreakdown}
      />

      <ReportsCharts
        chartsReady={chartsReady}
        loadBreakdownData={loadBreakdownData}
        branchVelocityData={branchVelocityData}
        equipmentScoreData={equipmentScoreData}
      />

      <CrossModuleSnapshot
        loadInputs={loadInputs}
        loadResult={loadResult}
        airflowInputs={airflowInputs}
        airflowResult={airflowResult}
        equipmentInputs={equipmentInputs}
        selectedCandidate={selectedCandidate}
      />

      <FormulaTransparency
        loadResult={loadResult}
        airflowResult={airflowResult}
        equipmentResult={equipmentResult}
      />

      <AdvisoriesCard
        loadResult={loadResult}
        airflowResult={airflowResult}
        equipmentResult={equipmentResult}
      />
    </div>
  );
}
