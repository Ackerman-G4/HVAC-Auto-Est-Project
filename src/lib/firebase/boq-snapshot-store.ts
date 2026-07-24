import { randomUUID } from 'crypto';
import { getFirebaseDb } from '@/lib/firebase/server';
import {
  nowIso,
  toIntValue,
  toNumberValue,
  toStringValue,
} from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  boqSnapshots: 'boqSnapshots',
} as const;

export type BoqSnapshotEventType = 'generated' | 'item_override' | 'verified_export';

export interface BoqSnapshotRecord {
  id: string;
  projectId: string;
  eventType: BoqSnapshotEventType;
  boqHash: string;
  algorithm: 'SHA-256';
  itemCount: number;
  grandTotalPhp: number;
  deltaPhp: number;
  triggeredBy: string;
  createdAt: string;
}

function toEventType(value: unknown): BoqSnapshotEventType {
  return value === 'item_override' || value === 'verified_export' ? value : 'generated';
}

function mapBoqSnapshotRecord(id: string, data: Record<string, unknown>): BoqSnapshotRecord {
  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    eventType: toEventType(data.eventType),
    boqHash: toStringValue(data.boqHash, ''),
    algorithm: 'SHA-256',
    itemCount: Math.max(0, toIntValue(data.itemCount, 0)),
    grandTotalPhp: toNumberValue(data.grandTotalPhp, 0),
    deltaPhp: toNumberValue(data.deltaPhp, 0),
    triggeredBy: toStringValue(data.triggeredBy, ''),
    createdAt: toStringValue(data.createdAt, nowIso()),
  };
}

async function listBoqSnapshotsForProject(projectId: string): Promise<BoqSnapshotRecord[]> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.boqSnapshots)
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs
    .map((doc) => mapBoqSnapshotRecord(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLatestBoqSnapshot(projectId: string): Promise<BoqSnapshotRecord | null> {
  const snapshots = await listBoqSnapshotsForProject(projectId);
  return snapshots[0] ?? null;
}

export async function createBoqSnapshot(input: {
  projectId: string;
  eventType: BoqSnapshotEventType;
  boqHash: string;
  itemCount: number;
  grandTotalPhp: number;
  triggeredBy: string;
}): Promise<BoqSnapshotRecord> {
  const previous = await getLatestBoqSnapshot(input.projectId);
  const id = randomUUID();

  const record: BoqSnapshotRecord = {
    id,
    projectId: input.projectId,
    eventType: input.eventType,
    boqHash: input.boqHash,
    algorithm: 'SHA-256',
    itemCount: Math.max(0, Math.trunc(input.itemCount || 0)),
    grandTotalPhp: toNumberValue(input.grandTotalPhp, 0),
    deltaPhp: previous ? toNumberValue(input.grandTotalPhp, 0) - previous.grandTotalPhp : 0,
    triggeredBy: input.triggeredBy,
    createdAt: nowIso(),
  };

  await getFirebaseDb().collection(COLLECTIONS.boqSnapshots).doc(id).set(record);
  return record;
}
