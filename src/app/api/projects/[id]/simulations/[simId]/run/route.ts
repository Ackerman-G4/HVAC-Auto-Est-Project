/**
 * Simulation Run API
 * POST /api/projects/[id]/simulations/[simId]/run  — start execution
 * GET  /api/projects/[id]/simulations/[simId]/run  — poll the active run
 *
 * HTTP boundary only (CLAUDE.md rule 7): guard, parse, delegate to
 * `lib/simulation/run-orchestrator`, map the outcome onto a status.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { guardRequest, withRouteErrorHandling } from '@/lib/api/boundary';
import { parseJsonBody } from '@/lib/validation/http';
import { startRunSchema } from '@/lib/validation/simulation-cases';
import { runOrchestratorDeps } from '@/lib/simulation/run-deps';
import {
  startSimulationRun,
  pollSimulationRun,
  RUN_FAILURE_STATUS,
  type RunFailure,
} from '@/lib/simulation/run-orchestrator';
import { errorResponse } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

const START_RATE_LIMIT = { windowMs: 60_000, maxRequests: 6 } as const;
const POLL_RATE_LIMIT = { windowMs: 60_000, maxRequests: 120 } as const;

/** The single place a domain reason becomes a status code. */
function failureResponse(outcome: RunFailure) {
  return errorResponse(
    RUN_FAILURE_STATUS[outcome.reason],
    outcome.reason,
    outcome.message,
    outcome.reason,
  );
}

export const GET = withRouteErrorHandling(
  'GET .../run',
  'Failed to poll run status',
  async (request: NextRequest, context: RouteContext) => {
    const guard = await guardRequest(request, 'projects-id-simulations-simid-run-get', POLL_RATE_LIMIT);
    if (!guard.ok) return guard.response;

    const { id: projectId, simId } = await context.params;
    const outcome = await pollSimulationRun(runOrchestratorDeps, {
      actor: guard.user,
      projectId,
      caseId: simId,
    });
    if (!outcome.ok) return failureResponse(outcome);

    return NextResponse.json({
      run: outcome.run,
      status: outcome.status,
      manifest: outcome.manifest,
      fieldEnvelope: outcome.manifest?.fieldEnvelope ?? null,
    });
  },
);

export const POST = withRouteErrorHandling(
  'POST .../run',
  'Failed to start simulation run',
  async (request: NextRequest, context: RouteContext) => {
    const guard = await guardRequest(request, 'projects-id-simulations-simid-run-post', START_RATE_LIMIT);
    if (!guard.ok) return guard.response;

    const { id: projectId, simId } = await context.params;
    const parsed = await parseJsonBody(request, startRunSchema);
    if (!parsed.ok) return parsed.response;

    const outcome = await startSimulationRun(runOrchestratorDeps, {
      actor: guard.user,
      projectId,
      caseId: simId,
      source: parsed.data.source,
    });
    if (!outcome.ok) return failureResponse(outcome);

    return NextResponse.json(
      {
        run: outcome.run,
        case: outcome.case,
        manifest: outcome.manifest,
        fieldEnvelope: outcome.manifest?.fieldEnvelope ?? null,
      },
      { status: 201 },
    );
  },
);
