/**
 * Simulation Layout API — GET, PUT
 * GET  /api/projects/[id]/simulation-layout?floorId=...
 * PUT  /api/projects/[id]/simulation-layout
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationLayout,
  upsertSimulationLayout,
} from '@/lib/firebase/simulation-layout-store';
import {
  errorResponse,
  getErrorDetails,
  resourceNotFound,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

function isOwnerOrAdmin(user: { id: string; role: string }, project: { createdBy?: string }): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId } = await context.params;
    const floorId = new URL(request.url).searchParams.get('floorId');

    if (!floorId) {
      return errorResponse(400, 'Bad Request', 'floorId query parameter is required.', 'MISSING_FLOOR_ID');
    }

    const project = await getProjectRecord(projectId);
    if (!project) {
      return resourceNotFound('Project', 'Project not found.', 'PROJECT_NOT_FOUND');
    }
    if (!isOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const layout = await getSimulationLayout(projectId, floorId);
    return NextResponse.json({ layout });
  } catch (error) {
    console.error('GET /api/projects/[id]/simulation-layout error:', error);
    const d = getErrorDetails(error, 'Failed to fetch simulation layout');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId } = await context.params;
    const body = await request.json();
    const { floorId, hvacPlacements, tilePlacements, canvasScale, connectionOverrides } = body;

    if (!floorId || typeof floorId !== 'string') {
      return errorResponse(400, 'Bad Request', 'floorId is required in the request body.', 'MISSING_FLOOR_ID');
    }

    const project = await getProjectRecord(projectId);
    if (!project) {
      return resourceNotFound('Project', 'Project not found.', 'PROJECT_NOT_FOUND');
    }
    if (!isOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have permission to modify this project.', 'FORBIDDEN');
    }

    if (!Array.isArray(hvacPlacements) || !Array.isArray(tilePlacements)) {
      return errorResponse(400, 'Bad Request', 'hvacPlacements and tilePlacements must be arrays.', 'INVALID_PAYLOAD');
    }

    await upsertSimulationLayout(projectId, floorId, {
      hvacPlacements,
      tilePlacements,
      canvasScale: typeof canvasScale === 'number' ? canvasScale : 50,
      ...(Array.isArray(connectionOverrides) ? { connectionOverrides } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/projects/[id]/simulation-layout error:', error);
    const d = getErrorDetails(error, 'Failed to save simulation layout');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
