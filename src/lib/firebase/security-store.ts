import { randomUUID } from 'node:crypto';
import type { DocumentData, Query } from 'firebase-admin/firestore';
import { getFirebaseDb } from '@/lib/firebase/server';
import { nowIso, toBooleanValue, toIntValue, toStringValue } from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  loginEvents: 'loginEvents',
  loginLockouts: 'loginLockouts',
} as const;

const LOCKOUT_FAILURE_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60_000;
const LOCKOUT_DURATION_MS = 15 * 60_000;

export interface LoginEventRecord {
  id: string;
  email: string;
  uid: string;
  ip: string;
  userAgent: string;
  success: boolean;
  reason: string;
  createdAt: string;
}

export interface WriteLoginEventInput {
  email: string;
  uid?: string;
  ip: string;
  userAgent: string;
  success: boolean;
  reason?: string;
}

export interface ListLoginEventsParams {
  email?: string;
  limit: number;
}

export interface LockoutStatus {
  locked: boolean;
  retryAfterSec: number;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toLockoutDocId(email: string): string {
  return normalizeEmail(email).replace(/[^a-zA-Z0-9@._-]/g, '_');
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function toEpochMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapLoginEventRecord(id: string, data: DocumentData): LoginEventRecord {
  return {
    id,
    email: toStringValue(data.email, ''),
    uid: toStringValue(data.uid, ''),
    ip: toStringValue(data.ip, ''),
    userAgent: toStringValue(data.userAgent, ''),
    success: toBooleanValue(data.success, false),
    reason: toStringValue(data.reason, ''),
    createdAt: toStringValue(data.createdAt, ''),
  };
}

export async function writeLoginEvent(input: WriteLoginEventInput): Promise<void> {
  const id = randomUUID();
  const payload = stripUndefined({
    id,
    email: normalizeEmail(input.email),
    uid: input.uid,
    ip: input.ip,
    userAgent: input.userAgent,
    success: input.success,
    reason: input.reason,
    createdAt: nowIso(),
  });

  await getFirebaseDb().collection(COLLECTIONS.loginEvents).doc(id).set(payload);
}

export async function listLoginEvents(params: ListLoginEventsParams): Promise<LoginEventRecord[]> {
  let query: Query = getFirebaseDb().collection(COLLECTIONS.loginEvents);
  if (params.email) {
    query = query.where('email', '==', normalizeEmail(params.email));
  }

  const snapshot = await query.get();
  const limit = Math.max(1, toIntValue(params.limit, 1));

  return snapshot.docs
    .map((doc) => mapLoginEventRecord(doc.id, doc.data()))
    .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt))
    .slice(0, limit);
}

export async function recordFailedLogin(email: string): Promise<void> {
  const docRef = getFirebaseDb().collection(COLLECTIONS.loginLockouts).doc(toLockoutDocId(email));
  const snapshot = await docRef.get();
  const now = nowIso();
  const data = snapshot.exists ? snapshot.data() || {} : null;
  const firstFailAt = data ? toStringValue(data.firstFailAt, now) : now;
  const withinWindow = data !== null && toEpochMs(now) - toEpochMs(firstFailAt) <= LOCKOUT_WINDOW_MS;

  await docRef.set({
    email: normalizeEmail(email),
    failCount: withinWindow ? toIntValue(data?.failCount, 0) + 1 : 1,
    firstFailAt: withinWindow ? firstFailAt : now,
    lastFailAt: now,
  });
}

export async function isLockedOut(email: string): Promise<LockoutStatus> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.loginLockouts)
    .doc(toLockoutDocId(email))
    .get();

  if (!snapshot.exists) {
    return { locked: false, retryAfterSec: 0 };
  }

  const data = snapshot.data() || {};
  const failCount = toIntValue(data.failCount, 0);
  if (failCount < LOCKOUT_FAILURE_THRESHOLD) {
    return { locked: false, retryAfterSec: 0 };
  }

  const lockedUntilMs = toEpochMs(toStringValue(data.lastFailAt, '')) + LOCKOUT_DURATION_MS;
  const remainingMs = lockedUntilMs - Date.now();
  if (remainingMs <= 0) {
    return { locked: false, retryAfterSec: 0 };
  }

  return { locked: true, retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)) };
}

export async function clearFailedLogins(email: string): Promise<void> {
  await getFirebaseDb().collection(COLLECTIONS.loginLockouts).doc(toLockoutDocId(email)).delete();
}
