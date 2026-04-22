/**
 * Simulation Report History Backfill API
 * POST /api/simulation/reports/backfill
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import { backfillLegacySimulationReportHistoryForOwner } from '@/lib/firebase/simulation-report-history-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const requestedProjectId = typeof body.projectId === 'string' && body.projectId.trim().length > 0
      ? body.projectId.trim()
      : undefined;

    if (requestedProjectId && requestedProjectId !== 'unknown-project' && requestedProjectId !== 'workspace') {
      const project = await getProjectRecord(requestedProjectId);
      if (!project) {
        return errorResponse(404, 'Project not found', 'No project with this ID.', 'PROJECT_NOT_FOUND');
      }

      if (!isProjectOwnerOrAdmin(auth.user, project)) {
        return errorResponse(403, 'Forbidden', 'You do not have permission to backfill this project.', 'FORBIDDEN');
      }
    }

    const result = await backfillLegacySimulationReportHistoryForOwner(
      auth.user.id,
      requestedProjectId,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/simulation/reports/backfill error:', error);
    const d = getErrorDetails(error, 'Failed to backfill simulation report history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
