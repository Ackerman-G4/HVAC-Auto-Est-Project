/**
 * Individual Supplier API — Update + Delete
 * PUT    /api/suppliers/[id] — Update supplier
 * DELETE /api/suppliers/[id] — Delete supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteSupplierRecord,
  getSupplierRecord,
  updateSupplierRecord,
} from '@/lib/firebase/catalog-store';
import { errorResponse, getErrorDetails, resourceNotFound } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await getSupplierRecord(id);
    if (!existing) {
      return resourceNotFound('Supplier', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    const supplier = await updateSupplierRecord(id, {
      name: body.name ?? existing.name,
      type: body.type ?? existing.type,
      website: body.website ?? existing.website,
      location: body.location ?? existing.location,
      contactInfo: body.contactInfo ?? existing.contactInfo,
      coverageArea: body.coverageArea ?? existing.coverageArea,
      categories: body.categories ? JSON.stringify(body.categories) : existing.categories,
    });

    if (!supplier) {
      return resourceNotFound('Supplier', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    return NextResponse.json({ supplier });
  } catch (error) {
    console.error('PUT supplier error:', error);
    const d = getErrorDetails(error, 'Failed to update supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await getSupplierRecord(id);
    if (!existing) {
      return resourceNotFound('Supplier', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    await deleteSupplierRecord(id);

    return NextResponse.json({ message: 'Supplier deleted' });
  } catch (error) {
    console.error('DELETE supplier error:', error);
    const d = getErrorDetails(error, 'Failed to delete supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
