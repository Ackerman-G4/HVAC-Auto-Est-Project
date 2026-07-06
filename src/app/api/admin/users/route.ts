/**
 * Admin Users API
 * GET /api/admin/users — list all accounts (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { listAdminUsers } from '@/lib/firebase/admin-users-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

const ADMIN_USERS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'admin-users-get', ADMIN_USERS_RATE_LIMIT);
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

    const result = await listAdminUsers();
    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    const d = getErrorDetails(error, 'Failed to list users');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
