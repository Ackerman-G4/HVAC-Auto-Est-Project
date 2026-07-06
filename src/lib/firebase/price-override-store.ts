import { randomUUID } from 'crypto';
import { getFirebaseDb } from '@/lib/firebase/server';
import { nowIso, toNumberValue, toStringValue } from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  priceOverrides: 'priceOverrides',
  priceAuditLogs: 'priceAuditLogs',
} as const;

export interface PriceOverrideRecord {
  id: string;
  manufacturer: string;
  model: string;
  basePricePhp: number;
  overridePricePhp: number;
  justification: string;
  setBy: string;
  setByEmail: string;
  createdAt: string;
  updatedAt: string;
}

export type PriceAuditAction = 'override_set' | 'override_cleared';

interface PriceAuditEntryInput {
  model: string;
  manufacturer: string;
  oldPricePhp: number;
  newPricePhp: number;
  justification: string;
  adminUid: string;
  adminEmail: string;
  action: PriceAuditAction;
}

function toOverrideDocId(model: string): string {
  const sanitized = model.replace(/[^A-Za-z0-9_-]/g, '_');
  return sanitized || '_';
}

function mapPriceOverrideRecord(id: string, data: Record<string, unknown>): PriceOverrideRecord {
  const createdAt = toStringValue(data.createdAt, nowIso());
  const updatedAt = toStringValue(data.updatedAt, createdAt);
  return {
    id,
    manufacturer: toStringValue(data.manufacturer, ''),
    model: toStringValue(data.model, ''),
    basePricePhp: toNumberValue(data.basePricePhp, 0),
    overridePricePhp: toNumberValue(data.overridePricePhp, 0),
    justification: toStringValue(data.justification, ''),
    setBy: toStringValue(data.setBy, ''),
    setByEmail: toStringValue(data.setByEmail, ''),
    createdAt,
    updatedAt,
  };
}

export async function upsertPriceOverride(input: {
  manufacturer: string;
  model: string;
  basePricePhp: number;
  overridePricePhp: number;
  justification: string;
  setBy: string;
  setByEmail: string;
}): Promise<PriceOverrideRecord> {
  const id = toOverrideDocId(input.model);
  const docRef = getFirebaseDb().collection(COLLECTIONS.priceOverrides).doc(id);
  const existing = await docRef.get();
  const timestamp = nowIso();
  const existingData = existing.exists ? ((existing.data() || {}) as Record<string, unknown>) : {};
  const createdAt = toStringValue(existingData.createdAt, timestamp);

  const record: PriceOverrideRecord = {
    id,
    manufacturer: input.manufacturer,
    model: input.model,
    basePricePhp: input.basePricePhp,
    overridePricePhp: input.overridePricePhp,
    justification: input.justification,
    setBy: input.setBy,
    setByEmail: input.setByEmail,
    createdAt,
    updatedAt: timestamp,
  };

  await docRef.set(record);
  return record;
}

export async function deletePriceOverride(model: string): Promise<PriceOverrideRecord | null> {
  const docRef = getFirebaseDb().collection(COLLECTIONS.priceOverrides).doc(toOverrideDocId(model));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return null;
  }

  const record = mapPriceOverrideRecord(snapshot.id, (snapshot.data() || {}) as Record<string, unknown>);
  await docRef.delete();
  return record;
}

export async function listPriceOverrides(): Promise<PriceOverrideRecord[]> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.priceOverrides).get();
  return snapshot.docs.map((doc) =>
    mapPriceOverrideRecord(doc.id, (doc.data() || {}) as Record<string, unknown>),
  );
}

export async function getPriceOverridesByModel(): Promise<Map<string, PriceOverrideRecord>> {
  const overrides = await listPriceOverrides();
  const byModel = new Map<string, PriceOverrideRecord>();
  overrides.forEach((record) => {
    if (record.model) {
      byModel.set(record.model, record);
    }
  });
  return byModel;
}

export async function writePriceAuditEntry(input: PriceAuditEntryInput): Promise<void> {
  const id = randomUUID();
  await getFirebaseDb().collection(COLLECTIONS.priceAuditLogs).doc(id).set({
    id,
    model: input.model,
    manufacturer: input.manufacturer,
    oldPricePhp: input.oldPricePhp,
    newPricePhp: input.newPricePhp,
    justification: input.justification,
    adminUid: input.adminUid,
    adminEmail: input.adminEmail,
    action: input.action,
    createdAt: nowIso(),
  });
}
