/**
 * Diagnostics History API — GET /api/diagnostics/history
 * Lists past diagnostic runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { listDiagnosticHistory } from '@/lib/firebase/catalog-store';
import { errorResponse, getErrorDetails, parseBoundedInt } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
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

    const history = await listDiagnosticHistory(limit);

    return NextResponse.json({ history });
  } catch (error) {
    console.error('GET /api/diagnostics/history error:', error);
    const d = getErrorDetails(error, 'Failed to fetch diagnostic history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
