/**
 * Audit Log read layer — queries the shared 'auditLogs' and 'loginEvents'
 * collections for the Admin Portal. Read-only; writes go through
 * writeAuditLog (projects-store) and writeLoginEvent (security-store).
 */

import { getFirebaseDb } from '@/lib/firebase/server';
import { toStringValue } from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  auditLogs: 'auditLogs',
  loginEvents: 'loginEvents',
} as const;

export interface AuditLogEntry {
  id: string;
  projectId: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  previousValue: string;
  newValue: string;
  createdAt: string;
}

export interface ListAuditLogsParams {
  limit: number;
  entity?: string | undefined;
  action?: string | undefined;
  projectId?: string | undefined;
  search?: string | undefined;
}

function mapAuditLogEntry(id: string, data: Record<string, unknown>): AuditLogEntry {
  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    action: toStringValue(data.action, ''),
    entity: toStringValue(data.entity, ''),
    entityId: toStringValue(data.entityId, ''),
    details: toStringValue(data.details, ''),
    previousValue: toStringValue(data.previousValue, ''),
    newValue: toStringValue(data.newValue, ''),
    createdAt: toStringValue(data.createdAt, ''),
  };
}

async function readAllAuditLogs(): Promise<AuditLogEntry[]> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.auditLogs).get();
  return snapshot.docs
    .map((doc) => mapAuditLogEntry(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAuditLogs(
  params: ListAuditLogsParams,
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const all = await readAllAuditLogs();

  let filtered = all;
  if (params.entity) {
    filtered = filtered.filter((entry) => entry.entity === params.entity);
  }
  if (params.action) {
    filtered = filtered.filter((entry) => entry.action === params.action);
  }
  if (params.projectId) {
    filtered = filtered.filter((entry) => entry.projectId === params.projectId);
  }
  if (params.search) {
    const needle = params.search.toLowerCase();
    filtered = filtered.filter((entry) =>
      [entry.action, entry.entity, entry.entityId, entry.details]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }

  const total = filtered.length;
  const limit = Math.max(1, Math.trunc(params.limit) || 1);
  return { logs: filtered.slice(0, limit), total };
}

export async function getRecentAuditLogs(limit: number): Promise<AuditLogEntry[]> {
  const all = await readAllAuditLogs();
  const bounded = Math.max(1, Math.trunc(limit) || 1);
  return all.slice(0, bounded);
}

export async function countLoginFailuresSince(sinceIso: string): Promise<number> {
  try {
    const snapshot = await getFirebaseDb()
      .collection(COLLECTIONS.loginEvents)
      .where('success', '==', false)
      .get();

    return snapshot.docs.reduce((count, doc) => {
      const createdAt = toStringValue((doc.data() as Record<string, unknown>).createdAt, '');
      return createdAt >= sinceIso ? count + 1 : count;
    }, 0);
  } catch {
    return 0;
  }
}
