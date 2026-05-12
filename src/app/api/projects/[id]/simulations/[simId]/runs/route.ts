/**
 * Simulation Run History API — list run jobs for a simulation case
 * GET /api/projects/[id]/simulations/[simId]/runs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  listRunJobs,
} from '@/lib/firebase/simulation-cases-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

const SIMULATION_RUNS_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
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
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-runs-get', SIMULATION_RUNS_GET_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

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

    const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? '25');
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, Math.floor(requestedLimit)))
      : 25;

    const runs = await listRunJobs(projectId, simId, limit);

    return NextResponse.json({
      runs,
      activeRunId: simCase.activeRunId ?? null,
      status: simCase.status,
    });
  } catch (error) {
    console.error('GET .../runs error:', error);
    const d = getErrorDetails(error, 'Failed to list run history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
