import type { SNAPSHOT_PREVIEW_MODES } from './constants';

export type SnapshotPreviewMode = (typeof SNAPSHOT_PREVIEW_MODES)[number];

export interface SnapshotTimelinePreference {
  runId: string | null;
  iteration: number | null;
}

export interface SnapshotUiPreferences {
  previewMode: SnapshotPreviewMode;
  autoLoadPreviewField: boolean;
  timelineByCase?: Record<string, SnapshotTimelinePreference>;
  hideTimelineHelpNote?: boolean;
}

export type SnapshotDims = { nx: number; ny: number; nz: number };
