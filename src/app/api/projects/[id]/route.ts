/**
 * Single Project API — GET, PUT, DELETE
 * GET    /api/projects/[id]
 * PUT    /api/projects/[id]
 * DELETE /api/projects/[id]
 *
 * HTTP boundary only (CLAUDE.md rule 7): guard, check ownership, parse,
 * delegate to `lib/projects`, map the outcome to a status.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { guardRequest, withRouteErrorHandling } from '@/lib/api/boundary';
import { parseJsonBody } from '@/lib/validation/http';
import { updateProjectSchema } from '@/lib/validation/projects';
import { checkProjectAccessAudited } from '@/lib/auth/project-access';
import {
  deleteProjectRecordPermanently,
  getProjectRecord,
  getProjectWithDetails,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import { buildProjectPatch } from '@/lib/projects/project-update';
import { requireJsonRequest, resourceNotFound } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const MUTATION_RATE_LIMIT = { windowMs: 60_000, maxRequests: 30 } as const;
const GET_RATE_LIMIT = { windowMs: 60_000, maxRequests: 60 } as const;

const notFound = () =>
  resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');

export const GET = withRouteErrorHandling(
  'GET /api/projects/[id]',
  'Failed to fetch project',
  async (request: NextRequest, context: RouteContext) => {
    const guard = await guardRequest(request, 'projects-id-get', GET_RATE_LIMIT);
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    const loaded = await getProjectWithDetails(id);
    const access = await checkProjectAccessAudited(loaded, guard.user, 'GET', writeAuditLog, id);
    if (!access.ok) return access.response;

    return NextResponse.json({ project: access.project });
  },
);

export const PUT = withRouteErrorHandling(
  'PUT /api/projects/[id]',
  'Failed to update project',
  async (request: NextRequest, context: RouteContext) => {
    const guard = await guardRequest(request, 'projects-id-put', MUTATION_RATE_LIMIT);
    if (!guard.ok) return guard.response;

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) return jsonGuard;

    const parsed = await parseJsonBody(request, updateProjectSchema);
    if (!parsed.ok) return parsed.response;

    const { id } = await context.params;
    const existing = await getProjectRecord(id);
    const access = await checkProjectAccessAudited(existing, guard.user, 'PUT', writeAuditLog, id);
    if (!access.ok) return access.response;

    await updateProjectRecord(id, buildProjectPatch(parsed.data, access.project).patch);
    await writeAuditLog({
      projectId: id,
      action: 'updated',
      entity: 'project',
      entityId: id,
      details: JSON.stringify(parsed.data),
    });

    const project = await getProjectWithDetails(id);
    return project ? NextResponse.json({ project }) : notFound();
  },
);

export const DELETE = withRouteErrorHandling(
  'DELETE /api/projects/[id]',
  'Failed to delete project',
  async (request: NextRequest, context: RouteContext) => {
    const guard = await guardRequest(request, 'projects-id-delete', MUTATION_RATE_LIMIT);
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    const existing = await getProjectRecord(id);
    const access = await checkProjectAccessAudited(existing, guard.user, 'DELETE', writeAuditLog, id);
    if (!access.ok) return access.response;

    if (new URL(request.url).searchParams.get('permanent') === 'true') {
      // Audited before the write, not after: once the record is gone there is
      // nothing left to attach the entry to.
      await writeAuditLog({
        projectId: id, action: 'permanently_deleted', entity: 'project', entityId: id,
      });
      await deleteProjectRecordPermanently(id);
    } else {
      await updateProjectRecord(id, { status: 'deleted' });
      await writeAuditLog({ projectId: id, action: 'deleted', entity: 'project', entityId: id });
    }

    return NextResponse.json({ success: true });
  },
);
