/**
 * Single Project API — Firebase RTDB implementation
 * GET    /api/projects/[id]
 * PUT    /api/projects/[id]
 * DELETE /api/projects/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import {
  toNumber,
  toInt,
  errorResponse,
  getErrorDetails,
  getUserId,
  getAuthToken,
  isAdmin,
  checkProjectAccess,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this project.', 'UNAUTHORIZED');
    }

    const { id } = await context.params;
    const ownerId = await checkProjectAccess(id, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    // Fetch project metadata
    const projectRef = adminDb.ref(`projects/${id}`);
    const projectSnapshot = await projectRef.once('value');
    
    if (!projectSnapshot.exists()) {
      return errorResponse(404, 'Project not found', 'The project metadata was not found.', 'PROJECT_NOT_FOUND');
    }

    const project = { id, ...projectSnapshot.val() };

    // Fetch floors for this project
    const floorsRef = adminDb.ref(`projectData/${id}/floors`);
    const floorsSnapshot = await floorsRef.once('value');
    const floorsData = floorsSnapshot.val() || {};
    
    const floors = Object.keys(floorsData).map(floorId => ({
      id: floorId,
      ...floorsData[floorId]
    })).sort((a, b) => (a.floorNumber || 0) - (b.floorNumber || 0));

    // Fetch rooms for these floors (in NoSQL we might have them nested or under projectData/[id]/rooms)
    const roomsRef = adminDb.ref(`projectData/${id}/rooms`);
    const roomsSnapshot = await roomsRef.once('value');
    const roomsData = roomsSnapshot.val() || {};

    const allRooms = Object.keys(roomsData).map(roomId => ({
      id: roomId,
      ...roomsData[roomId]
    }));

    // Attach rooms to floors
    const floorsWithRooms = floors.map(floor => ({
      ...floor,
      rooms: allRooms.filter(r => r.floorId === floor.id)
    }));

    // Fetch BOQ
    const boqRef = adminDb.ref(`projectData/${id}/boq`);
    const boqSnapshot = await boqRef.once('value');
    const boqItems = Object.keys(boqSnapshot.val() || {}).map(itemId => ({
      id: itemId,
      ...boqSnapshot.val()[itemId]
    }));

    // Fetch Selected Equipment
    const eqRef = adminDb.ref(`projectData/${id}/selectedEquipment`);
    const eqSnapshot = await eqRef.once('value');
    const selectedEquipment = Object.keys(eqSnapshot.val() || {}).map(selId => ({
      id: selId,
      ...eqSnapshot.val()[selId]
    }));

    return NextResponse.json({
      project: { 
        ...project, 
        floors: floorsWithRooms, 
        boqItems, 
        selectedEquipment 
      },
    });
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to fetch project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update this project.', 'UNAUTHORIZED');
    }

    const { id } = await context.params;
    const ownerId = await checkProjectAccess(id, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();
    const projectRef = adminDb.ref(`projects/${id}`);
    const snapshot = await projectRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Project not found', 'The project you are trying to update no longer exists.', 'PROJECT_NOT_FOUND');
    }

    const existing = snapshot.val();
    const finalOutdoorDB = toNumber(body.outdoorDB, existing.outdoorDB);
    const finalOutdoorRH = toNumber(body.outdoorRH, existing.outdoorRH);
    const computedWB = calcWetBulb(finalOutdoorDB, finalOutdoorRH);

    const now = new Date().toISOString();
    const updateData = {
      name: body.name ?? existing.name,
      clientName: body.clientName ?? existing.clientName,
      buildingType: body.buildingType ?? existing.buildingType,
      location: body.location ?? existing.location,
      city: body.city ?? existing.city,
      totalFloorArea: toNumber(body.totalFloorArea, existing.totalFloorArea),
      floorsAboveGrade: toInt(body.floorsAboveGrade, existing.floorsAboveGrade),
      floorsBelowGrade: toInt(body.floorsBelowGrade, existing.floorsBelowGrade),
      outdoorDB: finalOutdoorDB,
      outdoorWB: Math.round(computedWB * 100) / 100,
      outdoorRH: finalOutdoorRH,
      indoorDB: toNumber(body.indoorDB, existing.indoorDB),
      indoorRH: toNumber(body.indoorRH, existing.indoorRH),
      safetyFactor: toNumber(body.safetyFactor, existing.safetyFactor),
      diversityFactor: toNumber(body.diversityFactor, existing.diversityFactor),
      notes: body.notes ?? existing.notes,
      status: body.status ?? existing.status,
      updatedAt: now,
    };

    await projectRef.update(updateData);

    await adminDb.ref(`auditLogs/${token.uid}`).push({
      projectId: id,
      action: 'updated',
      entity: 'project',
      entityId: id,
      details: body,
      timestamp: now
    });

    return NextResponse.json({ project: { id, ...updateData } });
  } catch (error) {
    console.error('PUT /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to update project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to delete this project.', 'UNAUTHORIZED');
    }

    const { id } = await context.params;
    const ownerId = await checkProjectAccess(id, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
    const projectRef = adminDb.ref(`projects/${id}`);
    const snapshot = await projectRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'Project not found', 'The project you are trying to delete no longer exists.', 'PROJECT_NOT_FOUND');
    }

    if (permanent) {
      // Permanent delete: remove project and all its data
      const updates: Record<string, any> = {};
      updates[`projects/${id}`] = null;
      updates[`projectData/${id}`] = null;
      updates[`simulations/${id}`] = null;
      updates[`projectOwners/${id}`] = null;
      await adminDb.ref().update(updates);
    } else {
      // Soft delete: update status
      await projectRef.update({ 
        status: 'deleted',
        updatedAt: new Date().toISOString()
      });
      
      await adminDb.ref(`auditLogs/${token.uid}`).push({
        projectId: id,
        action: 'deleted',
        entity: 'project',
        entityId: id,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to delete project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
