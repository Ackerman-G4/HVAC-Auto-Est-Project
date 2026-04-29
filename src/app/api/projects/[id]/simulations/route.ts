/**
 * Simulation Cases API — List & Create
 * GET  /api/projects/[id]/simulations        — List cases for project
 * POST /api/projects/[id]/simulations        — Create a new case
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  createSimulationCase,
  listSimulationCases,
} from '@/lib/firebase/simulation-cases-store';
import { buildStructuredGrid, recommendCellSize } from '@/lib/engine/simulation/geometry-builder';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import {
  DEFAULT_PHYSICS_SETUP,
  DEFAULT_SOLVER_PROFILE,
} from '@/types/simulation';
import type { GeometryInput } from '@/types/simulation';

type RouteContext = { params: Promise<{ id: string }> };

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project with this ID.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const cases = await listSimulationCases(projectId);
    return NextResponse.json({ cases });
  } catch (error) {
    console.error('GET /api/projects/[id]/simulations error:', error);
    const d = getErrorDetails(error, 'Failed to list simulation cases');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project with this ID.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();

    if (!body.name) {
      return errorResponse(400, 'Case name required', 'Provide a name for the simulation case.', 'MISSING_NAME');
    }
    if (!body.geometry) {
      return errorResponse(400, 'Geometry required', 'Provide geometry input for the simulation case.', 'MISSING_GEOMETRY');
    }

    const geometry: GeometryInput = body.geometry;

    // Auto-generate mesh if not provided
    const cellSize = body.cellSize ?? recommendCellSize(geometry);
    const mesh = buildStructuredGrid(geometry, cellSize);

    const simCase = await createSimulationCase({
      projectId,
      ownerId: auth.user.id,
      name: body.name,
      description: body.description || '',
      status: 'meshed',
      runSource: body.runSource || 'internal',
      geometry,
      mesh,
      physics: body.physics || DEFAULT_PHYSICS_SETUP,
      solver: body.solver || DEFAULT_SOLVER_PROFILE,
    });

    return NextResponse.json({ case: simCase }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects/[id]/simulations error:', error);
    const d = getErrorDetails(error, 'Failed to create simulation case');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
