/**
 * Individual Equipment Selection API — Update + Delete
 * PUT    /api/projects/[id]/equipment/[selectionId] — Update equipment overrides
 * DELETE /api/projects/[id]/equipment/[selectionId] — Remove equipment selection
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteSelectedEquipmentRecord,
  getSelectedEquipmentRecord,
  toApiEquipment,
  updateSelectedEquipmentRecord,
} from '@/lib/firebase/project-estimation-store';
import { updateProjectRecord, writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, resourceNotFound, toInt, toNumber } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; selectionId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, selectionId } = await context.params;
    const body = await request.json();

    const existing = await getSelectedEquipmentRecord(selectionId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('Equipment selection', 'The selection does not exist in this project.', 'SELECTION_NOT_FOUND');
    }

    const useSuggested = body.useSuggested === true;

    const nextQuantityOverride = useSuggested
      ? null
      : body.userQuantityOverride === null
        ? null
        : body.userQuantityOverride !== undefined
          ? Math.max(0, toInt(body.userQuantityOverride, existing.userQuantityOverride ?? (existing.suggestedQuantity || existing.quantity)))
          : existing.userQuantityOverride;

    const nextUnitPriceOverride = useSuggested
      ? null
      : body.userUnitPriceOverride === null
        ? null
        : body.userUnitPriceOverride !== undefined
          ? Math.max(
              0,
              toNumber(
                body.userUnitPriceOverride,
                existing.userUnitPriceOverride ?? (existing.suggestedUnitPrice || existing.equipment.unitPricePHP),
              ),
            )
          : existing.userUnitPriceOverride;

    const suggestedQuantity = existing.suggestedQuantity > 0 ? existing.suggestedQuantity : existing.quantity;
    const suggestedUnitPrice = existing.suggestedUnitPrice > 0 ? existing.suggestedUnitPrice : existing.equipment.unitPricePHP;
    const finalQuantity = nextQuantityOverride ?? suggestedQuantity;
    const finalUnitPrice = nextUnitPriceOverride ?? suggestedUnitPrice;
    const isOverridden = nextQuantityOverride !== null || nextUnitPriceOverride !== null;

    const updated = await updateSelectedEquipmentRecord(selectionId, {
      userQuantityOverride: nextQuantityOverride,
      userUnitPriceOverride: nextUnitPriceOverride,
      finalUnitPrice,
      isOverridden,
      overrideReason: body.overrideReason ?? existing.overrideReason,
      overrideUpdatedAt: isOverridden ? new Date().toISOString() : null,
    });

    if (!updated) {
      return resourceNotFound('Equipment selection', 'The selection does not exist in this project.', 'SELECTION_NOT_FOUND');
    }

    await updateProjectRecord(projectId, {
      isBoqStale: true,
      isEquipmentStale: false,
      lastBoqGeneratedAt: null,
      lastEquipmentSyncAt: new Date().toISOString(),
    });

    await writeAuditLog({
      projectId,
      action: 'updated',
      entity: 'selected_equipment',
      entityId: selectionId,
      details: JSON.stringify({
        userQuantityOverride: nextQuantityOverride,
        userUnitPriceOverride: nextUnitPriceOverride,
        finalQuantity,
        finalUnitPrice,
        isOverridden,
      }),
    });

    return NextResponse.json({ equipment: toApiEquipment(updated) });
  } catch (error) {
    console.error('PUT equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to update equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, selectionId } = await context.params;

    const existing = await getSelectedEquipmentRecord(selectionId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('Equipment selection', 'The selection does not exist in this project.', 'SELECTION_NOT_FOUND');
    }

    await deleteSelectedEquipmentRecord(selectionId);

    return NextResponse.json({ message: 'Equipment selection removed' });
  } catch (error) {
    console.error('DELETE equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to delete equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
