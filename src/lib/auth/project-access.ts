/**
 * Project-level authorisation.
 *
 * Every project store function runs through the Firebase Admin SDK, which
 * bypasses Firestore security rules entirely. The rules in
 * `config/firebase/firestore.rules` therefore do nothing for API traffic — the
 * route handler is not defence in depth, it is the only gate. A handler that
 * calls `requireAuth` and stops has established *who* is calling and nothing
 * about *what they may reach*, which is enough for any signed-in user to read
 * or overwrite another account's project by guessing an id.
 *
 * `checkProjectAccess` is the single path for that check, so a new handler
 * gets existence, ownership and the error shapes in one call rather than
 * reimplementing three checks and getting one of them subtly wrong.
 *
 * This module deliberately imports nothing from `lib/firebase`. The decision
 * it encodes is pure — an id, a role, and an owner field — and keeping the
 * store out means anything can import it without pulling `firebase-admin`
 * into its module graph. The loading variant lives in `require-project-access.ts`.
 */

import { NextResponse } from 'next/server';
import { errorResponse, resourceNotFound } from '@/lib/utils/api-helpers';

/** The subset of a project record that determines who may reach it. */
export interface ProjectOwnership {
  ownerId?: string;
  createdBy?: string;
}

/** The caller, as established by the auth guard. */
export interface AccessActor {
  id: string;
  role: string;
}

/**
 * An admin reaches any project; anyone else must be the recorded owner.
 *
 * `ownerId` is preferred over `createdBy` because ownership can in principle be
 * transferred while the creator cannot change. A project carrying neither is
 * unreachable by non-admins rather than reachable by everyone — an unowned
 * record is a data defect, and the safe reading of a data defect is deny.
 */
export function canAccessProject(project: ProjectOwnership, user: AccessActor): boolean {
  if (user.role === 'admin') {
    return true;
  }

  const effectiveOwner = project.ownerId || project.createdBy || '';
  return !!effectiveOwner && effectiveOwner === user.id;
}

export function projectAccessDenied(): NextResponse {
  return errorResponse(
    403,
    'Access denied',
    'You do not have access to this project.',
    'PROJECT_ACCESS_DENIED',
  );
}

/**
 * Either the project the caller is allowed to work with, or the response to
 * return instead.
 *
 * A union rather than a throw or a boolean: the caller cannot reach `project`
 * without narrowing on `ok`, so omitting the denial branch is a compile error
 * rather than an authorisation hole.
 */
export type ProjectAccessResult<TProject> =
  | { ok: true; project: TProject }
  | { ok: false; response: NextResponse };

/**
 * Check access against a project record the handler has already loaded.
 *
 * Use this where the project is needed anyway, so the check costs no extra
 * read. A `null` project is reported as not-found rather than denied: the
 * caller may legitimately own a project that has since been deleted.
 */
export function checkProjectAccess<TProject extends ProjectOwnership>(
  project: TProject | null,
  user: AccessActor,
): ProjectAccessResult<TProject> {
  if (!project) {
    return {
      ok: false,
      response: resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND'),
    };
  }

  if (!canAccessProject(project, user)) {
    return { ok: false, response: projectAccessDenied() };
  }

  return { ok: true, project };
}

/** A minimal audit-log writer, injected so this module stays free of stores. */
export type AuditWriter = (entry: {
  projectId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
}) => Promise<unknown>;

/**
 * Check access against a loaded project, recording a denial.
 *
 * Reaching for a project that is not yours is worth a trail; mistyping an id
 * that exists nowhere is not — so a missing project returns 404 silently while
 * a denial is logged before the 403. Takes the project the caller already has,
 * so adding the audit costs no extra read.
 */
export async function checkProjectAccessAudited<TProject extends ProjectOwnership>(
  project: TProject | null,
  user: AccessActor,
  method: string,
  writeAudit: AuditWriter,
  projectId: string,
): Promise<ProjectAccessResult<TProject>> {
  const result = checkProjectAccess(project, user);

  if (!result.ok && result.response.status === 403) {
    await writeAudit({
      projectId,
      action: 'access_denied',
      entity: 'project',
      entityId: projectId,
      details: JSON.stringify({ uid: user.id, method }),
    });
  }

  return result;
}
