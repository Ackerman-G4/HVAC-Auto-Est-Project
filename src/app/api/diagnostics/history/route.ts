/**
 * Diagnostics History API — GET /api/diagnostics/history
 * Lists past diagnostic runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { listDiagnosticHistory } from '@/lib/firebase/catalog-store';
import { errorResponse, getErrorDetails, parseBoundedInt } from '@/lib/utils/api-helpers';

const DIAGNOSTICS_HISTORY_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'diagnostics-history', DIAGNOSTICS_HISTORY_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const limit = parseBoundedInt(searchParams.get('limit'), {
      defaultValue: 50,
      min: 1,
      max: 200,
    });

    const history = await listDiagnosticHistory(limit, {
      isAdmin: auth.user.role === 'admin',
      userId: auth.user.id,
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('GET /api/diagnostics/history error:', error);
    const d = getErrorDetails(error, 'Failed to fetch diagnostic history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
