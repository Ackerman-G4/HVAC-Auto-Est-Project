/**
 * Single Project API — GET, PUT, DELETE
 * GET    /api/projects/[id]
 * PUT    /api/projects/[id]
 * DELETE /api/projects/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/http';
import { updateProjectSchema } from '@/lib/validation/projects';
import { canAccessProject, projectAccessDenied } from '@/lib/auth/project-access';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  deleteProjectRecordPermanently,
  getProjectRecord,
  getProjectWithDetails,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import { buildProjectUpdate } from '@/lib/projects/project-update';
import {
  errorResponse,
  getErrorDetails,
  requireJsonRequest,
  resourceNotFound,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const PROJECT_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const PROJECT_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

async function logProjectAccessDenied(id: string, uid: string, method: string): Promise<void> {
  await writeAuditLog({
    projectId: id,
    action: 'access_denied',
    entity: 'project',
    entityId: id,
    details: JSON.stringify({ uid, method }),
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-get', PROJECT_GET_RATE_LIMIT);
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

    const { id } = await context.params;

    const project = await getProjectWithDetails(id);

    if (!project) {
      return resourceNotFound(
        'Project',
        'The project ID does not match any existing project record.',
        'PROJECT_NOT_FOUND',
      );
    }

    if (!canAccessProject(project, auth.user)) {
      await logProjectAccessDenied(id, auth.user.id, 'GET');
      return projectAccessDenied();
    }

    return NextResponse.json({
      project,
    });
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to fetch project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-put', PROJECT_MUTATION_RATE_LIMIT);
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

    const { id } = await context.params;

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const parsed = await parseJsonBody(request, updateProjectSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const existing = await getProjectRecord(id);
    if (!existing) {
      return resourceNotFound(
        'Project',
        'The project you are trying to update no longer exists.',
        'PROJECT_NOT_FOUND',
      );
    }

    if (!canAccessProject(existing, auth.user)) {
      await logProjectAccessDenied(id, auth.user.id, 'PUT');
      return projectAccessDenied();
    }

    const { patch } = buildProjectUpdate(body, existing);
    await updateProjectRecord(id, patch);

    await writeAuditLog({
      projectId: id,
      action: 'updated',
      entity: 'project',
      entityId: id,
      details: JSON.stringify(body),
    });

    const project = await getProjectWithDetails(id);
    if (!project) {
      return resourceNotFound(
        'Project',
        'The project you are trying to update no longer exists.',
        'PROJECT_NOT_FOUND',
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('PUT /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to update project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-delete', PROJECT_MUTATION_RATE_LIMIT);
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

    const { id } = await context.params;
    const permanent = new URL(request.url).searchParams.get('permanent') === 'true';

    const existing = await getProjectRecord(id);
    if (!existing) {
      return resourceNotFound(
        'Project',
        'The project you are trying to delete no longer exists.',
        'PROJECT_NOT_FOUND',
      );
    }

    if (!canAccessProject(existing, auth.user)) {
      await logProjectAccessDenied(id, auth.user.id, 'DELETE');
      return projectAccessDenied();
    }

    if (permanent) {
      await writeAuditLog({
        projectId: id,
        action: 'permanently_deleted',
        entity: 'project',
        entityId: id,
      });
      await deleteProjectRecordPermanently(id);
    } else {
      await updateProjectRecord(id, { status: 'deleted' });
      await writeAuditLog({
        projectId: id,
        action: 'deleted',
        entity: 'project',
        entityId: id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to delete project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
