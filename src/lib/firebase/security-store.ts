import { randomUUID } from 'node:crypto';
import type { DocumentData, Query } from 'firebase-admin/firestore';
import { getFirebaseDb } from '@/lib/firebase/server';
import { nowIso, toBooleanValue, toIntValue, toStringValue } from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  loginEvents: 'loginEvents',
  loginLockouts: 'loginLockouts',
} as const;

const LOCKOUT_FAILURE_THRESHOLD = 5;        // per-email
const IP_LOCKOUT_FAILURE_THRESHOLD = 15;    // per-IP (higher — shared office NAT)
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
  // Unprefixed for backward compatibility with existing lockout docs.
  return normalizeEmail(email).replace(/[^a-zA-Z0-9@._-]/g, '_');
}

function toIpLockoutDocId(ip: string): string {
  return `ip__${ip.trim().replace(/[^a-zA-Z0-9._:-]/g, '_')}`;
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
  const limit = Math.max(1, toIntValue(params.limit, 1));

  // Indexed query: filter by email (equality) + order by createdAt desc + limit,
  // instead of scanning the whole collection and sorting in memory. Needs the
  // loginEvents (email ASC, createdAt DESC) composite index in real Firestore.
  let query: Query = getFirebaseDb().collection(COLLECTIONS.loginEvents);
  if (params.email) {
    query = query.where('email', '==', normalizeEmail(params.email));
  }
  query = query.orderBy('createdAt', 'desc').limit(limit);

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => mapLoginEventRecord(doc.id, doc.data()));
}

/** Increment (or start) a sliding-window failure counter at a lockout doc. */
async function bumpFailureCounter(docId: string, extra: Record<string, unknown>): Promise<void> {
  const docRef = getFirebaseDb().collection(COLLECTIONS.loginLockouts).doc(docId);
  const snapshot = await docRef.get();
  const now = nowIso();
  const data = snapshot.exists ? snapshot.data() || {} : null;
  const firstFailAt = data ? toStringValue(data.firstFailAt, now) : now;
  const withinWindow = data !== null && toEpochMs(now) - toEpochMs(firstFailAt) <= LOCKOUT_WINDOW_MS;

  await docRef.set({
    ...stripUndefined(extra),
    failCount: withinWindow ? toIntValue(data?.failCount, 0) + 1 : 1,
    firstFailAt: withinWindow ? firstFailAt : now,
    lastFailAt: now,
  });
}

/** Read a lockout doc and decide whether it is currently locked. */
async function readLockoutStatus(docId: string, threshold: number): Promise<LockoutStatus> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.loginLockouts).doc(docId).get();
  if (!snapshot.exists) {
    return { locked: false, retryAfterSec: 0 };
  }
  const data = snapshot.data() || {};
  if (toIntValue(data.failCount, 0) < threshold) {
    return { locked: false, retryAfterSec: 0 };
  }
  const lockedUntilMs = toEpochMs(toStringValue(data.lastFailAt, '')) + LOCKOUT_DURATION_MS;
  const remainingMs = lockedUntilMs - Date.now();
  if (remainingMs <= 0) {
    return { locked: false, retryAfterSec: 0 };
  }
  return { locked: true, retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)) };
}

export async function recordFailedLogin(email: string, ip?: string): Promise<void> {
  await bumpFailureCounter(toLockoutDocId(email), { email: normalizeEmail(email), scope: 'email' });
  // IP-scoped counter, so a distributed guess across many emails from one host
  // still trips a lockout (email-only lockout missed this).
  if (ip && ip.trim()) {
    await bumpFailureCounter(toIpLockoutDocId(ip), { ip: ip.trim(), scope: 'ip' });
  }
}

export async function isLockedOut(email: string, ip?: string): Promise<LockoutStatus> {
  const emailStatus = await readLockoutStatus(toLockoutDocId(email), LOCKOUT_FAILURE_THRESHOLD);
  if (emailStatus.locked) return emailStatus;
  if (ip && ip.trim()) {
    const ipStatus = await readLockoutStatus(toIpLockoutDocId(ip), IP_LOCKOUT_FAILURE_THRESHOLD);
    if (ipStatus.locked) return ipStatus;
  }
  return { locked: false, retryAfterSec: 0 };
}

export async function clearFailedLogins(email: string): Promise<void> {
  // Clear the email counter on success. The IP counter is intentionally left to
  // expire on its own window — a single guessed password must not reset the
  // brute-force protection for every other email tried from the same host.
  await getFirebaseDb().collection(COLLECTIONS.loginLockouts).doc(toLockoutDocId(email)).delete();
}
