/**
 * Equipment Selection API
 * GET  /api/projects/[id]/equipment — Get selected equipment
 * POST /api/projects/[id]/equipment — Auto-size + select equipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { sizeEquipment } from '@/lib/functions/equipment-sizing';
import {
  clearSelectedEquipmentForProject,
  createSelectedEquipmentRecord,
  listSelectedEquipmentForProject,
  toApiEquipment,
} from '@/lib/firebase/project-estimation-store';
import { getFloorsWithRooms, updateProjectRecord } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, resourceNotFound, toNumber } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
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
    const { id: projectId } = await context.params;
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
          const avgPrice = (top.equipment.priceMin + top.equipment.priceMax) / 2;
          const eer = top.equipment.eer || 10;

          const selection = await createSelectedEquipmentRecord({
            projectId,
            roomId: room.id,
            quantity: top.quantity,
            suggestedQuantity: top.quantity,
            suggestedUnitPrice: avgPrice,
            finalUnitPrice: avgPrice,
            isOverridden: false,
            equipment: {
              manufacturer: top.equipment.brand,
              model: top.equipment.model,
              type: top.equipment.type,
              capacityTR: top.equipment.capacityTR,
              capacityBTU: top.equipment.capacityBTU,
              capacityKW: top.equipment.capacityKW,
              unitPricePHP: avgPrice,
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

    const eer = body.eer || 10;
    const selection = await createSelectedEquipmentRecord({
      projectId,
      roomId: body.roomId,
      quantity: body.quantity || 1,
      suggestedQuantity: body.quantity || 1,
      suggestedUnitPrice: body.unitPrice || 0,
      finalUnitPrice: body.unitPrice || 0,
      isOverridden: false,
      equipment: {
        manufacturer: body.brand || '',
        model: body.model || '',
        type: body.type || 'wall_split',
        capacityTR: body.capacityTR || body.capacityBTU / 12000,
        capacityBTU: body.capacityBTU || 0,
        capacityKW: (body.capacityBTU || 0) * 0.000293,
        unitPricePHP: body.unitPrice || 0,
        eer,
        refrigerant: body.refrigerant || 'R32',
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
