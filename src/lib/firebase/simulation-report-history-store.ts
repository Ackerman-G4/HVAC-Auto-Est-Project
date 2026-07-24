import { randomUUID } from 'crypto';
import { getFirebaseDb } from '@/lib/firebase/server';
import type { SimulationEngineeringReport } from '@/lib/reports/simulation-report';
import {
  nowIso,
  toBooleanValue,
  toNumberValue,
  toStringValue,
} from '@/lib/firebase/value-utils';

const COLLECTION = 'simulationReportHistory';
const DELETE_BATCH_SIZE = 400;
const BACKFILL_BATCH_SIZE = 400;

export type SimulationReportExportFormat = 'pdf' | 'csv' | 'json';
export type SimulationReportExportSource = 'viewer' | 'workspace' | 'engine';

export interface SimulationReportHistoryRecord {
  id: string;
  ownerId: string;
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
  generatedAt: string;
  createdAt: string;
}

interface CreateSimulationReportHistoryInput {
  ownerId: string;
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
  report?: SimulationEngineeringReport;
  generatedAt?: string;
}

function inferPueRating(pue: number): string {
  if (!Number.isFinite(pue) || pue <= 0) return 'unknown';
  if (pue <= 1.2) return 'excellent';
  if (pue <= 1.5) return 'good';
  if (pue <= 2) return 'average';
  return 'poor';
}

function buildLegacyReport(record: SimulationReportHistoryRecord): SimulationEngineeringReport {
  const maxTemperatureC = Math.max(0, record.maxTemperatureC);
  const avgTemperatureC = maxTemperatureC > 0 ? Math.max(0, maxTemperatureC - 2) : 0;
  const minTemperatureC = maxTemperatureC > 0 ? Math.max(0, avgTemperatureC - 2) : 0;
  const hasPue = Number.isFinite(record.pue) && record.pue > 0;

  return {
    meta: {
      generatedAt: record.generatedAt,
      projectId: record.projectId,
      projectName: record.projectName,
      floorId: record.floorId,
      runtimeMode: record.runtimeMode,
      mode: 'balanced',
      dimensionMode: '3d',
    },
    equipment: {
      rackCount: 0,
      hvacCount: 0,
      tileCount: 0,
      totalHeatKw: 0,
      totalCoolingKw: 0,
    },
    simulation: {
      hasResult: true,
      iteration: 0,
      converged: record.converged,
      maxTemperatureC,
      avgTemperatureC,
      minTemperatureC,
      maxVelocityMs: 0,
      pue: hasPue ? record.pue : 0,
      hotspotCount: record.hotspotCount,
      continuityResidual: 0,
      momentumResidual: 0,
      energyResidual: 0,
    },
    engineering: {
      airflowBalanceM3s: 0,
      pressureImbalancePa: 0,
      ventilationEffectiveness: 0,
      deadZoneRatio: 0,
      airflowDistributionScore: 0,
      uniformityIndex: 0,
      roomMetrics: [],
    },
    compliance: {
      available: false,
      overallPass: false,
      score: 0,
      thermalClass: 'N/A',
      failedChecks: [],
    },
    pue: {
      available: hasPue,
      value: hasPue ? record.pue : 0,
      rating: inferPueRating(record.pue),
      recommendations: hasPue ? [] : ['Run PUE analysis to compute energy-efficiency recommendations.'],
    },
    optimization: {
      available: false,
      improvementPercent: 0,
      iterations: 0,
      bestIteration: 0,
      suggestionCount: 0,
      topSuggestions: [],
    },
    failure: {
      available: false,
      scenario: 'N/A',
      timeToWarningSeconds: -1,
      timeToCriticalSeconds: -1,
      affectedRacks: 0,
    },
  };
}

