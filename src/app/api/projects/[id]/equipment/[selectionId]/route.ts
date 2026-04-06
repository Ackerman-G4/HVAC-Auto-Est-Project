/**
 * Individual Equipment Selection API — Update + Delete
 * PUT    /api/projects/[id]/equipment/[selectionId] — Update equipment overrides
 * DELETE /api/projects/[id]/equipment/[selectionId] — Remove equipment selection
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import { errorResponse, getErrorDetails, toInt, toNumber } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; selectionId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, selectionId } = await context.params;
    const body = await request.json();

    const existing = await neon.selectedEquipment.findUnique({
      where: { id: selectionId },
      include: {
        room: { include: { floor: true } },
        equipment: true,
      },
    });
    if (!existing || existing.room.floor.projectId !== projectId) {
      return errorResponse(404, 'Equipment selection not found', 'The selection does not exist in this project.', 'SELECTION_NOT_FOUND');
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

    const updated = await neon.selectedEquipment.update({
      where: { id: selectionId },
      data: {
        userQuantityOverride: nextQuantityOverride,
        userUnitPriceOverride: nextUnitPriceOverride,
        finalUnitPrice,
        isOverridden,
        overrideReason: body.overrideReason ?? existing.overrideReason,
        overrideUpdatedAt: isOverridden ? new Date() : null,
      },
      include: {
        equipment: {
          select: {
            manufacturer: true,
            model: true,
            type: true,
            capacityTR: true,
            capacityBTU: true,
            eer: true,
            refrigerant: true,
          },
        },
      },
    });

    await neon.project.update({
      where: { id: projectId },
      data: {
        isBoqStale: true,
        isEquipmentStale: false,
        lastBoqGeneratedAt: null,
        lastEquipmentSyncAt: new Date(),
      },
    });

    await neon.auditLog.create({
      data: {
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
      },
    });

    return NextResponse.json({
      equipment: {
        id: updated.id,
        roomId: updated.roomId,
        brand: updated.equipment.manufacturer,
        model: updated.equipment.model,
        type: updated.equipment.type,
        capacityTR: updated.equipment.capacityTR,
        capacityBTU: updated.equipment.capacityBTU,
        quantity: finalQuantity,
        suggestedUnitPrice,
        userQuantityOverride: updated.userQuantityOverride,
        userUnitPriceOverride: updated.userUnitPriceOverride,
        unitPrice: finalUnitPrice,
        totalPrice: finalUnitPrice * finalQuantity,
        eer: updated.equipment.eer,
        isInverter: updated.equipment.eer >= INVERTER_EER_THRESHOLD,
        refrigerant: updated.equipment.refrigerant,
        isOverridden: updated.isOverridden,
        sourceState: updated.isOverridden ? 'override' : 'suggested',
      },
    });
  } catch (error) {
    console.error('PUT equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to update equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, selectionId } = await context.params;

    const existing = await neon.selectedEquipment.findUnique({
      where: { id: selectionId },
      include: { room: { include: { floor: true } } },
    });
    if (!existing || existing.room.floor.projectId !== projectId) {
      return errorResponse(404, 'Equipment selection not found', 'The selection does not exist in this project.', 'SELECTION_NOT_FOUND');
    }

    await neon.selectedEquipment.delete({ where: { id: selectionId } });

    return NextResponse.json({ message: 'Equipment selection removed' });
  } catch (error) {
    console.error('DELETE equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to delete equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
