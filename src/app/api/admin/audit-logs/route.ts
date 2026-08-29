/**
 * Admin Audit Logs API
 * GET /api/admin/audit-logs — searchable audit trail (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { listAuditLogs } from '@/lib/firebase/audit-log-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

const ADMIN_AUDIT_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'admin-audit-logs-get', ADMIN_AUDIT_RATE_LIMIT);
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

    const { searchParams } = new URL(request.url);
    const result = await listAuditLogs({
      limit: parseLimit(searchParams.get('limit')),
      entity: searchParams.get('entity')?.trim() || undefined,
      action: searchParams.get('action')?.trim() || undefined,
      projectId: searchParams.get('projectId')?.trim() || undefined,
      search: searchParams.get('search')?.trim() || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('GET /api/admin/audit-logs error', error);
    const d = getErrorDetails(error, 'Failed to list audit logs');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