function mapRecord(id: string, data: Record<string, unknown>): SimulationReportHistoryRecord {
  const generatedAt = toStringValue(data.generatedAt, nowIso());
  const createdAt = toStringValue(data.createdAt, generatedAt);
  const reportRaw = data.report;

  return {
    id,
    ownerId: toStringValue(data.ownerId, ''),
    format: toStringValue(data.format, 'json') as SimulationReportExportFormat,
    source: toStringValue(data.source, 'viewer') as SimulationReportExportSource,
    projectId: toStringValue(data.projectId, 'unknown-project'),
    projectName: toStringValue(data.projectName, 'Simulation Project'),
    floorId: toStringValue(data.floorId, 'unknown-floor'),
    runtimeMode: toStringValue(data.runtimeMode, 'worker'),
    converged: toBooleanValue(data.converged, false),
    maxTemperatureC: toNumberValue(data.maxTemperatureC, 0),
    pue: toNumberValue(data.pue, 0),
    hotspotCount: Math.max(0, Math.trunc(toNumberValue(data.hotspotCount, 0))),
    report: reportRaw && typeof reportRaw === 'object' && !Array.isArray(reportRaw)
      ? (reportRaw as SimulationEngineeringReport)
      : null,
    generatedAt,
    createdAt,
  };
}

export async function createSimulationReportHistoryRecord(
  input: CreateSimulationReportHistoryInput,
): Promise<SimulationReportHistoryRecord> {
  const id = randomUUID();
  const timestamp = nowIso();
  const generatedAt = input.generatedAt || timestamp;

  const record: SimulationReportHistoryRecord = {
    id,
    ownerId: input.ownerId,
    format: input.format,
    source: input.source,
    projectId: input.projectId,
    projectName: input.projectName,
    floorId: input.floorId,
    runtimeMode: input.runtimeMode,
    converged: input.converged,
    maxTemperatureC: input.maxTemperatureC,
    pue: input.pue,
    hotspotCount: input.hotspotCount,
    report: input.report ?? null,
    generatedAt,
    createdAt: timestamp,
  };

  await getFirebaseDb().collection(COLLECTION).doc(id).set(record);
  return record;
}

export async function listSimulationReportHistoryForOwner(
  ownerId: string,
  limitCount: number,
  projectId?: string,
): Promise<SimulationReportHistoryRecord[]> {
  const safeLimit = Math.min(Math.max(limitCount, 1), 200);
  const snapshot = await getFirebaseDb()
    .collection(COLLECTION)
    .where('ownerId', '==', ownerId)
    .get();

  const records = snapshot.docs
    .map((doc) => mapRecord(doc.id, doc.data() as Record<string, unknown>))
    .filter((record) => !projectId || record.projectId === projectId)
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));

  return records.slice(0, safeLimit);
}

export async function clearSimulationReportHistoryForOwner(
  ownerId: string,
  projectId?: string,
): Promise<number> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTION)
    .where('ownerId', '==', ownerId)
    .get();

  const refs = snapshot.docs
    .map((doc) => ({
      ref: doc.ref,
      projectId: toStringValue((doc.data() as Record<string, unknown>).projectId, 'unknown-project'),
    }))
    .filter((doc) => !projectId || doc.projectId === projectId)
    .map((doc) => doc.ref);

  let deletedCount = 0;
  while (refs.length > 0) {
    const batch = getFirebaseDb().batch();
    const chunk = refs.splice(0, DELETE_BATCH_SIZE);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deletedCount += chunk.length;
  }

  return deletedCount;
}

export async function backfillLegacySimulationReportHistoryForOwner(
  ownerId: string,
  projectId?: string,
): Promise<{ checkedCount: number; updatedCount: number; skippedCount: number }> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTION)
    .where('ownerId', '==', ownerId)
    .get();

  const scopedRecords = snapshot.docs
    .map((doc) => ({
      ref: doc.ref,
      record: mapRecord(doc.id, doc.data() as Record<string, unknown>),
    }))
    .filter((item) => !projectId || item.record.projectId === projectId);

  const legacyRecords = scopedRecords.filter((item) => !item.record.report);

  const checkedCount = scopedRecords.length;
  let updatedCount = 0;
  while (legacyRecords.length > 0) {
    const batch = getFirebaseDb().batch();
    const chunk = legacyRecords.splice(0, BACKFILL_BATCH_SIZE);

    chunk.forEach((item) => {
      batch.set(item.ref, {
        report: buildLegacyReport(item.record),
        backfilledAt: nowIso(),
        backfillVersion: 'legacy-summary-v1',
      }, { merge: true });
    });

    await batch.commit();
    updatedCount += chunk.length;
  }

  return {
    checkedCount,
    updatedCount,
    skippedCount: Math.max(0, checkedCount - updatedCount),
  };
}
