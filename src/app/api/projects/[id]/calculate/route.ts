/**
 * Calculation API — Firebase RTDB implementation
 * POST /api/projects/[id]/calculate
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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to run calculations.', 'UNAUTHORIZED');
    }

    const { id: projectId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    // Get project metadata
    const projectRef = adminDb.ref(`users/${ownerId}/projects/${projectId}`);
    const projectSnapshot = await projectRef.once('value');
    if (!projectSnapshot.exists()) {
      return errorResponse(404, 'Project not found', 'The project metadata was not found.', 'PROJECT_NOT_FOUND');
    }
    const project = projectSnapshot.val();

    // Fetch all rooms for this project
    const roomsRef = adminDb.ref(`projectData/${projectId}/rooms`);
    const roomsSnapshot = await roomsRef.once('value');
    const roomsData = roomsSnapshot.val() || {};
    const allRooms = Object.keys(roomsData).map(id => ({ id, ...roomsData[id] }));

    if (allRooms.length === 0) {
      return errorResponse(400, 'No rooms to calculate', 'Add rooms to the project before running cooling load calculations.', 'NO_ROOMS');
    }

    const results: any[] = [];
    let totalProjectLoad = 0;
    let totalProjectTR = 0;

    const updates: Record<string, any> = {};
    const now = new Date().toISOString();

    for (const room of allRooms) {
      if (!room.area || room.area <= 0) continue;

      // Ensure room has all required fields for calculation, using project defaults if missing
      const loadInput = buildCoolingLoadInput(room as any, project as any);
      const loadResult = calculateCoolingLoad(loadInput, room.id, room.name);
      const fields = coolingLoadToDbFields(loadResult);

      // Path for cooling load: projectData/[projectId]/coolingLoads/[roomId]
      updates[`projectData/${projectId}/coolingLoads/${room.id}`] = {
        ...fields,
        updatedAt: now
      };

      totalProjectLoad += loadResult.totalLoad;
      totalProjectTR += loadResult.trValue;
      results.push(loadResult);
    }

    // Add audit log to updates (use current user's UID)
    const auditRef = adminDb.ref(`auditLogs/${token.uid}`).push();
    updates[`auditLogs/${token.uid}/${auditRef.key}`] = {
      projectId,
      action: 'calculated',
      entity: 'cooling_load',
      entityId: projectId,
      details: {
        roomCount: results.length,
        totalTR: totalProjectTR,
      },
      timestamp: now
    };

    // Update project timestamp (on the owner's project record)
    updates[`users/${ownerId}/projects/${projectId}/updatedAt`] = now;

    // Execute all updates atomically
    await adminDb.ref().update(updates);

    return NextResponse.json({
      results,
      summary: {
        roomCount: results.length,
        totalLoadWatts: totalProjectLoad,
        totalTR: totalProjectTR,
        totalBTU: totalProjectTR * 12000,
      },
    });
  } catch (error) {
    console.error('POST calculate error:', error);
    const d = getErrorDetails(error, 'Failed to calculate cooling loads');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
