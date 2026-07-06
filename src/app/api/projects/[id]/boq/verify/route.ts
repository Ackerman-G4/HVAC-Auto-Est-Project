/**
 * BOQ Verify API — Tamper-evident integrity check
 * GET /api/projects/[id]/boq/verify — Verify stored BOQ items against the latest snapshot
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getLatestBoqSnapshot } from '@/lib/firebase/boq-snapshot-store';
import { listBoqItemsForProject } from '@/lib/firebase/project-estimation-store';
import { getProjectRecord, writeAuditLog } from '@/lib/firebase/projects-store';
import { buildBoqVerification } from '@/lib/functions/boq-integrity';
import { errorResponse, getErrorDetails, resourceNotFound } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const BOQ_VERIFY_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-boq-verify-get', BOQ_VERIFY_RATE_LIMIT);
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

    const { id: projectId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    const [items, latestSnapshot] = await Promise.all([
      listBoqItemsForProject(projectId),
      getLatestBoqSnapshot(projectId),
    ]);

    const verification = buildBoqVerification(items, latestSnapshot);

    if (verification.status === 'tampered') {
      await writeAuditLog({
        projectId,
        action: 'tamper_detected',
        entity: 'boq',
        entityId: projectId,
        details: JSON.stringify({
          boqHash: verification.boqHash,
          snapshotHash: verification.snapshotHash,
          snapshotId: latestSnapshot?.id ?? null,
          lockedAt: verification.lockedAt,
          currentItemCount: items.length,
          snapshotItemCount: verification.itemCount,
          detectedBy: auth.user.id,
        }),
      });
    }

    return NextResponse.json({ verification });
  } catch (error) {
    console.error('GET BOQ verify error:', error);
    const d = getErrorDetails(error, 'Failed to verify BOQ');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
