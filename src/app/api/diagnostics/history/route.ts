/**
 * Diagnostics History API — GET /api/diagnostics/history
 * Lists past diagnostic runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

    const history = await prisma.diagnosticHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        systemType: true,
        faultCount: true,
        maxSeverity: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('GET /api/diagnostics/history error:', error);
    const d = getErrorDetails(error, 'Failed to fetch diagnostic history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
