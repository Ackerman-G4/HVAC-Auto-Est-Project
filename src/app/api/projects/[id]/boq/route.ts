/**
 * BOQ API — read and regenerate a project's bill of quantities
 * GET  /api/projects/[id]/boq — stored items with quotation totals
 * POST /api/projects/[id]/boq — regenerate from the equipment selections
 *
 * HTTP boundary only (CLAUDE.md rule 7): guard, check ownership, delegate to
 * `lib/boq`, map the outcome to a status.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { guardRequest, withRouteErrorHandling } from '@/lib/api/boundary';
import { checkProjectAccess } from '@/lib/auth/project-access';
import { listBoqItemsForProject } from '@/lib/firebase/project-estimation-store';
import { getLatestBoqSnapshot } from '@/lib/firebase/boq-snapshot-store';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import { resolvePricingPolicy } from '@/lib/boq/pricing-policy';
import { buildBoqSummaryResponse } from '@/lib/boq/boq-read';
import { boqGenerationDeps } from '@/lib/boq/boq-deps';
import { generateProjectBoq, BOQ_GENERATION_STATUS } from '@/lib/boq/boq-generation';
import { errorResponse } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const GET_RATE_LIMIT = { windowMs: 60_000, maxRequests: 20 } as const;
const GENERATE_RATE_LIMIT = { windowMs: 60_000, maxRequests: 10 } as const;

export const GET = withRouteErrorHandling(
  'GET BOQ',
  'Failed to fetch BOQ',
  async (request: NextRequest, context: RouteContext) => {
    const guard = await guardRequest(request, 'projects-id-boq-get', GET_RATE_LIMIT);
    if (!guard.ok) return guard.response;

    const { id: projectId } = await context.params;
    const [project, items, latestSnapshot] = await Promise.all([
      getProjectRecord(projectId),
      listBoqItemsForProject(projectId),
      getLatestBoqSnapshot(projectId),
    ]);

    // Ownership, not merely authentication: the stores use the Admin SDK,
    // which bypasses Firestore rules, so this is the only gate.
    const access = checkProjectAccess(project, guard.user);
    if (!access.ok) return access.response;

    return NextResponse.json(buildBoqSummaryResponse(items, access.project, latestSnapshot));
  },
);

export const POST = withRouteErrorHandling(
  'POST BOQ',
  'Failed to generate BOQ',
  async (request: NextRequest, context: RouteContext) => {
    const guard = await guardRequest(request, 'projects-id-boq-post', GENERATE_RATE_LIMIT);
    if (!guard.ok) return guard.response;

    const { id: projectId } = await context.params;

    // Checked before any write: this verb replaces every stored row.
    const access = checkProjectAccess(await getProjectRecord(projectId), guard.user);
    if (!access.ok) return access.response;

    const outcome = await generateProjectBoq(boqGenerationDeps, {
      projectId,
      policy: resolvePricingPolicy(access.project),
      actorId: guard.user.id,
    });

    if (!outcome.ok) {
      return errorResponse(
        BOQ_GENERATION_STATUS[outcome.reason],
        outcome.reason,
        outcome.message,
        outcome.reason,
      );
    }

    return NextResponse.json({ boq: outcome.boq }, { status: 201 });
  },
);
