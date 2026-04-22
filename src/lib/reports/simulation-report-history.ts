import type { SimulationEngineeringReport } from '@/lib/reports/simulation-report';
import { authFetch } from '@/lib/api-client';

export type SimulationReportExportFormat = 'pdf' | 'csv' | 'json';
export type SimulationReportExportSource = 'viewer' | 'workspace';

export interface SimulationReportHistoryEntry {
  id: string;
  generatedAt: string;
  format: SimulationReportExportFormat;
  source: SimulationReportExportSource;
  projectId: string;
  projectName: string;
  floorId: string;
  runtimeMode: string;
  converged: boolean;
  maxTemperatureC: number;
  pue: number;
  hotspotCount: number;
  report: SimulationEngineeringReport | null;
}

export interface SimulationReportHistoryQuery {
  limit?: number;
  projectId?: string;
}

export interface SimulationReportHistoryBackfillResult {
  checkedCount: number;
  updatedCount: number;
  skippedCount: number;
}

function normalizeEntry(value: unknown): SimulationReportHistoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const format = entry.format;
  const source = entry.source;

  if (format !== 'pdf' && format !== 'csv' && format !== 'json') {
    return null;
  }

  if (source !== 'viewer' && source !== 'workspace') {
    return null;
  }

  const generatedAt = typeof entry.generatedAt === 'string' ? entry.generatedAt : new Date().toISOString();
  const report = entry.report && typeof entry.report === 'object' && !Array.isArray(entry.report)
    ? (entry.report as SimulationEngineeringReport)
    : null;

  return {
    id: typeof entry.id === 'string' ? entry.id : `${generatedAt}-${format}`,
    generatedAt,
    format,
    source,
    projectId: typeof entry.projectId === 'string' ? entry.projectId : 'unknown-project',
    projectName: typeof entry.projectName === 'string' ? entry.projectName : 'Simulation Project',
    floorId: typeof entry.floorId === 'string' ? entry.floorId : 'unknown-floor',
    runtimeMode: typeof entry.runtimeMode === 'string' ? entry.runtimeMode : 'worker',
    converged: entry.converged === true,
    maxTemperatureC: typeof entry.maxTemperatureC === 'number' ? entry.maxTemperatureC : 0,
    pue: typeof entry.pue === 'number' ? entry.pue : 0,
    hotspotCount: typeof entry.hotspotCount === 'number' ? entry.hotspotCount : 0,
    report,
  };
}

function buildQuery(query?: SimulationReportHistoryQuery): string {
  const params = new URLSearchParams();

  if (typeof query?.limit === 'number' && Number.isFinite(query.limit)) {
    params.set('limit', String(Math.max(1, Math.min(200, Math.trunc(query.limit)))));
  }

  if (typeof query?.projectId === 'string' && query.projectId.trim().length > 0) {
    params.set('projectId', query.projectId.trim());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export async function listSimulationReportHistory(
  query?: SimulationReportHistoryQuery,
): Promise<SimulationReportHistoryEntry[]> {
  const response = await authFetch(`/api/simulation/reports${buildQuery(query)}`);
  if (!response.ok) {
    throw new Error('Failed to load simulation report history');
  }

  const data = await response.json().catch(() => ({} as { history?: unknown[] }));
  const rawHistory = Array.isArray(data.history) ? data.history : [];

  return rawHistory
    .map((item: unknown) => normalizeEntry(item))
    .filter((item: SimulationReportHistoryEntry | null): item is SimulationReportHistoryEntry => item !== null)
    .sort((a: SimulationReportHistoryEntry, b: SimulationReportHistoryEntry) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
}

export async function clearSimulationReportHistory(projectId?: string): Promise<number> {
  const payload = typeof projectId === 'string' && projectId.trim().length > 0
    ? { projectId: projectId.trim() }
    : {};

  const response = await authFetch('/api/simulation/reports', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to clear simulation report history');
  }

  const data = await response.json().catch(() => ({} as { deletedCount?: unknown }));
  return typeof data.deletedCount === 'number' ? data.deletedCount : 0;
}

export async function backfillLegacySimulationReportHistory(
  projectId?: string,
): Promise<SimulationReportHistoryBackfillResult> {
  const payload = typeof projectId === 'string' && projectId.trim().length > 0
    ? { projectId: projectId.trim() }
    : {};

  const response = await authFetch('/api/simulation/reports/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to backfill legacy simulation report history');
  }

  const data = await response.json().catch(() => ({} as { checkedCount?: unknown; updatedCount?: unknown; skippedCount?: unknown }));
  return {
    checkedCount: typeof data.checkedCount === 'number' ? data.checkedCount : 0,
    updatedCount: typeof data.updatedCount === 'number' ? data.updatedCount : 0,
    skippedCount: typeof data.skippedCount === 'number' ? data.skippedCount : 0,
  };
}

export async function appendSimulationReportHistory(
  report: SimulationEngineeringReport,
  format: SimulationReportExportFormat,
  source: SimulationReportExportSource,
): Promise<SimulationReportHistoryEntry> {
  const response = await authFetch('/api/simulation/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format,
      source,
      projectId: report.meta.projectId,
      projectName: report.meta.projectName,
      floorId: report.meta.floorId,
      runtimeMode: report.meta.runtimeMode,
      converged: report.simulation.converged,
      maxTemperatureC: report.simulation.maxTemperatureC,
      pue: report.simulation.pue,
      hotspotCount: report.simulation.hotspotCount,
      generatedAt: report.meta.generatedAt,
      report,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to persist simulation report history');
  }

  const data = await response.json().catch(() => ({} as { entry?: unknown }));
  const entry = normalizeEntry(data.entry);
  if (!entry) {
    throw new Error('Invalid simulation report history response');
  }

  return entry;
}
