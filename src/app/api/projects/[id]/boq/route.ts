/**
 * BOQ API — Generate and manage Bill of Quantities
 * GET  /api/projects/[id]/boq — Get BOQ items
 * POST /api/projects/[id]/boq — Generate BOQ from selections
 *
 * HTTP concerns only. The totals live in `src/lib/engine/cost/boq-summary.ts`
 * and generation in `src/lib/boq/generate-boq.ts`, where the money path can be
 * tested without an HTTP request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { listBoqItemsForProject } from '@/lib/firebase/project-estimation-store';
import { getLatestBoqSnapshot } from '@/lib/firebase/boq-snapshot-store';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import { buildBoqVerification } from '@/lib/functions/boq-integrity';
import {
  resolvePricingPolicy,
  serialisePricingPolicy,
} from '@/lib/engine/cost/boq-pricing-policy';
import { computeBoqTotals, roundTotals, serialiseBoqRow } from '@/lib/engine/cost/boq-summary';
import { generateBoqForProject, type GenerateBoqRefusal } from '@/lib/boq/generate-boq';
import { productionBoqDeps } from '@/lib/boq/generate-boq-deps';
import { errorResponse, getErrorDetails, resourceNotFound } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

type RouteContext = { params: Promise<{ id: string }> };

const BOQ_GENERATION_RATE_LIMIT = { windowMs: 60_000, maxRequests: 10 } as const;
const BOQ_GET_RATE_LIMIT = { windowMs: 60_000, maxRequests: 20 } as const;

function rateLimited(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

/** One refusal, one status. Exhaustive: a new reason is a compile error. */
function refusalResponse(refusal: GenerateBoqRefusal): NextResponse {
  switch (refusal.reason) {
    case 'PROJECT_NOT_FOUND':
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    case 'NO_EQUIPMENT':
      return errorResponse(400, 'No equipment selected', 'Please select equipment first.', 'NO_EQUIPMENT');
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const limit = evaluateRateLimit(request, 'projects-id-boq-get', BOQ_GET_RATE_LIMIT);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const [project, items, latestSnapshot] = await Promise.all([
      getProjectRecord(id),
      listBoqItemsForProject(id),
      getLatestBoqSnapshot(id),
    ]);

    if (!project) {
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    const policy = resolvePricingPolicy(project);
    const totals = roundTotals(computeBoqTotals(items, policy));

    return NextResponse.json({
      items: items.map(serialiseBoqRow),
      ...totals,
      pricingPolicy: serialisePricingPolicy(policy),
      verification: buildBoqVerification(items, latestSnapshot),
    });
  } catch (error) {
    logger.error('GET BOQ error', error);
    const d = getErrorDetails(error, 'Failed to fetch BOQ');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const limit = evaluateRateLimit(request, 'projects-id-boq-post', BOQ_GENERATION_RATE_LIMIT);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId } = await context.params;
    const result = await generateBoqForProject(productionBoqDeps, {
      projectId,
      actorId: auth.user.id,
    });
    if (!result.ok) return refusalResponse(result);

    return NextResponse.json({ boq: result.boq }, { status: 201 });
  } catch (error) {
    logger.error('POST BOQ error', error);
    const d = getErrorDetails(error, 'Failed to generate BOQ');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
