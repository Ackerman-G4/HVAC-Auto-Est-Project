/**
 * Single Simulation Case API — GET, PUT, DELETE
 * GET    /api/projects/[id]/simulations/[simId]
 * PUT    /api/projects/[id]/simulations/[simId]
 * DELETE /api/projects/[id]/simulations/[simId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  updateSimulationCase,
  deleteSimulationCase,
} from '@/lib/firebase/simulation-cases-store';
import { buildStructuredGrid } from '@/lib/engine/simulation/geometry-builder';
import {
  buildProjectBuildingGeometry,
  MIN_BUILDING_CELL_SIZE_M,
  toFallbackGeometry,
} from '@/lib/simulation/building-case';
import { isBuildingSimulationEnabled } from '@/lib/simulation/feature-flags';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import type { SimulationScope } from '@/types/simulation';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

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
    if (body.simulationScope !== undefined) {
      const scope: SimulationScope = body.simulationScope === 'building' ? 'building' : 'room';
      if (scope === 'building' && !isBuildingSimulationEnabled()) {
        return errorResponse(
          403,
          'Building mode disabled',
          'Enable ENABLE_BUILDING_SIMULATION to update building-scale cases.',
          'BUILDING_MODE_DISABLED',
        );
      }
      updates.simulationScope = scope;
    }

    const shouldRebuildBuildingGeometry = body.rebuildBuildingGeometryFromProject === true;
    if (shouldRebuildBuildingGeometry) {
      if (!isBuildingSimulationEnabled()) {
        return errorResponse(
          403,
          'Building mode disabled',
          'Enable ENABLE_BUILDING_SIMULATION to rebuild building geometry.',
          'BUILDING_MODE_DISABLED',
        );
      }

      const requestedScope: SimulationScope = (updates.simulationScope
        ?? existing.simulationScope
        ?? 'room');

      if (requestedScope !== 'building') {
        return errorResponse(
          400,
          'Invalid rebuild request',
          'rebuildBuildingGeometryFromProject can only be used for building-scope cases.',
          'INVALID_REBUILD_SCOPE',
        );
      }

      const rebuiltGeometry = await buildProjectBuildingGeometry(projectId);
      if (rebuiltGeometry.rooms.length === 0) {
        return errorResponse(
          400,
          'No floors found',
          'Create floors and rooms before rebuilding building geometry.',
          'MISSING_FLOOR_DATA',
        );
      }

      updates.buildingGeometry = rebuiltGeometry;
      updates.simulationScope = 'building';
    }

    if (body.buildingGeometry !== undefined) updates.buildingGeometry = body.buildingGeometry;

    const nextScope: SimulationScope = (updates.simulationScope
      ?? existing.simulationScope
      ?? 'room');

    // Building-scope updates always regenerate fallback geometry and mesh.
    if (nextScope === 'building') {
      const nextBuildingGeometry = updates.buildingGeometry ?? existing.buildingGeometry;
      if (!nextBuildingGeometry) {
        return errorResponse(
          400,
          'Building geometry required',
          'Provide buildingGeometry when simulationScope is building.',
          'MISSING_BUILDING_GEOMETRY',
        );
      }

      const fallbackGeometry = toFallbackGeometry(nextBuildingGeometry);
      const requestedCellSize = typeof body.cellSize === 'number'
        ? body.cellSize
        : (existing.mesh?.cellSizeM ?? 0.1);
      const cellSize = Math.max(MIN_BUILDING_CELL_SIZE_M, requestedCellSize);
      updates.geometry = fallbackGeometry;
      updates.mesh = buildStructuredGrid(fallbackGeometry, cellSize);
      updates.status = 'meshed';
    } else if (body.geometry) {
      // Room-scope geometry update.
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
