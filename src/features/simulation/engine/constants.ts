import type { CaseStatus, FieldName } from '@/types/simulation';

export const SNAPSHOT_FIELD_OPTIONS: FieldName[] = [
  'temperature',
  'velocity',
  'pressure',
  'humidity',
  'turbulentViscosity',
];

export const SNAPSHOT_PREVIEW_MODES: Array<'temperature' | 'velocity' | 'pressure' | 'humidity'> = [
  'temperature',
  'velocity',
  'pressure',
  'humidity',
];

/**
 * Persisted snapshot-viewer UI prefs. Changing this string silently resets
 * every user's saved preview mode and per-case timeline position.
 */
export const SNAPSHOT_UI_PREFS_STORAGE_KEY = 'hvac-simulation-engine-snapshot-ui:v1';

export const STATUS_CONFIG: Record<
  CaseStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  meshed: { label: 'Meshed', variant: 'outline' },
  queued: { label: 'Queued', variant: 'default' },
  running: { label: 'Running', variant: 'default' },
  completed: { label: 'Completed', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  imported: { label: 'Imported', variant: 'outline' },
};
