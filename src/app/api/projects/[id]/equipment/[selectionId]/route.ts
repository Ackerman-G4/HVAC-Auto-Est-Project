/**
 * Individual Equipment Selection API — GET, Update, Delete
 * GET    /api/projects/[id]/equipment/[selectionId] — Get selection
 * PUT    /api/projects/[id]/equipment/[selectionId] — Update selection
 * DELETE /api/projects/[id]/equipment/[selectionId] — Remove selection
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { getUserId, getAuthToken, checkProjectAccess, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; selectionId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, selectionId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const selectionSnap = await adminDb.ref(`projectData/${projectId}/equipmentSelection/${selectionId}`).once('value');
    if (!selectionSnap.exists()) {
      return errorResponse(404, 'Selection not found', 'The selection does not exist.', 'SELECTION_NOT_FOUND');
    }

    const selection = selectionSnap.val();
    const equipmentSnap = await adminDb.ref(`projectData/${projectId}/equipment/${selection.equipmentId}`).once('value');
    
    return NextResponse.json({ 
      selection: { 
        id: selectionId, 
        ...selection, 
        equipment: equipmentSnap.val() || null 
      } 
    });
  } catch (error) {
    console.error('GET equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to fetch equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, selectionId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();
    const selectionRef = adminDb.ref(`projectData/${projectId}/equipmentSelection/${selectionId}`);
    const snapshot = await selectionRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Selection not found', 'The selection does not exist.', 'SELECTION_NOT_FOUND');
    }

    const existing = snapshot.val();
    const updates = {
      quantity: body.quantity ?? existing.quantity,
      equipmentId: body.equipmentId ?? existing.equipmentId,
      roomId: body.roomId ?? existing.roomId,
      updatedAt: Date.now(),
    };

    await selectionRef.update(updates);

    return NextResponse.json({ selection: { id: selectionId, ...existing, ...updates } });
  } catch (error) {
    console.error('PUT equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to update equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to delete this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, selectionId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const selectionRef = adminDb.ref(`projectData/${projectId}/equipmentSelection/${selectionId}`);
    const snapshot = await selectionRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Equipment selection not found', 'The selection does not exist in this project.', 'SELECTION_NOT_FOUND');
    }

    await selectionRef.remove();

    return NextResponse.json({ message: 'Equipment selection removed' });
  } catch (error) {
    console.error('DELETE equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to delete equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
