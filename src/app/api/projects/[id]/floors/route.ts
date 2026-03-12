/**
 * Floors API — Firebase RTDB implementation
 * GET  /api/projects/[id]/floors — List floors
 * POST /api/projects/[id]/floors — Create floor
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import {
  errorResponse,
  getErrorDetails,
  getUserId,
  getAuthToken,
  checkProjectAccess,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access floors.', 'UNAUTHORIZED');
    }

    const { id: projectId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const floorsRef = adminDb.ref(`projectData/${projectId}/floors`);
    const snapshot = await floorsRef.once('value');
    const floorsData = snapshot.val() || {};

    const floors = Object.keys(floorsData).map(id => ({
      id,
      ...floorsData[id]
    })).sort((a, b) => (a.floorNumber || 0) - (b.floorNumber || 0));

    // In a real scenario, we might want to also fetch rooms here for each floor 
    // to match the original Prisma 'include' behavior.
    const roomsRef = adminDb.ref(`projectData/${projectId}/rooms`);
    const roomsSnapshot = await roomsRef.once('value');
    const roomsData = roomsSnapshot.val() || {};
    const allRooms = Object.keys(roomsData).map(id => ({ id, ...roomsData[id] }));

    const floorsWithRooms = floors.map(floor => ({
      ...floor,
      rooms: allRooms.filter(r => r.floorId === floor.id)
    }));

    return NextResponse.json({ floors: floorsWithRooms });
  } catch (error) {
    console.error('GET floors error:', error);
    const d = getErrorDetails(error, 'Failed to fetch floors');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to create floors.', 'UNAUTHORIZED');
    }

    const { id: projectId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();
    const now = new Date().toISOString();
    
    const floorRef = adminDb.ref(`projectData/${projectId}/floors`).push();
    const floorId = floorRef.key;

    const floorData = {
      projectId,
      floorNumber: body.floorNumber ?? 1,
      name: body.name || `Floor ${body.floorNumber ?? 1}`,
      ceilingHeight: body.ceilingHeight ?? 3.0,
      scale: body.scale ?? 50,
      floorPlanImage: body.floorPlanImage ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await floorRef.set(floorData);

    // Update project updatedAt
    await adminDb.ref(`projects/${projectId}`).update({ updatedAt: now });

    return NextResponse.json({ floor: { id: floorId, ...floorData } }, { status: 201 });
  } catch (error) {
    console.error('POST floor error:', error);
    const d = getErrorDetails(error, 'Failed to create floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
