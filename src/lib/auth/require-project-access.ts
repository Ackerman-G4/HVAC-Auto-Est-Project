/**
 * The loading variant of the project access check.
 *
 * Split from `project-access.ts` so that module stays free of any Firebase
 * import: the decision it encodes is pure, and keeping `firebase-admin` out of
 * its module graph means the pure helper can be imported anywhere without
 * dragging the whole persistence layer along.
 *
 * Use this where a handler does not otherwise need the project record. Where it
 * does, call `checkProjectAccess` on the copy already in hand and save a read.
 */

import { getProjectRecord } from '@/lib/firebase/projects-store';
import { checkProjectAccess, type AccessActor, type ProjectAccessResult } from './project-access';

export async function requireProjectAccess(
  projectId: string,
  user: AccessActor,
): Promise<ProjectAccessResult<NonNullable<Awaited<ReturnType<typeof getProjectRecord>>>>> {
  const project = await getProjectRecord(projectId);
  return checkProjectAccess(project, user);
}
