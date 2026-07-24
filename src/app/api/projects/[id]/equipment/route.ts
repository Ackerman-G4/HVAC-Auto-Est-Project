/**
 * Equipment Selection API
 * GET  /api/projects/[id]/equipment — Get selected equipment
 * POST /api/projects/[id]/equipment — Auto-size + select equipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { sizeEquipment } from '@/lib/functions/equipment-sizing';
import { resolveUnitPrice, resolveManualSelection } from '@/lib/functions/equipment-pricing';
import { getPriceOverridesByModel, type PriceOverrideRecord } from '@/lib/firebase/price-override-store';
import {
  clearSelectedEquipmentForProject,
  createSelectedEquipmentRecord,
  listSelectedEquipmentForProject,
  toApiEquipment,
} from '@/lib/firebase/project-estimation-store';
import { getFloorsWithRooms, updateProjectRecord } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest, resourceNotFound, toNumber } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const EQUIPMENT_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const EQUIPMENT_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-equipment-get', EQUIPMENT_GET_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;

    const selections = await listSelectedEquipmentForProject(id);
    const equipment = selections.map((selection) => toApiEquipment(selection));

    return NextResponse.json({ equipment });
  } catch (error) {
    console.error('GET equipment error:', error);
    const d = getErrorDetails(error, 'Failed to fetch equipment');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-equipment-post', EQUIPMENT_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id: projectId } = await context.params;

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const body = await request.json();

    if (body.autoSize) {
      const floors = await getFloorsWithRooms(projectId, {
        includeRoomEquipment: false,
        includeRoomEquipmentCount: false,
      });

      const allRooms = floors.flatMap((f) => f.rooms);
      if (allRooms.length === 0) {
        return errorResponse(400, 'No rooms found', 'Add rooms to the project before auto-sizing equipment.', 'NO_ROOMS');
      }

      const roomsWithLoads = allRooms.filter((r) => r.coolingLoad && typeof r.coolingLoad === 'object');
      if (roomsWithLoads.length === 0) {
        return errorResponse(400, 'No cooling loads calculated', 'Run "Calculate" first to compute cooling loads for all rooms before auto-sizing equipment.', 'NO_LOADS');
      }

      const results: { room: string; equipment: { id: string; brand: string; model: string; type: string; capacityTR: number; quantity: number }; alternatives: ReturnType<typeof sizeEquipment>['alternatives'] }[] = [];

      // Admin price overrides are authoritative over the catalog price (Wave 8).
      let overrides = new Map<string, PriceOverrideRecord>();
      try {
        overrides = await getPriceOverridesByModel();
      } catch (overrideError) {
        console.error('auto-size price override lookup failed:', overrideError);
      }

      await clearSelectedEquipmentForProject(projectId);

      for (const floor of floors) {
        for (const room of floor.rooms) {
          if (!room.coolingLoad || typeof room.coolingLoad !== 'object') continue;
          const load = room.coolingLoad as Record<string, unknown>;

          const sizing = sizeEquipment({
            totalLoadWatts: toNumber(load.totalLoad, 0),
            trValue: toNumber(load.trValue, 0),
            btuPerHour: toNumber(load.btuPerHour, 0),
            spaceType: room.spaceType,
            roomArea: room.area,
            ceilingHeight: room.ceilingHeight,
            budgetLevel: body.budgetLevel || 'mid-range',
            preferredBrand: body.preferredBrand,
            preferredType: body.preferredType,
          });

          if (sizing.recommended.length === 0) continue;

          const top = sizing.recommended[0];
          const catalogPrice = (top.equipment.priceMin + top.equipment.priceMax) / 2;
          // Apply an admin override if one exists for this model.
          const { unitPrice, overridden } = resolveUnitPrice(top.equipment.model, overrides, catalogPrice);
          const eer = top.equipment.eer || 10;

          const selection = await createSelectedEquipmentRecord({
            projectId,
            roomId: room.id,
            quantity: top.quantity,
            suggestedQuantity: top.quantity,
            suggestedUnitPrice: unitPrice,
            finalUnitPrice: unitPrice,
            isOverridden: overridden,
            equipment: {
              manufacturer: top.equipment.brand,
              model: top.equipment.model,
              type: top.equipment.type,
              capacityTR: top.equipment.capacityTR,
              capacityBTU: top.equipment.capacityBTU,
              capacityKW: top.equipment.capacityKW,
              unitPricePHP: unitPrice,
              eer,
              refrigerant: top.equipment.refrigerant || 'R32',
              powerSupply: top.equipment.powerSupply || '',
            },
          });

          results.push({
            room: room.name,
            equipment: {
              id: selection.id,
              brand: top.equipment.brand,
              model: top.equipment.model,
              type: top.equipment.type,
              capacityTR: top.equipment.capacityTR,
              quantity: top.quantity,
            },
            alternatives: sizing.alternatives.slice(0, 3),
          });
        }
      }

      await updateProjectRecord(projectId, {
        isEquipmentStale: false,
        isBoqStale: true,
        lastBoqGeneratedAt: null,
        lastEquipmentSyncAt: new Date().toISOString(),
      });

      return NextResponse.json({ results }, { status: 201 });
    }

    // Manual equipment selection
    const floors = await getFloorsWithRooms(projectId, {
      includeRoomEquipment: false,
      includeRoomEquipmentCount: false,
    });
    const roomExists = floors.some((floor) => floor.rooms.some((room) => room.id === body.roomId));
    if (!roomExists) {
      return resourceNotFound('Room', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    // Resolve price + capacity SERVER-SIDE for real catalog SKUs; the client's
    // unitPrice/capacityBTU are ignored unless the item is genuinely off-catalog
    // (unknown model, or explicit custom: true). Admin overrides win (Wave 8).
    let manualOverrides = new Map<string, PriceOverrideRecord>();
    try {
      manualOverrides = await getPriceOverridesByModel();
    } catch (overrideError) {
      console.error('manual-selection price override lookup failed:', overrideError);
    }
    const resolved = resolveManualSelection(
      {
        model: body.model,
        brand: body.brand,
        type: body.type,
        capacityBTU: body.capacityBTU,
        capacityTR: body.capacityTR,
        eer: body.eer,
        refrigerant: body.refrigerant,
        unitPrice: body.unitPrice,
        custom: body.custom === true,
      },
      manualOverrides,
    );

    const selection = await createSelectedEquipmentRecord({
      projectId,
      roomId: body.roomId,
      quantity: body.quantity || 1,
      suggestedQuantity: body.quantity || 1,
      suggestedUnitPrice: resolved.unitPricePHP,
      finalUnitPrice: resolved.unitPricePHP,
      isOverridden: resolved.overridden,
      equipment: {
        manufacturer: resolved.manufacturer,
        model: resolved.model,
        type: resolved.type,
        capacityTR: resolved.capacityTR,
        capacityBTU: resolved.capacityBTU,
        capacityKW: resolved.capacityKW,
        unitPricePHP: resolved.unitPricePHP,
        eer: resolved.eer,
        refrigerant: resolved.refrigerant,
        powerSupply: body.powerSupply || '',
      },
    });

    await updateProjectRecord(projectId, {
      isEquipmentStale: false,
      isBoqStale: true,
      lastBoqGeneratedAt: null,
      lastEquipmentSyncAt: new Date().toISOString(),
    });

    return NextResponse.json({ equipment: selection }, { status: 201 });
  } catch (error) {
    console.error('POST equipment error:', error);
    const d = getErrorDetails(error, 'Failed to select equipment');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
