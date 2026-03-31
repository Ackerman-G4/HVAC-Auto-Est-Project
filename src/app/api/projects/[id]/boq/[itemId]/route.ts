/**
 * Individual BOQ Item API — GET, Update, Delete
 * GET    /api/projects/[id]/boq/[itemId] — Get BOQ item
 * PUT    /api/projects/[id]/boq/[itemId] — Update BOQ item
 * DELETE /api/projects/[id]/boq/[itemId] — Delete BOQ item
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { getUserId, getAuthToken, checkProjectAccess, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, itemId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const itemSnap = await adminDb.ref(`projectData/${projectId}/boq/${itemId}`).once('value');
    if (!itemSnap.exists()) {
      return errorResponse(404, 'BOQ item not found', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    return NextResponse.json({ item: { id: itemId, ...itemSnap.val() } });
  } catch (error) {
    console.error('GET BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to fetch BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, itemId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const body = await request.json();
    const itemRef = adminDb.ref(`projectData/${projectId}/boq/${itemId}`);
    const snapshot = await itemRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'BOQ item not found', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    const existing = snapshot.val();
    const quantity = body.quantity ?? existing.quantity;
    const unitPrice = body.unitPrice ?? existing.unitPrice;

    const updates = {
      description: body.description ?? existing.description,
      specification: body.specification ?? existing.specification,
      quantity,
      unit: body.unit ?? existing.unit,
      unitPrice,
      totalPrice: quantity * unitPrice,
      notes: body.notes ?? existing.notes,
      updatedAt: Date.now(),
    };

    await itemRef.update(updates);

    return NextResponse.json({ item: { id: itemId, ...existing, ...updates } });
  } catch (error) {
    console.error('PUT BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to update BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to delete this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId, itemId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const itemRef = adminDb.ref(`projectData/${projectId}/boq/${itemId}`);
    const snapshot = await itemRef.once('value');
    
    if (!snapshot.exists()) {
      return errorResponse(404, 'BOQ item not found', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    await itemRef.remove();

    return NextResponse.json({ message: 'BOQ item deleted' });
  } catch (error) {
    console.error('DELETE BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to delete BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
