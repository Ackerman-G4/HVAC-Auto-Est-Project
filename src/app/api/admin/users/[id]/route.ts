/**
 * Admin User Mutation API
 * PATCH /api/admin/users/[id] — disable, enable, or change the role of an
 * account (admin only). Guards against self-lockout and removing the last
 * enabled admin (see assertAdminMutationAllowed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { AdminMutationError, assertAdminMutationAllowed } from '@/lib/auth/admin-user-mutations';
import {
  AdminUserNotFoundError,
  getAdminUserById,
  listAdminUsers,
  setAdminUserDisabled,
  setAdminUserRole,
} from '@/lib/firebase/admin-users-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest, resourceNotFound } from '@/lib/utils/api-helpers';
import { parseJsonBody } from '@/lib/validation/http';
import { adminUserMutationSchema } from '@/lib/validation/admin';

type RouteContext = { params: Promise<{ id: string }> };

const ADMIN_USERS_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'admin-users-patch', ADMIN_USERS_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const { id } = await context.params;
    const parsed = await parseJsonBody(request, adminUserMutationSchema);
    if (!parsed.ok) return parsed.response;
    const mutation = parsed.data;

    const target = await getAdminUserById(id);
    if (!target) {
      return resourceNotFound('User', `No account matches id "${id}".`);
    }

    const { users: allUsers } = await listAdminUsers();

    try {
      assertAdminMutationAllowed(auth.user.id, target, allUsers, mutation);
    } catch (err) {
      if (err instanceof AdminMutationError) {
        return errorResponse(409, 'Mutation not allowed', err.message, 'ADMIN_MUTATION_BLOCKED');
      }
      throw err;
    }

    const previousValue = JSON.stringify({ role: target.role, disabled: target.disabled });

    if (mutation.type === 'disable') {
      await setAdminUserDisabled(id, true);
    } else if (mutation.type === 'enable') {
      await setAdminUserDisabled(id, false);
    } else {
      await setAdminUserRole(id, mutation.role);
    }

    const updated = await getAdminUserById(id);

    await writeAuditLog({
      projectId: 'system',
      action: `admin.user.${mutation.type}`,
      entity: 'user',
      entityId: id,
      details: `${auth.user.email} ${mutation.type === 'setRole' ? `set role to ${mutation.role} for` : `${mutation.type}d`} ${target.email}`,
      previousValue,
      newValue: JSON.stringify({ role: updated?.role ?? target.role, disabled: updated?.disabled ?? target.disabled }),
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof AdminUserNotFoundError) {
      return resourceNotFound('User', error.message);
    }
    console.error('PATCH /api/admin/users/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to update user');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
