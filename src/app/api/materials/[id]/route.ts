/**
 * Individual Material API — Update + Delete
 * PUT    /api/materials/[id] — Update material
 * DELETE /api/materials/[id] — Delete material
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.material.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Material not found', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    const material = await prisma.material.update({
      where: { id },
      data: {
        category: body.category ?? existing.category,
        name: body.name ?? existing.name,
        specification: body.specification ?? existing.specification,
        unit: body.unit ?? existing.unit,
        unitPricePHP: body.unitPricePHP ?? existing.unitPricePHP,
        supplierId: body.supplierId !== undefined ? body.supplierId : existing.supplierId,
      },
      include: { supplier: true },
    });

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

    const existing = await prisma.material.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Material not found', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    await prisma.material.delete({ where: { id } });

    return NextResponse.json({ message: 'Material deleted' });
  } catch (error) {
    console.error('DELETE material error:', error);
    const d = getErrorDetails(error, 'Failed to delete material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
