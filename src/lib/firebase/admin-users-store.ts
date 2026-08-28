/**
 * Admin user listing — bridges Firebase Auth (admin SDK) and the local
 * JSON auth store so the Admin Portal can enumerate accounts in both modes.
 * Read-only; degrades to the local store when admin credentials are absent.
 */

import { getFirebaseAuth } from '@/lib/firebase/server';
import {
  isLocalAuthMode,
  localListUsers,
  localSetUserDisabled,
  localSetUserRole,
} from '@/lib/auth/local-auth';

export class AdminUserNotFoundError extends Error {}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'engineer';
  disabled: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

function toIsoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapLocalUsers(): AdminUserSummary[] {
  return localListUsers().map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    disabled: user.disabled,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: toIsoOrNull(user.createdAt),
  }));
}

export async function listAdminUsers(): Promise<{
  mode: 'firebase' | 'local';
  users: AdminUserSummary[];
}> {
  if (isLocalAuthMode()) {
    return { mode: 'local', users: mapLocalUsers() };
  }

  try {
    const auth = getFirebaseAuth();
    const result = await auth.listUsers(1000);
    const users: AdminUserSummary[] = result.users.map((record) => {
      const claims = (record.customClaims ?? {}) as Record<string, unknown>;
      const enrolledFactors = record.multiFactor?.enrolledFactors?.length ?? 0;
      return {
        id: record.uid,
        email: record.email ?? '',
        name: record.displayName ?? '',
        role: claims.role === 'admin' ? 'admin' : 'engineer',
        disabled: Boolean(record.disabled),
        mfaEnabled: enrolledFactors > 0,
        lastLoginAt: toIsoOrNull(record.metadata?.lastSignInTime),
        createdAt: toIsoOrNull(record.metadata?.creationTime),
      };
    });
    return { mode: 'firebase', users };
  } catch {
    return { mode: 'local', users: mapLocalUsers() };
  }
}

export async function getAdminUserById(id: string): Promise<AdminUserSummary | null> {
  const { users } = await listAdminUsers();
  return users.find((u) => u.id === id) ?? null;
}

/** Sets the disabled/locked-out status of an account, in whichever auth mode is active. */
export async function setAdminUserDisabled(id: string, disabled: boolean): Promise<void> {
  if (isLocalAuthMode()) {
    try {
      localSetUserDisabled(id, disabled);
    } catch {
      throw new AdminUserNotFoundError('User not found');
    }
    return;
  }

  try {
    await getFirebaseAuth().updateUser(id, { disabled });
  } catch {
    throw new AdminUserNotFoundError('User not found');
  }
}

/** Sets the admin/engineer role of an account, in whichever auth mode is active. */
export async function setAdminUserRole(id: string, role: 'admin' | 'engineer'): Promise<void> {
  if (isLocalAuthMode()) {
    try {
      localSetUserRole(id, role);
    } catch {
      throw new AdminUserNotFoundError('User not found');
    }
    return;
  }

  try {
    const auth = getFirebaseAuth();
    const record = await auth.getUser(id);
    const claims = { ...(record.customClaims ?? {}), role };
    await auth.setCustomUserClaims(id, claims);
  } catch {
    throw new AdminUserNotFoundError('User not found');
  }
}
