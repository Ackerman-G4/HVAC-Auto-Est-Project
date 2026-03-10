/**
 * Individual BOQ Item API — Update + Delete
 * PUT    /api/projects/[id]/boq/[itemId] — Update BOQ item
 * DELETE /api/projects/[id]/boq/[itemId] — Delete BOQ item
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, itemId } = await context.params;
    const body = await request.json();

    const existing = await neon.bOQItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.projectId !== projectId) {
      return errorResponse(404, 'BOQ item not found', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    const quantity = body.quantity ?? existing.quantity;
    const unitPrice = body.unitPrice ?? existing.unitPrice;

    const item = await neon.bOQItem.update({
      where: { id: itemId },
      data: {
        description: body.description ?? existing.description,
        specification: body.specification ?? existing.specification,
        quantity,
        unit: body.unit ?? existing.unit,
        unitPrice,
        totalPrice: quantity * unitPrice,
        notes: body.notes ?? existing.notes,
      },
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error('PUT BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to update BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, itemId } = await context.params;

    const existing = await neon.bOQItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.projectId !== projectId) {
      return errorResponse(404, 'BOQ item not found', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    await neon.bOQItem.delete({ where: { id: itemId } });

    return NextResponse.json({ message: 'BOQ item deleted' });
  } catch (error) {
    console.error('DELETE BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to delete BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
