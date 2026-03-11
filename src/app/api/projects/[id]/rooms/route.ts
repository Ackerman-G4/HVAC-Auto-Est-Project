/**
 * Rooms API — CRUD + Cooling Load Calculation
 * GET  /api/projects/[id]/rooms — List rooms
 * POST /api/projects/[id]/rooms — Create room
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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const [floorsSnap, roomsSnap, loadsSnap] = await Promise.all([
      adminDb.ref(`projectData/${projectId}/floors`).orderByChild('floorNumber').once('value'),
      adminDb.ref(`projectData/${projectId}/rooms`).once('value'),
      adminDb.ref(`projectData/${projectId}/coolingLoads`).once('value'),
    ]);

    const floorsVal = floorsSnap.val() || {};
    const roomsVal = roomsSnap.val() || {};
    const loadsVal = loadsSnap.val() || {};

    const floors = Object.entries(floorsVal).map(([floorId, floor]: [string, any]) => {
      const floorRooms = Object.entries(roomsVal)
        .filter(([_, room]: [string, any]) => room.floorId === floorId)
        .map(([roomId, room]: [string, any]) => ({
          id: roomId,
          ...room,
          coolingLoad: loadsVal[roomId] || null,
        }));

      return {
        id: floorId,
        ...floor,
        rooms: floorRooms,
      };
    }).sort((a, b) => (a.floorNumber || 0) - (b.floorNumber || 0));

    return NextResponse.json({ floors });
  } catch (error) {
    console.error('GET rooms error:', error);
    const d = getErrorDetails(error, 'Failed to fetch rooms');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to create rooms.', 'UNAUTHORIZED');
    }

    const { id: projectId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();

    // Verify project exists in projectData
    const projectSnap = await adminDb.ref(`projectData/${projectId}/metadata`).once('value');
    if (!projectSnap.exists()) {
      // If metadata doesn't exist, we might want to check the user's project list again
      // or just assume it's a new structure. Let's use metadata as the source of truth for project config.
      // But for now, we'll just proceed if hasAccess was true.
    }
    const project = projectSnap.val() || {};

    // Find or create floor
    const floorNumber = body.floorNumber || 1;
    const floorsSnap = await adminDb.ref(`projectData/${projectId}/floors`)
      .orderByChild('floorNumber')
      .equalTo(floorNumber)
      .once('value');
    
    let floorId: string;
    let floorData: any;

    if (floorsSnap.exists()) {
      const entries = Object.entries(floorsSnap.val());
      floorId = entries[0][0];
      floorData = entries[0][1];
    } else {
      const newFloorRef = adminDb.ref(`projectData/${projectId}/floors`).push();
      floorId = newFloorRef.key!;
      floorData = {
        projectId,
        floorNumber,
        name: body.floorName || `Floor ${floorNumber}`,
        ceilingHeight: body.ceilingHeight || 2.7,
        createdAt: Date.now(),
      };
      await newFloorRef.set(floorData);
    }

    // Create room
    const roomRef = adminDb.ref(`projectData/${projectId}/rooms`).push();
    const roomId = roomRef.key!;
    const roomData = {
      floorId,
      name: body.name || 'New Room',
      spaceType: body.spaceType || 'office',
      area: body.area || 0,
      perimeter: body.perimeter || (body.area > 0 ? Math.sqrt(body.area) * 4 : 0),
      polygon: body.polygon || [],
      ceilingHeight: body.ceilingHeight || floorData.ceilingHeight,
      wallConstruction: body.wallConstruction || 'concrete_block_200mm',
      windowType: body.windowType || 'single_clear_6mm',
      windowArea: body.windowArea || 0,
      windowOrientation: body.windowOrientation || 'N',
      occupantCount: body.occupantCount || 0,
      lightingDensity: body.lightingDensity || 15,
      equipmentLoad: body.equipmentLoad || 10,
      hasRoofExposure: body.hasRoofExposure || false,
      notes: body.notes || '',
      createdAt: Date.now(),
    };

    const updates: Record<string, any> = {};
    updates[`projectData/${projectId}/rooms/${roomId}`] = roomData;

    // Auto‑calculate cooling load when room has an area
    let coolingLoad = null;
    if (roomData.area > 0) {
      const loadInput = buildCoolingLoadInput(roomData, project);
      const result = calculateCoolingLoad(loadInput, roomId, roomData.name);
      coolingLoad = coolingLoadToDbFields(result);
      updates[`projectData/${projectId}/coolingLoads/${roomId}`] = coolingLoad;
    }

    await adminDb.ref().update(updates);

    return NextResponse.json({ 
      room: { id: roomId, ...roomData, coolingLoad } 
    }, { status: 201 });
  } catch (error) {
    console.error('POST rooms error:', error);
    const d = getErrorDetails(error, 'Failed to create room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
