'use client';

/**
 * Simulation Engine Workspace — Case Management & CFD Execution
 *
 * Left:   Case list + geometry builder + physics/solver config
 * Center: 3D mesh preview + contour slice viewer
 * Right:  Run control, residual convergence, export/import
 */
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// Ambient wireframe for the zero state — client-only (WebGL), no data.
const AmbientWireframe = dynamic(() => import('@/components/simulation/r3f/AmbientWireframe'), {
  ssr: false,
});

import { CaseListPanel } from '@/features/simulation/engine/components/CaseListPanel';
import { CaseSummaryPanel } from '@/features/simulation/engine/components/CaseSummaryPanel';
import { SnapshotPanel } from '@/features/simulation/engine/components/SnapshotPanel';
import { RunActionsPanel } from '@/features/simulation/engine/components/RunActionsPanel';
import { useSimulationEngine } from '@/features/simulation/engine/useSimulationEngine';

// ─── Main Page ──────────────────────────────────────────────────────

export default function SimulationEnginePage() {
  const {
    projectId,
    cases,
    isLoadingCases,
    loadCases,
    activeCase,
    selectCase,
    deleteCase,
    activeRun,
    runHistory,
    startRun,
    loadRunHistory,
    loadRunSnapshots,
    runSnapshots,
    selectedSnapshotIteration,
    activeSnapshot,
    isPolling,
    isLoadingSnapshots,
    isLoadingSnapshotDetail,
    loadSnapshotIteration,
    importResults,
    isExporting,
    isImporting,
    contourSlices,
    addContourSlice,
    removeContourSlice,
    updateContourSlice,
    engineeringTierAvailable,
    engineeringTierReason,
    selectedProjectId,
    setSelectedProjectId,
    showCreateForm,
    setShowCreateForm,
    newCaseName,
    setNewCaseName,
    newCaseInputRef,
    snapshotPreviewMode,
    setSnapshotPreviewMode,
    snapshotAutoLoadPreviewField,
    setSnapshotAutoLoadPreviewField,
    useR3FViewer,
    setUseR3FViewer,
    showSnapshotTimelineHelpNote,
    setShowSnapshotTimelineHelpNote,
    snapshotPrefsSaveStatus,
    snapshotFieldLoadingMap,
    snapshotFieldErrorMap,
    hasInteractedWithSnapshotPrefsRef,
    projects,
    selectedSnapshotSeeds,
    snapshotRun,
    snapshotIterationOptions,
    loadedSnapshotFields,
    availableSnapshotFields,
    snapshotPreviewField,
    isSnapshotPreviewFieldLoaded,
    isSnapshotPreviewFieldAvailable,
    isSnapshotPreviewFieldLoading,
    snapshotPreviewFieldError,
    failedSnapshotFieldNames,
    isRetryingFailedFields,
    requestSnapshotField,
    retryFailedSnapshotFields,
    selectSnapshotIteration,
    handleSnapshotIterationKeyDown,
    snapshotPreviewResult,
    snapshotStreamlineSeedPoints,
    snapshotTileFlowView,
    snapshotSliceZ,
    geometry,
    setGeometry,
    handleLoadProject,
    handleCreateCase,
    handleExport,
  } = useSimulationEngine();

  // Stacks below xl. The three panels are 320px + fluid + 256px, which does not
  // fit any phone — this page had no mobile layout at all and simply overflowed
  // sideways. Stacked, the whole column scrolls instead.
  return (
    <div className="flex flex-col gap-4 p-4 xl:h-[calc(100dvh-4rem)] xl:flex-row">
      {/* ── Left Panel: Cases & Config ──────────────────────── */}
      <CaseListPanel
        projectId={projectId}
        cases={cases}
        isLoadingCases={isLoadingCases}
        loadCases={loadCases}
        activeCase={activeCase}
        selectCase={selectCase}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        showCreateForm={showCreateForm}
        setShowCreateForm={setShowCreateForm}
        newCaseName={newCaseName}
        setNewCaseName={setNewCaseName}
        newCaseInputRef={newCaseInputRef}
        projects={projects}
        geometry={geometry}
        setGeometry={setGeometry}
        handleLoadProject={handleLoadProject}
        handleCreateCase={handleCreateCase}
      />

      {/* ── Center Panel: Case Details & Mesh Preview ──────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 xl:overflow-y-auto">
        {!activeCase ? (
          <EmptyState
            className="flex-1 border-none bg-transparent py-10"
            ghostPreview
            illustration={<AmbientWireframe className="h-full w-full" />}
            title={cases.length === 0 ? 'No simulation cases yet' : 'Select a simulation case'}
            description={
              cases.length === 0
                ? 'Define a room, pick a solver tier, and run airflow + thermal comfort in the browser.'
                : 'Choose a case from the list, or spin up a new one to preview the field here.'
            }
            action={
              <Button
                onClick={() => {
                  setShowCreateForm(true);
                  requestAnimationFrame(() => newCaseInputRef.current?.focus());
                }}
                disabled={!projectId}
              >
                <Plus size={14} /> Create your first simulation case
              </Button>
            }
          />
        ) : (
          <>
            <CaseSummaryPanel
              activeCase={activeCase}
              deleteCase={deleteCase}
              activeRun={activeRun}
            />

            <SnapshotPanel
              activeCase={activeCase}
              runHistory={runHistory}
              loadRunHistory={loadRunHistory}
              loadRunSnapshots={loadRunSnapshots}
              runSnapshots={runSnapshots}
              selectedSnapshotIteration={selectedSnapshotIteration}
              activeSnapshot={activeSnapshot}
              isLoadingSnapshots={isLoadingSnapshots}
              isLoadingSnapshotDetail={isLoadingSnapshotDetail}
              loadSnapshotIteration={loadSnapshotIteration}
              snapshotPreviewMode={snapshotPreviewMode}
              setSnapshotPreviewMode={setSnapshotPreviewMode}
              snapshotAutoLoadPreviewField={snapshotAutoLoadPreviewField}
              setSnapshotAutoLoadPreviewField={setSnapshotAutoLoadPreviewField}
              useR3FViewer={useR3FViewer}
              setUseR3FViewer={setUseR3FViewer}
              showSnapshotTimelineHelpNote={showSnapshotTimelineHelpNote}
              setShowSnapshotTimelineHelpNote={setShowSnapshotTimelineHelpNote}
              snapshotPrefsSaveStatus={snapshotPrefsSaveStatus}
              snapshotFieldLoadingMap={snapshotFieldLoadingMap}
              snapshotFieldErrorMap={snapshotFieldErrorMap}
              hasInteractedWithSnapshotPrefsRef={hasInteractedWithSnapshotPrefsRef}
              selectedSnapshotSeeds={selectedSnapshotSeeds}
              snapshotRun={snapshotRun}
              snapshotIterationOptions={snapshotIterationOptions}
              loadedSnapshotFields={loadedSnapshotFields}
              availableSnapshotFields={availableSnapshotFields}
              snapshotPreviewField={snapshotPreviewField}
              isSnapshotPreviewFieldLoaded={isSnapshotPreviewFieldLoaded}
              isSnapshotPreviewFieldAvailable={isSnapshotPreviewFieldAvailable}
              isSnapshotPreviewFieldLoading={isSnapshotPreviewFieldLoading}
              snapshotPreviewFieldError={snapshotPreviewFieldError}
              failedSnapshotFieldNames={failedSnapshotFieldNames}
              isRetryingFailedFields={isRetryingFailedFields}
              requestSnapshotField={requestSnapshotField}
              retryFailedSnapshotFields={retryFailedSnapshotFields}
              selectSnapshotIteration={selectSnapshotIteration}
              handleSnapshotIterationKeyDown={handleSnapshotIterationKeyDown}
              snapshotPreviewResult={snapshotPreviewResult}
              snapshotStreamlineSeedPoints={snapshotStreamlineSeedPoints}
              snapshotTileFlowView={snapshotTileFlowView}
              snapshotSliceZ={snapshotSliceZ}
            />
          </>
        )}
      </div>

      {/* ── Right Panel: Actions & Export/Import ───────────── */}
      <RunActionsPanel
        activeCase={activeCase}
        startRun={startRun}
        loadRunHistory={loadRunHistory}
        isPolling={isPolling}
        importResults={importResults}
        isExporting={isExporting}
        isImporting={isImporting}
        contourSlices={contourSlices}
        addContourSlice={addContourSlice}
        removeContourSlice={removeContourSlice}
        updateContourSlice={updateContourSlice}
        handleExport={handleExport}
        engineeringTierAvailable={engineeringTierAvailable}
        engineeringTierReason={engineeringTierReason}
      />
    </div>
  );
}
