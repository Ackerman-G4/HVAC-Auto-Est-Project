/**
 * Individual Room API — GET, Update, Delete
 * GET    /api/projects/[id]/rooms/[roomId] — Get room
 * PUT    /api/projects/[id]/rooms/[roomId] — Update room
 * DELETE /api/projects/[id]/rooms/[roomId] — Delete room
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import {
  errorResponse,
  getErrorDetails,
  buildCoolingLoadInput,
  coolingLoadToDbFields,
  getUserId,
  getAuthToken,
  checkProjectAccess,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; roomId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, roomId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const [roomSnap, loadSnap] = await Promise.all([
      adminDb.ref(`projectData/${projectId}/rooms/${roomId}`).once('value'),
      adminDb.ref(`projectData/${projectId}/coolingLoads/${roomId}`).once('value'),
    ]);

    if (!roomSnap.exists()) {
      return errorResponse(404, 'Room not found', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    return NextResponse.json({ 
      room: { 
        id: roomId, 
        ...roomSnap.val(), 
        coolingLoad: loadSnap.val() || null 
      } 
    });
  } catch (error) {
    console.error('GET room error:', error);
    const d = getErrorDetails(error, 'Failed to fetch room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, roomId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();
    const roomRef = adminDb.ref(`projectData/${projectId}/rooms/${roomId}`);
    const snapshot = await roomRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Room not found', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    const existing = snapshot.val();
    const updates: Record<string, any> = {
      name: body.name ?? existing.name,
      spaceType: body.spaceType ?? existing.spaceType,
      area: body.area ?? existing.area,
      perimeter: body.perimeter ?? existing.perimeter,
      polygon: body.polygon ?? existing.polygon,
      ceilingHeight: body.ceilingHeight ?? existing.ceilingHeight,
      wallConstruction: body.wallConstruction ?? existing.wallConstruction,
      windowType: body.windowType ?? existing.windowType,
      windowArea: body.windowArea ?? existing.windowArea,
      windowOrientation: body.windowOrientation ?? existing.windowOrientation,
      occupantCount: body.occupantCount ?? existing.occupantCount,
      lightingDensity: body.lightingDensity ?? existing.lightingDensity,
      equipmentLoad: body.equipmentLoad ?? existing.equipmentLoad,
      hasRoofExposure: body.hasRoofExposure ?? existing.hasRoofExposure,
      notes: body.notes ?? existing.notes,
      updatedAt: Date.now(),
    };

    const multiUpdates: Record<string, any> = {};
    multiUpdates[`projectData/${projectId}/rooms/${roomId}`] = { ...existing, ...updates };

    // Recalculate cooling load if room has area
    let coolingLoad = null;
    if (updates.area > 0) {
      const projectSnap = await adminDb.ref(`projectData/${projectId}/metadata`).once('value');
      const project = projectSnap.val() || {};
      
      const loadInput = buildCoolingLoadInput({ ...existing, ...updates }, project);
      const result = calculateCoolingLoad(loadInput, roomId, updates.name);
      coolingLoad = coolingLoadToDbFields(result);
      multiUpdates[`projectData/${projectId}/coolingLoads/${roomId}`] = coolingLoad;
    }

    await adminDb.ref().update(multiUpdates);

    return NextResponse.json({ 
      room: { id: roomId, ...existing, ...updates, coolingLoad } 
    });
  } catch (error) {
    console.error('PUT room error:', error);
    const d = getErrorDetails(error, 'Failed to update room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to delete this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, roomId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const roomRef = adminDb.ref(`projectData/${projectId}/rooms/${roomId}`);
    const snapshot = await roomRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Room not found', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    const updates: Record<string, any> = {};
    updates[`projectData/${projectId}/rooms/${roomId}`] = null;
    updates[`projectData/${projectId}/coolingLoads/${roomId}`] = null;
    
    // Also delete any selected equipment for this room
    const equipSnap = await adminDb.ref(`projectData/${projectId}/equipmentSelection`).orderByChild('roomId').equalTo(roomId).once('value');
    if (equipSnap.exists()) {
      Object.keys(equipSnap.val()).forEach(selId => {
        updates[`projectData/${projectId}/equipmentSelection/${selId}`] = null;
      });
    }

    await adminDb.ref().update(updates);

    return NextResponse.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('DELETE room error:', error);
    const d = getErrorDetails(error, 'Failed to delete room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
