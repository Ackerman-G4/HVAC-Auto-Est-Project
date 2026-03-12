/**
 * Individual Material API — Firebase-backed Update + Delete
 * PUT    /api/materials/[id] — Update material
 * DELETE /api/materials/[id] — Delete material
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { getUserId, getAuthToken, isAdmin, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update materials.');
    }

    if (!isAdmin(token)) {
      return errorResponse(403, 'Forbidden', 'Only administrators can update materials.');
    }

    const uid = token.uid;
    const body = await request.json();
    const ref = adminDb.ref(`metadata/materials/${id}`);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return errorResponse(404, 'Material not found', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    const existing = snapshot.val();
    const updateData = {
      category: body.category ?? existing.category,
      name: body.name ?? existing.name,
      specification: body.specification ?? existing.specification,
      unit: body.unit ?? existing.unit,
      unitPricePHP: body.unitPricePHP ?? existing.unitPricePHP,
      supplierId: body.supplierId !== undefined ? body.supplierId : existing.supplierId,
      updatedAt: Date.now(),
    };

    await ref.update(updateData);

    return NextResponse.json({ 
      material: { id, ...updateData } 
    });
  } catch (error) {
    console.error('PUT material error:', error);
    const d = getErrorDetails(error, 'Failed to update material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to delete materials.');
    }

    if (!isAdmin(token)) {
      return errorResponse(403, 'Forbidden', 'Only administrators can delete materials.');
    }

    const uid = token.uid;
    const ref = adminDb.ref(`metadata/materials/${id}`);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return errorResponse(404, 'Material not found', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    await ref.remove();

    return NextResponse.json({ message: 'Material deleted' });
  } catch (error) {
    console.error('DELETE material error:', error);
    const d = getErrorDetails(error, 'Failed to delete material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
