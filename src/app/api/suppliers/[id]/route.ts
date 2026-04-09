/**
 * Individual Supplier API — Update + Delete
 * PUT    /api/suppliers/[id] — Update supplier
 * DELETE /api/suppliers/[id] — Delete supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import {
  deleteSupplierRecord,
  getSupplierRecord,
  updateSupplierRecord,
} from '@/lib/firebase/catalog-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, resourceNotFound } from '@/lib/utils/api-helpers';
import {
  getCatalogValidationError,
  supplierUpdateSchema,
} from '@/lib/validation/catalog';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = supplierUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getCatalogValidationError(parsed.error) }, { status: 400 });
    }

    const payload = parsed.data;

    const existing = await getSupplierRecord(id);
    if (!existing) {
      return resourceNotFound('Supplier', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    const supplier = await updateSupplierRecord(id, {
      name: payload.name ?? existing.name,
      type: payload.type ?? existing.type,
      website: payload.website ?? existing.website,
      location: payload.location ?? existing.location,
      contactInfo: payload.contactInfo ?? existing.contactInfo,
      coverageArea: payload.coverageArea ?? existing.coverageArea,
      categories: 'categories' in payload
        ? JSON.stringify(payload.categories ?? [])
        : existing.categories,
    });

    if (!supplier) {
      return resourceNotFound('Supplier', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    await writeAuditLog({
      projectId: 'system',
      action: 'updated',
      entity: 'supplier',
      entityId: supplier.id,
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
      }),
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(supplier),
    });

    return NextResponse.json({ supplier });
  } catch (error) {
    console.error('PUT supplier error:', error);
    const d = getErrorDetails(error, 'Failed to update supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;

    const existing = await getSupplierRecord(id);
    if (!existing) {
      return resourceNotFound('Supplier', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    await deleteSupplierRecord(id);

    await writeAuditLog({
      projectId: 'system',
      action: 'deleted',
      entity: 'supplier',
      entityId: id,
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
      }),
      previousValue: JSON.stringify(existing),
    });

    return NextResponse.json({ message: 'Supplier deleted' });
  } catch (error) {
    console.error('DELETE supplier error:', error);
    const d = getErrorDetails(error, 'Failed to delete supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
