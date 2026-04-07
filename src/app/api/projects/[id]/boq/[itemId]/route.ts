/**
 * Individual BOQ Item API — Update + Delete
 * PUT    /api/projects/[id]/boq/[itemId] — Update BOQ item
 * DELETE /api/projects/[id]/boq/[itemId] — Delete BOQ item
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteBoqItemRecord,
  getBoqItemRecord,
  updateBoqItemRecord,
} from '@/lib/firebase/project-estimation-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, resourceNotFound } from '@/lib/utils/api-helpers';
import { finalizeDualValue } from '@/lib/utils/dual-control';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, itemId } = await context.params;
    const body = await request.json();

    const existing = await getBoqItemRecord(itemId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('BOQ item', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
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

    const item = await updateBoqItemRecord(itemId, {
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
      overrideUpdatedAt: resolvedUnitPrice.isOverridden ? new Date().toISOString() : null,
      notes: body.notes ?? existing.notes,
    });

    if (!item) {
      return resourceNotFound('BOQ item', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    await writeAuditLog({
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

    const existing = await getBoqItemRecord(itemId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('BOQ item', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    await deleteBoqItemRecord(itemId);

    return NextResponse.json({ message: 'BOQ item deleted' });
  } catch (error) {
    console.error('DELETE BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to delete BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
