import type { useSimulationEngine } from '../useSimulationEngine';
import { RefreshCw, BarChart3, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SimulationCanvas from '@/components/simulation/r3f/SimulationCanvas';
import AirflowViewer3D from '@/components/building/AirflowViewer3D';
import { SNAPSHOT_FIELD_OPTIONS } from '../constants';
import { SNAPSHOT_PREVIEW_MODES } from '../constants';

type SnapshotPanelProps = Pick<
  ReturnType<typeof useSimulationEngine>,
  | 'activeCase'
  | 'runHistory'
  | 'loadRunHistory'
  | 'loadRunSnapshots'
  | 'runSnapshots'
  | 'selectedSnapshotIteration'
  | 'activeSnapshot'
  | 'isLoadingSnapshots'
  | 'isLoadingSnapshotDetail'
  | 'loadSnapshotIteration'
  | 'snapshotPreviewMode'
  | 'setSnapshotPreviewMode'
  | 'snapshotAutoLoadPreviewField'
  | 'setSnapshotAutoLoadPreviewField'
  | 'useR3FViewer'
  | 'setUseR3FViewer'
  | 'showSnapshotTimelineHelpNote'
  | 'setShowSnapshotTimelineHelpNote'
  | 'snapshotPrefsSaveStatus'
  | 'snapshotFieldLoadingMap'
  | 'snapshotFieldErrorMap'
  | 'hasInteractedWithSnapshotPrefsRef'
  | 'selectedSnapshotSeeds'
  | 'snapshotRun'
  | 'snapshotIterationOptions'
  | 'loadedSnapshotFields'
  | 'availableSnapshotFields'
  | 'snapshotPreviewField'
  | 'isSnapshotPreviewFieldLoaded'
  | 'isSnapshotPreviewFieldAvailable'
  | 'isSnapshotPreviewFieldLoading'
  | 'snapshotPreviewFieldError'
  | 'failedSnapshotFieldNames'
  | 'isRetryingFailedFields'
  | 'requestSnapshotField'
  | 'retryFailedSnapshotFields'
  | 'selectSnapshotIteration'
  | 'handleSnapshotIterationKeyDown'
  | 'snapshotPreviewResult'
  | 'snapshotStreamlineSeedPoints'
  | 'snapshotTileFlowView'
  | 'snapshotSliceZ'
>;

export function SnapshotPanel({
  activeCase,
  runHistory,
  loadRunHistory,
  loadRunSnapshots,
  runSnapshots,
  selectedSnapshotIteration,
  activeSnapshot,
  isLoadingSnapshots,
  isLoadingSnapshotDetail,
  loadSnapshotIteration,
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
}: SnapshotPanelProps) {
  return (
    <>
            {/* Snapshot Timeline */}
            {(snapshotRun || runSnapshots.length > 0 || isLoadingSnapshots) && (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <BarChart3 size={14} /> Snapshot Timeline
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                      {snapshotPrefsSaveStatus === 'error'
                        ? 'Snapshot preference save failed.'
                        : snapshotPrefsSaveStatus === 'saved'
                          ? 'Snapshot preferences saved.'
                          : ''}
                    </span>
                    {snapshotPrefsSaveStatus !== 'idle' && (
                      <span className={`text-[10px] ${snapshotPrefsSaveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {snapshotPrefsSaveStatus === 'error' ? 'Preference save failed' : 'Preferences saved'}
                      </span>
                    )}
                    {snapshotRun && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        Run {snapshotRun.id.slice(0, 8)}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => activeCase && loadRunHistory()}
                      disabled={!activeCase}
                      aria-label="Refresh run history for snapshot timeline"
                      title="Refresh run history"
                    >
                      <RefreshCw size={12} className={isLoadingSnapshots ? 'animate-spin' : ''} />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Runs</span>
                    <p className="font-mono">{runHistory.length}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Snapshots</span>
                    <p className="font-mono">{runSnapshots.length}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Selected Iteration</span>
                    <p className="font-mono">{selectedSnapshotIteration ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Seed Cache</span>
                    <p className="font-mono">{selectedSnapshotSeeds.length}</p>
                  </div>
                </div>

                {showSnapshotTimelineHelpNote && (
                  <div className="mt-2 flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                    <p>
                      Timeline selection is saved per case in this browser. Preview field and auto-load settings are saved globally.
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        hasInteractedWithSnapshotPrefsRef.current = true;
                        setShowSnapshotTimelineHelpNote(false);
                      }}
                      aria-label="Dismiss snapshot timeline persistence help"
                      title="Dismiss this help note"
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
                  <select
                    value={snapshotRun?.id ?? ''}
                    onChange={(e) => {
                      const runId = e.target.value;
                      if (runId) {
                        hasInteractedWithSnapshotPrefsRef.current = true;
                        void loadRunSnapshots(runId);
                      }
                    }}
                    disabled={runHistory.length === 0 || isLoadingSnapshots}
                    aria-label="Select run for snapshot timeline"
                    title="Select run for snapshot timeline"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Select run...</option>
                    {runHistory.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.id.slice(0, 8)} · {run.status} · iter {run.currentIteration}/{run.totalIterations}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => snapshotRun && loadRunSnapshots(snapshotRun.id)}
                    disabled={!snapshotRun || isLoadingSnapshots}
                    aria-label={snapshotRun ? `Refresh snapshots for run ${snapshotRun.id.slice(0, 8)}` : 'Refresh snapshots'}
                    title="Refresh snapshots"
                  >
                    {isLoadingSnapshots ? (
                      <Loader2 size={12} className="mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw size={12} className="mr-1.5" />
                    )}
                    Refresh Snapshots
                  </Button>

                  <select
                    value={selectedSnapshotIteration ?? ''}
                    onChange={(e) => {
                      const iteration = Number(e.target.value);
                      selectSnapshotIteration(iteration);
                    }}
                    onKeyDown={handleSnapshotIterationKeyDown}
                    disabled={runSnapshots.length === 0 || isLoadingSnapshotDetail}
                    aria-label="Select snapshot iteration"
                    title="Select snapshot iteration (Home/End/PageUp/PageDown supported)"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Select iteration...</option>
                    {snapshotIterationOptions.map((iteration) => (
                      <option key={iteration} value={iteration}>
                        Iter {iteration}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (selectedSnapshotIteration !== null) {
                        void loadSnapshotIteration(selectedSnapshotIteration);
                      }
                    }}
                    disabled={selectedSnapshotIteration === null || isLoadingSnapshotDetail}
                    aria-label="Load full fields for selected snapshot iteration"
                    title="Load full fields for selected iteration"
                  >
                    {isLoadingSnapshotDetail ? (
                      <Loader2 size={12} className="mr-1.5 animate-spin" />
                    ) : null}
                    Load Full Fields
                  </Button>

                  <span className="text-[10px] text-muted-foreground">Iteration keys: Home / End / PageUp / PageDown</span>
                </div>

                {activeSnapshot && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-xs">
                    <span className="text-muted-foreground">Field Payloads</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void retryFailedSnapshotFields();
                      }}
                      disabled={
                        selectedSnapshotIteration === null
                        || failedSnapshotFieldNames.length === 0
                        || isRetryingFailedFields
                      }
                      className="h-7 px-2 text-[10px]"
                      aria-label={failedSnapshotFieldNames.length > 0
                        ? `Retry ${failedSnapshotFieldNames.length} failed snapshot fields`
                        : 'Retry failed snapshot fields'}
                      title="Retry failed snapshot field loads"
                    >
                      {isRetryingFailedFields ? <Loader2 size={10} className="mr-1 animate-spin" /> : null}
                      Retry Failed
                      {failedSnapshotFieldNames.length > 0 ? ` (${failedSnapshotFieldNames.length})` : ''}
                    </Button>
                    {SNAPSHOT_FIELD_OPTIONS.map((fieldName) => {
                      const isLoaded = loadedSnapshotFields.has(fieldName);
                      const isAvailable = availableSnapshotFields.has(fieldName);
                      const isLoading = Boolean(snapshotFieldLoadingMap[fieldName]);
                      const fieldError = snapshotFieldErrorMap[fieldName];
                      const fieldStatusLabel = isLoaded
                        ? 'loaded'
                        : isLoading
                          ? 'loading'
                          : fieldError
                            ? 'failed'
                            : isAvailable
                              ? 'not loaded'
                              : 'unavailable';
                      return (
                        <Button
                          key={fieldName}
                          size="sm"
                          variant={isLoaded ? 'secondary' : 'outline'}
                          onClick={() => {
                            if (selectedSnapshotIteration !== null && !isLoaded && isAvailable) {
                              void requestSnapshotField(selectedSnapshotIteration, fieldName);
                            }
                          }}
                          disabled={
                            selectedSnapshotIteration === null
                            || isLoading
                            || isLoaded
                            || !isAvailable
                          }
                          className={`h-7 px-2 text-[10px] ${fieldError ? 'border-red-500/50 text-red-600' : ''}`}
                          aria-label={`Snapshot field ${fieldName}, ${fieldStatusLabel}`}
                          title={`Snapshot field ${fieldName}, ${fieldStatusLabel}`}
                        >
                          {isLoading ? <Loader2 size={10} className="mr-1 animate-spin" /> : null}
                          {fieldName}
                          {isLoaded
                            ? ' · loaded'
                            : isLoading
                              ? ' · loading'
                              : fieldError
                                ? ' · failed'
                                : isAvailable
                                  ? ''
                                  : ' · n/a'}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {activeSnapshot && (
                  <div className="mt-2 grid grid-cols-4 gap-3 border-t border-border/50 pt-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Grid</span>
                      <p className="font-mono">
                        {activeSnapshot.meta.dimensions.nx}×{activeSnapshot.meta.dimensions.ny}×{activeSnapshot.meta.dimensions.nz}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Stride</span>
                      <p className="font-mono">{activeSnapshot.meta.sampleStride}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cells</span>
                      <p className="font-mono">{activeSnapshot.meta.cellCount.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Loaded Fields</span>
                      <p className="font-mono">{activeSnapshot.fields.map((field) => field.name).join(', ') || '—'}</p>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {snapshotPreviewResult && activeCase && (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Snapshot 3D Preview</h3>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Preview the new React Three Fiber viewer (plan §5)">
                      <input
                        type="checkbox"
                        checked={useR3FViewer}
                        onChange={(event) => setUseR3FViewer(event.target.checked)}
                        aria-label="Use new R3F viewer (beta)"
                      />
                      R3F viewer (beta)
                    </label>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      Iter {snapshotPreviewResult.iteration}
                    </Badge>
                  </div>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Streamline playback uses {snapshotStreamlineSeedPoints.length} cached velocity seeds from the selected snapshot.
                </p>
                <div className="mb-3 flex flex-wrap items-center gap-2 border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Preview Field</span>
                  <select
                    value={snapshotPreviewMode}
                    onChange={(event) => {
                      const mode = event.target.value as typeof snapshotPreviewMode;
                      hasInteractedWithSnapshotPrefsRef.current = true;
                      setSnapshotPreviewMode(mode);
                    }}
                    aria-label="Select snapshot preview field"
                    title="Select snapshot preview field"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {SNAPSHOT_PREVIEW_MODES.map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={snapshotAutoLoadPreviewField}
                      onChange={(event) => {
                        hasInteractedWithSnapshotPrefsRef.current = true;
                        setSnapshotAutoLoadPreviewField(event.target.checked);
                      }}
                      aria-label="Auto-load selected preview field"
                      title="Automatically load selected preview field when snapshot iteration changes"
                    />
                    Auto-load
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        selectedSnapshotIteration !== null
                        && !isSnapshotPreviewFieldLoaded
                        && isSnapshotPreviewFieldAvailable
                      ) {
                        void requestSnapshotField(selectedSnapshotIteration, snapshotPreviewField);
                      }
                    }}
                    disabled={
                      selectedSnapshotIteration === null
                      || isSnapshotPreviewFieldLoading
                      || isSnapshotPreviewFieldLoaded
                      || !isSnapshotPreviewFieldAvailable
                    }
                    aria-label={`Load preview field ${snapshotPreviewField}`}
                    title={`Load preview field ${snapshotPreviewField}`}
                  >
                    {isSnapshotPreviewFieldLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                    Load Preview Field
                  </Button>
                  <span className="text-muted-foreground">
                    {isSnapshotPreviewFieldLoading
                      ? 'Loading'
                      : isSnapshotPreviewFieldLoaded
                        ? 'Loaded'
                        : snapshotPreviewFieldError
                          ? snapshotPreviewFieldError
                          : isSnapshotPreviewFieldAvailable
                            ? 'Not loaded'
                            : 'Unavailable'}
                  </span>
                </div>
                <div className="canvas-ambient relative h-[360px] overflow-hidden rounded-md border border-border/60">
                  {/* Floating glass toolbar — view context stays next to what you're
                      looking at, not only in the far sidebar (plan §Phase 4). */}
                  <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
                    <span className="panel-glass rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-medium capitalize text-foreground shadow-sm">
                      {snapshotPreviewMode} field
                    </span>
                    <span className="panel-glass rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                      {useR3FViewer ? 'R3F viewer' : 'Legacy viewer'}
                    </span>
                  </div>
                  {useR3FViewer ? (
                    <SimulationCanvas
                      result={snapshotPreviewResult}
                      showTemperature={snapshotPreviewMode === 'temperature'}
                      showVelocity
                    />
                  ) : (
                    <AirflowViewer3D
                      result={snapshotPreviewResult}
                      racks={activeCase.geometry.racks}
                      hvacUnits={activeCase.geometry.hvacUnits}
                      showHotspots={false}
                      showAirflow={false}
                      selectedSliceZ={snapshotSliceZ}
                      viewMode={snapshotPreviewMode}
                      tileFlowView={snapshotTileFlowView}
                      streamlineSeedPoints={snapshotStreamlineSeedPoints}
                    />
                  )}
                </div>
              </Card>
            )}
    </>
  );
}
