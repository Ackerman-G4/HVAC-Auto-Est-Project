/**
 * Simulation Run API — POST to start a run, GET to poll status.
 *
 * HTTP concerns only. The lifecycle lives in
 * `src/lib/simulation/run-orchestrator.ts`, which is where its branches can be
 * tested without an HTTP harness.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/http';
import { startRunSchema } from '@/lib/validation/simulation-cases';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { productionRunDeps as deps } from '@/lib/simulation/run-orchestrator-deps';
import {
  pollSimulationRun,
  startSimulationRun,
  type RunRefusal,
} from '@/lib/simulation/run-orchestrator';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

const SIMULATION_RUN_RATE_LIMIT = { windowMs: 60_000, maxRequests: 6 } as const;
const SIMULATION_RUN_STATUS_RATE_LIMIT = { windowMs: 60_000, maxRequests: 120 } as const;

/** One refusal, one status. Exhaustive: a new reason is a compile error. */
function refusalResponse(refusal: RunRefusal): NextResponse {
  switch (refusal.reason) {
    case 'PROJECT_NOT_FOUND':
      return errorResponse(404, 'Project not found', 'No project.', 'PROJECT_NOT_FOUND');
    case 'FORBIDDEN':
      return errorResponse(403, 'Forbidden', 'Access denied.', 'FORBIDDEN');
    case 'CASE_NOT_FOUND':
      return errorResponse(404, 'Case not found', 'No case.', 'CASE_NOT_FOUND');
    case 'ALREADY_RUNNING':
      return errorResponse(409, 'Already running', 'Case already has an active run.', 'ALREADY_RUNNING');
    case 'NOT_MESHED':
      return errorResponse(400, 'Not meshed', 'Generate a mesh before running.', 'NOT_MESHED');
  }
}

function rateLimited(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const limit = evaluateRateLimit(request, 'projects-id-simulations-simid-run-get', SIMULATION_RUN_STATUS_RATE_LIMIT);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;
    const result = await pollSimulationRun(deps, { projectId, caseId: simId, user: auth.user });
    if (!result.ok) return refusalResponse(result);

    return NextResponse.json({
      run: result.run,
      status: result.status,
      manifest: result.manifest,
      fieldEnvelope: result.manifest?.fieldEnvelope ?? null,
    });
  } catch (error) {
    logger.error('GET .../run error', error);
    const d = getErrorDetails(error, 'Failed to poll run status');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const limit = evaluateRateLimit(request, 'projects-id-simulations-simid-run-post', SIMULATION_RUN_RATE_LIMIT);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;
    const parsed = await parseJsonBody(request, startRunSchema);
    if (!parsed.ok) return parsed.response;

    const result = await startSimulationRun(deps, {
      projectId,
      caseId: simId,
      user: auth.user,
      source: parsed.data.source,
    });
    if (!result.ok) return refusalResponse(result);

    return NextResponse.json(
      {
        run: result.run,
        case: result.case,
        manifest: result.manifest,
        fieldEnvelope: result.manifest?.fieldEnvelope ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('POST .../run error', error);
    const d = getErrorDetails(error, 'Failed to start simulation run');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
