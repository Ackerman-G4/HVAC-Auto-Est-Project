/**
 * Individual Supplier API — Firebase-backed Update + Delete
 * PUT    /api/suppliers/[id] — Update supplier
 * DELETE /api/suppliers/[id] — Delete supplier
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
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update suppliers.');
    }

    if (!isAdmin(token)) {
      return errorResponse(403, 'Forbidden', 'Only administrators can update suppliers.');
    }

    const uid = token.uid;
    const body = await request.json();
    const ref = adminDb.ref(`metadata/suppliers/${id}`);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return errorResponse(404, 'Supplier not found', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    const existing = snapshot.val();
    const updateData = {
      name: body.name ?? existing.name,
      type: body.type ?? existing.type,
      website: body.website ?? existing.website,
      location: body.location ?? existing.location,
      contactInfo: body.contactInfo ?? existing.contactInfo,
      coverageArea: body.coverageArea ?? existing.coverageArea,
      categories: body.categories ?? existing.categories,
      updatedAt: Date.now(),
    };

    await ref.update(updateData);

    return NextResponse.json({ 
      supplier: { id, ...updateData } 
    });
  } catch (error) {
    console.error('PUT supplier error:', error);
    const d = getErrorDetails(error, 'Failed to update supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to delete suppliers.');
    }

    if (!isAdmin(token)) {
      return errorResponse(403, 'Forbidden', 'Only administrators can delete suppliers.');
    }

    const uid = token.uid;
    const ref = adminDb.ref(`metadata/suppliers/${id}`);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return errorResponse(404, 'Supplier not found', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    await ref.remove();

    return NextResponse.json({ message: 'Supplier deleted' });
  } catch (error) {
    console.error('DELETE supplier error:', error);
    const d = getErrorDetails(error, 'Failed to delete supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
