import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/utils/api-helpers';

export function canAccessProject(
  project: { ownerId?: string; createdBy?: string },
  user: { id: string; role: string },
): boolean {
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
