/**
 * Single Simulation Case API — GET, PUT, DELETE
 * GET    /api/projects/[id]/simulations/[simId]
 * PUT    /api/projects/[id]/simulations/[simId]
 * DELETE /api/projects/[id]/simulations/[simId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  updateSimulationCase,
  deleteSimulationCase,
} from '@/lib/firebase/simulation-cases-store';
import { buildStructuredGrid } from '@/lib/engine/simulation/geometry-builder';
import { errorResponse, getErrorDetails, requireJsonRequest } from '@/lib/utils/api-helpers';
import { buildProjectBuildingGeometry, toFallbackGeometry } from '@/lib/simulation/building-case';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

const SIMULATION_CASE_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 12,
} as const;

const SIMULATION_CASE_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-get', SIMULATION_CASE_GET_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project with this ID.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const simCase = await getSimulationCase(projectId, simId);
    if (!simCase) {
      return errorResponse(404, 'Case not found', 'No simulation case with this ID.', 'CASE_NOT_FOUND');
    }

    return NextResponse.json({ case: simCase });
  } catch (error) {
    console.error('GET /api/projects/[id]/simulations/[simId] error:', error);
    const d = getErrorDetails(error, 'Failed to fetch simulation case');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-put', SIMULATION_CASE_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project with this ID.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const existing = await getSimulationCase(projectId, simId);
    if (!existing) {
      return errorResponse(404, 'Case not found', 'No simulation case with this ID.', 'CASE_NOT_FOUND');
    }

    // Only allow updates when case is not actively running
    if (existing.status === 'running' || existing.status === 'queued') {
      return errorResponse(409, 'Case is active', 'Cannot update a case that is running or queued.', 'CASE_ACTIVE');
    }

    const body = await request.json();

    const updates: Parameters<typeof updateSimulationCase>[2] = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.physics !== undefined) updates.physics = body.physics;
    if (body.solver !== undefined) updates.solver = body.solver;

    const isBuilding = (existing.simulationScope ?? 'room') === 'building';

    // For building-scope cases: re-derive geometry from current project state
    if (isBuilding && (body.rebuildBuildingGeometryFromProject || body.rebuildGeometry || body.geometry === undefined)) {
      const buildingGeometry = await buildProjectBuildingGeometry(projectId);
      updates.buildingGeometry = buildingGeometry;
      updates.simulationScope = 'building';
      const geometry = toFallbackGeometry(buildingGeometry);
      updates.geometry = geometry;
      // Skip mesh for building-scope (too large for Firestore; runner uses buildingGeometry)
      updates.status = 'meshed';
    } else if (body.geometry) {
      // If geometry changed explicitly, regenerate mesh
      updates.geometry = body.geometry;
      const cellSize = body.cellSize ?? existing.mesh?.cellSizeM ?? 0.1;
      updates.mesh = buildStructuredGrid(body.geometry, cellSize);
      updates.status = 'meshed';
    }

    await updateSimulationCase(projectId, simId, updates);

    const updated = await getSimulationCase(projectId, simId);
    return NextResponse.json({ case: updated });
  } catch (error) {
    console.error('PUT /api/projects/[id]/simulations/[simId] error:', error);
    const d = getErrorDetails(error, 'Failed to update simulation case');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-delete', SIMULATION_CASE_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project with this ID.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const existing = await getSimulationCase(projectId, simId);
    if (!existing) {
      return errorResponse(404, 'Case not found', 'No simulation case with this ID.', 'CASE_NOT_FOUND');
    }

    if (existing.status === 'running') {
      return errorResponse(409, 'Case is running', 'Cancel the active run before deleting.', 'CASE_RUNNING');
    }

    await deleteSimulationCase(projectId, simId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/projects/[id]/simulations/[simId] error:', error);
    const d = getErrorDetails(error, 'Failed to delete simulation case');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
