/**
 * Single Project API — GET, PUT, DELETE
 * GET    /api/projects/[id]
 * PUT    /api/projects/[id]
 * DELETE /api/projects/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import { finalizeDualValue } from '@/lib/utils/dual-control';
import {
  toNumber,
  toInt,
  errorResponse,
  getErrorDetails,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

function toNullableNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  const parsed = toNumber(value, NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const project = await neon.project.findUnique({
      where: { id },
      include: {
        floors: {
          include: {
            rooms: {
              include: {
                coolingLoad: true,
              },
            },
          },
          orderBy: { floorNumber: 'asc' },
        },
        boqItems: true,
      },
    });

    if (!project) {
      return errorResponse(404, 'Project not found', 'The project ID does not match any existing project record.', 'PROJECT_NOT_FOUND');
    }

    // Fetch selected equipment in a focused query to keep detail endpoint responsive.
    const selectedEquipment = await neon.selectedEquipment.findMany({
      where: {
        room: {
          floor: {
            projectId: id,
          },
        },
      },
      include: {
        equipment: {
          select: {
            manufacturer: true,
            model: true,
            type: true,
            capacityTR: true,
            capacityBTU: true,
            unitPricePHP: true,
            eer: true,
            refrigerant: true,
          },
        },
      },
    });

    const allSelectedEquipment = selectedEquipment.map((sel) => {
      const suggestedQuantity = sel.suggestedQuantity > 0 ? sel.suggestedQuantity : sel.quantity;
      const quantity = sel.userQuantityOverride ?? suggestedQuantity;
      const suggestedUnitPrice = sel.suggestedUnitPrice || sel.equipment.unitPricePHP;
      const finalUnitPrice =
        sel.userUnitPriceOverride ??
        (sel.finalUnitPrice > 0 ? sel.finalUnitPrice : suggestedUnitPrice);

      return {
        id: sel.id,
        roomId: sel.roomId,
        brand: sel.equipment.manufacturer,
        model: sel.equipment.model,
        type: sel.equipment.type,
        capacityTR: sel.equipment.capacityTR,
        capacityBTU: sel.equipment.capacityBTU,
        quantity,
        suggestedQuantity,
        userQuantityOverride: sel.userQuantityOverride,
        suggestedUnitPrice,
        userUnitPriceOverride: sel.userUnitPriceOverride,
        unitPrice: finalUnitPrice,
        totalPrice: finalUnitPrice * quantity,
        eer: sel.equipment.eer,
        isInverter: sel.equipment.eer >= INVERTER_EER_THRESHOLD,
        refrigerant: sel.equipment.refrigerant,
        isOverridden: sel.isOverridden,
        sourceState: sel.isOverridden ? 'override' : 'suggested',
      };
    });

    const boqItems = project.boqItems.map((item) => {
      const suggestedUnitPrice = item.suggestedUnitPrice > 0 ? item.suggestedUnitPrice : item.unitPrice;
      const finalUnitPrice = item.finalUnitPrice > 0 ? item.finalUnitPrice : item.unitPrice;
      const suggestedTotalPrice = item.suggestedTotalPrice > 0 ? item.suggestedTotalPrice : suggestedUnitPrice * item.quantity;
      const finalTotalPrice = item.finalTotalPrice > 0 ? item.finalTotalPrice : finalUnitPrice * item.quantity;

      return {
        ...item,
        suggestedUnitPrice,
        suggestedTotalPrice,
        finalUnitPrice,
        finalTotalPrice,
        unitPrice: finalUnitPrice,
        totalPrice: finalTotalPrice,
        sourceState: item.isOverridden ? 'override' : 'suggested',
      };
    });

    const pricingPolicy = {
      laborMultiplier: finalizeDualValue(project.suggestedLaborMultiplier, project.laborMultiplierOverride),
      overheadPercent: finalizeDualValue(project.suggestedOverheadPercent, project.overheadPercentOverride),
      contingencyPercent: finalizeDualValue(project.suggestedContingencyPercent, project.contingencyPercentOverride),
      vatRate: finalizeDualValue(project.suggestedVatRate, project.vatRateOverride),
    };

    return NextResponse.json({
      project: {
        ...project,
        boqItems,
        selectedEquipment: allSelectedEquipment,
        pricingPolicy,
      },
    });
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to fetch project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await neon.project.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Project not found', 'The project you are trying to update no longer exists.', 'PROJECT_NOT_FOUND');
    }

    const finalOutdoorDB = toNumber(body.outdoorDB, existing.outdoorDB);
    const finalOutdoorRH = toNumber(body.outdoorRH, existing.outdoorRH);
    const computedWB = calcWetBulb(finalOutdoorDB, finalOutdoorRH);

    const nextSuggestedLaborMultiplier = toNumber(body.suggestedLaborMultiplier, existing.suggestedLaborMultiplier);
    const nextLaborMultiplierOverride = toNullableNumber(body.laborMultiplierOverride, existing.laborMultiplierOverride);
    const nextSuggestedOverheadPercent = toNumber(body.suggestedOverheadPercent, existing.suggestedOverheadPercent);
    const nextOverheadPercentOverride = toNullableNumber(body.overheadPercentOverride, existing.overheadPercentOverride);
    const nextSuggestedContingencyPercent = toNumber(
      body.suggestedContingencyPercent,
      existing.suggestedContingencyPercent,
    );
    const nextContingencyPercentOverride = toNullableNumber(
      body.contingencyPercentOverride,
      existing.contingencyPercentOverride,
    );
    const nextSuggestedVatRate = toNumber(body.suggestedVatRate, existing.suggestedVatRate);
    const nextVatRateOverride = toNullableNumber(body.vatRateOverride, existing.vatRateOverride);

    const pricingChanged =
      nextSuggestedLaborMultiplier !== existing.suggestedLaborMultiplier ||
      nextLaborMultiplierOverride !== existing.laborMultiplierOverride ||
      nextSuggestedOverheadPercent !== existing.suggestedOverheadPercent ||
      nextOverheadPercentOverride !== existing.overheadPercentOverride ||
      nextSuggestedContingencyPercent !== existing.suggestedContingencyPercent ||
      nextContingencyPercentOverride !== existing.contingencyPercentOverride ||
      nextSuggestedVatRate !== existing.suggestedVatRate ||
      nextVatRateOverride !== existing.vatRateOverride;

    const project = await neon.project.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        clientName: body.clientName ?? existing.clientName,
        buildingType: body.buildingType ?? existing.buildingType,
        location: body.location ?? existing.location,
        city: body.city ?? existing.city,
        totalFloorArea: toNumber(body.totalFloorArea, existing.totalFloorArea),
        floorsAboveGrade: toInt(body.floorsAboveGrade, existing.floorsAboveGrade),
        floorsBelowGrade: toInt(body.floorsBelowGrade, existing.floorsBelowGrade),
        outdoorDB: finalOutdoorDB,
        outdoorWB: Math.round(computedWB * 100) / 100,
        outdoorRH: finalOutdoorRH,
        indoorDB: toNumber(body.indoorDB, existing.indoorDB),
        indoorRH: toNumber(body.indoorRH, existing.indoorRH),
        safetyFactor: toNumber(body.safetyFactor, existing.safetyFactor),
        diversityFactor: toNumber(body.diversityFactor, existing.diversityFactor),
        suggestedLaborMultiplier: nextSuggestedLaborMultiplier,
        laborMultiplierOverride: nextLaborMultiplierOverride,
        suggestedOverheadPercent: nextSuggestedOverheadPercent,
        overheadPercentOverride: nextOverheadPercentOverride,
        suggestedContingencyPercent: nextSuggestedContingencyPercent,
        contingencyPercentOverride: nextContingencyPercentOverride,
        suggestedVatRate: nextSuggestedVatRate,
        vatRateOverride: nextVatRateOverride,
        isBoqStale: pricingChanged ? true : existing.isBoqStale,
        lastBoqGeneratedAt: pricingChanged ? null : existing.lastBoqGeneratedAt,
        notes: body.notes ?? existing.notes,
        status: body.status ?? existing.status,
      },
      include: { floors: { include: { rooms: true } } },
    });

    await neon.auditLog.create({
      data: {
        projectId: id,
        action: 'updated',
        entity: 'project',
        entityId: id,
        details: JSON.stringify(body),
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error('PUT /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to update project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const permanent = new URL(request.url).searchParams.get('permanent') === 'true';

    const existing = await neon.project.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Project not found', 'The project you are trying to delete no longer exists.', 'PROJECT_NOT_FOUND');
    }

    if (permanent) {
      await neon.project.delete({ where: { id } });
    } else {
      await neon.project.update({ where: { id }, data: { status: 'deleted' } });
      await neon.auditLog.create({
        data: {
          projectId: id,
          action: 'deleted',
          entity: 'project',
          entityId: id,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to delete project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
