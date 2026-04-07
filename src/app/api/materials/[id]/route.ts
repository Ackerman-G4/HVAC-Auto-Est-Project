/**
 * Individual Material API — Update + Delete
 * PUT    /api/materials/[id] — Update material
 * DELETE /api/materials/[id] — Delete material
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteMaterialRecord,
  getMaterialRecord,
  getSupplierRecord,
  updateMaterialRecord,
} from '@/lib/firebase/catalog-store';
import { errorResponse, getErrorDetails, resourceNotFound } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await getMaterialRecord(id);
    if (!existing) {
      return resourceNotFound('Material', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    const updated = await updateMaterialRecord(id, {
      category: body.category ?? existing.category,
      name: body.name ?? existing.name,
      specification: body.specification ?? existing.specification,
      unit: body.unit ?? existing.unit,
      unitPricePHP: body.unitPricePHP ?? existing.unitPricePHP,
      supplierId: body.supplierId !== undefined ? body.supplierId : existing.supplierId,
    });

    if (!updated) {
      return resourceNotFound('Material', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    const supplier = updated.supplierId ? await getSupplierRecord(updated.supplierId) : null;
    const material = { ...updated, supplier };

    return NextResponse.json({ material });
  } catch (error) {
    console.error('PUT material error:', error);
    const d = getErrorDetails(error, 'Failed to update material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await getMaterialRecord(id);
    if (!existing) {
      return resourceNotFound('Material', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    await deleteMaterialRecord(id);

    return NextResponse.json({ message: 'Material deleted' });
  } catch (error) {
    console.error('DELETE material error:', error);
    const d = getErrorDetails(error, 'Failed to delete material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
