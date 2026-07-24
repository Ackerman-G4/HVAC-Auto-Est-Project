/**
 * Run Snapshot History API — list persisted field snapshots for a run job
 * GET /api/projects/[id]/simulations/[simId]/runs/[runId]/snapshots
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  getRunJob,
  listRunFieldSnapshots,
} from '@/lib/firebase/simulation-cases-store';
import { errorResponse, getErrorDetails, parseBoundedInt } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; simId: string; runId: string }> };

const RUN_SNAPSHOTS_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 80,
} as const;

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(
      request,
      'projects-id-simulations-simid-runs-runid-snapshots-get',
      RUN_SNAPSHOTS_GET_RATE_LIMIT,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId, runId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'Access denied.', 'FORBIDDEN');
    }

    const simCase = await getSimulationCase(projectId, simId);
    if (!simCase) {
      return errorResponse(404, 'Case not found', 'No case.', 'CASE_NOT_FOUND');
    }

    const run = await getRunJob(projectId, simId, runId);
    if (!run) {
      return errorResponse(404, 'Run not found', 'No run found for this case.', 'RUN_NOT_FOUND');
    }

    const limit = parseBoundedInt(request.nextUrl.searchParams.get('limit'), {
      defaultValue: 50,
      min: 1,
      max: 500,
    });

    const snapshots = await listRunFieldSnapshots(projectId, simId, runId, limit);

    return NextResponse.json({
      runId,
      caseId: simId,
      status: run.status,
      snapshotCount: snapshots.length,
      snapshots,
      activeRunId: simCase.activeRunId ?? null,
    });
  } catch (error) {
    console.error('GET .../runs/[runId]/snapshots error:', error);
    const d = getErrorDetails(error, 'Failed to list run snapshots');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
