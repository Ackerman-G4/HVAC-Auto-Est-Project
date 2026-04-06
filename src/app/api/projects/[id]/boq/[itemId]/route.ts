/**
 * Individual BOQ Item API — Update + Delete
 * PUT    /api/projects/[id]/boq/[itemId] — Update BOQ item
 * DELETE /api/projects/[id]/boq/[itemId] — Delete BOQ item
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeon } from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import { finalizeDualValue } from '@/lib/utils/dual-control';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const neon = getNeon();
    const { id: projectId, itemId } = await context.params;
    const body = await request.json();

    const existing = await neon.bOQItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.projectId !== projectId) {
      return errorResponse(404, 'BOQ item not found', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    const quantity = body.quantity ?? existing.quantity;
    const suggestedUnitPrice = body.suggestedUnitPrice ?? existing.suggestedUnitPrice ?? existing.unitPrice;
    const clearOverride = body.useSuggested === true || body.userUnitPriceOverride === null || body.unitPrice === null;
    const userUnitPriceOverride = clearOverride
      ? null
      : (body.userUnitPriceOverride ?? body.unitPrice ?? existing.userUnitPriceOverride);
    const resolvedUnitPrice = finalizeDualValue(suggestedUnitPrice, userUnitPriceOverride);
    const suggestedTotalPrice = suggestedUnitPrice * quantity;
    const userTotalPriceOverride = resolvedUnitPrice.isOverridden ? resolvedUnitPrice.final * quantity : null;
    const finalTotalPrice = resolvedUnitPrice.final * quantity;

    const item = await neon.bOQItem.update({
      where: { id: itemId },
      data: {
        description: body.description ?? existing.description,
        specification: body.specification ?? existing.specification,
        quantity,
        unit: body.unit ?? existing.unit,
        suggestedUnitPrice,
        suggestedTotalPrice,
        userUnitPriceOverride,
        userTotalPriceOverride,
        finalUnitPrice: resolvedUnitPrice.final,
        finalTotalPrice,
        unitPrice: resolvedUnitPrice.final,
        totalPrice: finalTotalPrice,
        sourceState: resolvedUnitPrice.source,
        isOverridden: resolvedUnitPrice.isOverridden,
        overrideReason: resolvedUnitPrice.isOverridden ? (body.overrideReason ?? existing.overrideReason) : '',
        overrideUpdatedAt: resolvedUnitPrice.isOverridden ? new Date() : null,
        notes: body.notes ?? existing.notes,
      },
    });

    await neon.auditLog.create({
      data: {
        projectId,
        action: 'updated',
        entity: 'boq_item',
        entityId: itemId,
        previousValue: JSON.stringify({
          quantity: existing.quantity,
          unitPrice: existing.finalUnitPrice ?? existing.unitPrice,
          totalPrice: existing.finalTotalPrice ?? existing.totalPrice,
          isOverridden: existing.isOverridden,
        }),
        newValue: JSON.stringify({
          quantity: item.quantity,
          unitPrice: item.finalUnitPrice ?? item.unitPrice,
          totalPrice: item.finalTotalPrice ?? item.totalPrice,
          isOverridden: item.isOverridden,
        }),
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
    const neon = getNeon();
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
