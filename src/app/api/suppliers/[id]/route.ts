/**
 * Individual Supplier API — Update + Delete
 * PUT    /api/suppliers/[id] — Update supplier
 * DELETE /api/suppliers/[id] — Delete supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await neon.supplier.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Supplier not found', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    const supplier = await neon.supplier.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        type: body.type ?? existing.type,
        website: body.website ?? existing.website,
        location: body.location ?? existing.location,
        contactInfo: body.contactInfo ?? existing.contactInfo,
        coverageArea: body.coverageArea ?? existing.coverageArea,
        categories: body.categories ? JSON.stringify(body.categories) : existing.categories,
      },
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
    const { id } = await context.params;

    const existing = await neon.supplier.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Supplier not found', 'The supplier does not exist.', 'SUPPLIER_NOT_FOUND');
    }

    await neon.supplier.delete({ where: { id } });

    return NextResponse.json({ message: 'Supplier deleted' });
  } catch (error) {
    console.error('DELETE supplier error:', error);
    const d = getErrorDetails(error, 'Failed to delete supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
