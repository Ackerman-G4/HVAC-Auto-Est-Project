/**
 * Individual Floor API — GET, Update, Delete
 * GET    /api/projects/[id]/floors/[floorId] — Get floor
 * PUT    /api/projects/[id]/floors/[floorId] — Update floor
 * DELETE /api/projects/[id]/floors/[floorId] — Delete floor
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { getUserId, getAuthToken, checkProjectAccess, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; floorId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, floorId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const snapshot = await adminDb.ref(`projectData/${projectId}/floors/${floorId}`).once('value');
    if (!snapshot.exists()) {
      return errorResponse(404, 'Floor not found', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    return NextResponse.json({ floor: { id: floorId, ...snapshot.val() } });
  } catch (error) {
    console.error('GET floor error:', error);
    const d = getErrorDetails(error, 'Failed to fetch floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, floorId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();
    const floorRef = adminDb.ref(`projectData/${projectId}/floors/${floorId}`);
    const snapshot = await floorRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Floor not found', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    const existing = snapshot.val();
    const updates = {
      name: body.name ?? existing.name,
      floorNumber: body.floorNumber ?? existing.floorNumber,
      ceilingHeight: body.ceilingHeight ?? existing.ceilingHeight,
      scale: body.scale ?? existing.scale,
      floorPlanImage: body.floorPlanImage !== undefined ? body.floorPlanImage : existing.floorPlanImage,
      updatedAt: Date.now(),
    };

    await floorRef.update(updates);

    return NextResponse.json({ floor: { id: floorId, ...existing, ...updates } });
  } catch (error) {
    console.error('PUT floor error:', error);
    const d = getErrorDetails(error, 'Failed to update floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to delete this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, floorId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const floorRef = adminDb.ref(`projectData/${projectId}/floors/${floorId}`);
    const snapshot = await floorRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Floor not found', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    // Also need to delete rooms associated with this floor
    const roomsSnapshot = await adminDb.ref(`projectData/${projectId}/rooms`).orderByChild('floorId').equalTo(floorId).once('value');
    const rooms = roomsSnapshot.val() || {};
    
    const updates: Record<string, any> = {};
    updates[`projectData/${projectId}/floors/${floorId}`] = null;
    
    Object.keys(rooms).forEach(roomId => {
      updates[`projectData/${projectId}/rooms/${roomId}`] = null;
      // Also delete cooling loads and selected equipment if they are stored separately or nested
      updates[`projectData/${projectId}/coolingLoads/${roomId}`] = null;
    });

    await adminDb.ref().update(updates);

    return NextResponse.json({ message: 'Floor and associated rooms deleted successfully' });
  } catch (error) {
    console.error('DELETE floor error:', error);
    const d = getErrorDetails(error, 'Failed to delete floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
