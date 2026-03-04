/**
 * Equipment Selection API
 * GET  /api/projects/[id]/equipment — Get selected equipment
 * POST /api/projects/[id]/equipment — Auto-size + select equipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sizeEquipment } from '@/lib/functions/equipment-sizing';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const floors = await prisma.floor.findMany({
      where: { projectId: id },
      include: {
        rooms: {
          include: { selectedEquipment: { include: { equipment: true } } },
        },
      },
    });

    const equipment = floors.flatMap((f) =>
      f.rooms.flatMap((r) =>
        r.selectedEquipment.map((sel) => ({
          id: sel.id,
          roomId: sel.roomId,
          brand: sel.equipment.manufacturer,
          model: sel.equipment.model,
          type: sel.equipment.type,
          capacityTR: sel.equipment.capacityTR,
          capacityBTU: sel.equipment.capacityBTU,
          quantity: sel.quantity,
          unitPrice: sel.equipment.unitPricePHP,
          totalPrice: sel.equipment.unitPricePHP * sel.quantity,
          eer: sel.equipment.eer,
          isInverter: sel.equipment.eer >= INVERTER_EER_THRESHOLD,
          refrigerant: sel.equipment.refrigerant,
        }))
      )
    );

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
      const floors = await prisma.floor.findMany({
        where: { projectId },
        include: { rooms: { include: { coolingLoad: true } } },
      });

      const allRooms = floors.flatMap((f) => f.rooms);
      if (allRooms.length === 0) {
        return errorResponse(400, 'No rooms found', 'Add rooms to the project before auto-sizing equipment.', 'NO_ROOMS');
      }

      const roomsWithLoads = allRooms.filter((r) => r.coolingLoad);
      if (roomsWithLoads.length === 0) {
        return errorResponse(400, 'No cooling loads calculated', 'Run "Calculate" first to compute cooling loads for all rooms before auto-sizing equipment.', 'NO_LOADS');
      }

      // Batch-clear existing selected equipment for every room in the project
      const roomIds = allRooms.map((r) => r.id);
      await prisma.selectedEquipment.deleteMany({ where: { roomId: { in: roomIds } } });

      const results = [];

      for (const floor of floors) {
        for (const room of floor.rooms) {
          if (!room.coolingLoad) continue;

          const sizing = sizeEquipment({
            totalLoadWatts: room.coolingLoad.totalLoad,
            trValue: room.coolingLoad.trValue,
            btuPerHour: room.coolingLoad.btuPerHour,
            spaceType: room.spaceType,
            roomArea: room.area,
            ceilingHeight: room.ceilingHeight,
            budgetLevel: body.budgetLevel || 'mid-range',
            preferredBrand: body.preferredBrand,
            preferredType: body.preferredType,
          });

          if (sizing.recommended.length > 0) {
            const top = sizing.recommended[0];
            const avgPrice = (top.equipment.priceMin + top.equipment.priceMax) / 2;
            const eer = top.equipment.eer || 10;

            const equipmentRecord = await prisma.equipment.upsert({
              where: { id: top.equipment.id },
              update: {},
              create: {
                id: top.equipment.id,
                manufacturer: top.equipment.brand,
                model: top.equipment.model,
                type: top.equipment.type,
                capacityTR: top.equipment.capacityTR,
                capacityBTU: top.equipment.capacityBTU,
                capacityKW: top.equipment.capacityKW,
                powerInputKW: top.equipment.capacityKW / eer,
                currentAmps: 0,
                phase: top.equipment.powerSupply?.includes('3') ? '3-phase' : '1-phase',
                voltage: top.equipment.powerSupply?.includes('380') ? 380 : 220,
                refrigerant: top.equipment.refrigerant || 'R32',
                eer,
                cop: eer / 3.412,
                unitPricePHP: avgPrice,
              },
            });

            const sel = await prisma.selectedEquipment.create({
              data: {
                roomId: room.id,
                equipmentId: equipmentRecord.id,
                quantity: top.quantity,
              },
            });

            results.push({
              room: room.name,
              equipment: {
                id: sel.id,
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
      }

      return NextResponse.json({ results }, { status: 201 });
    }

    // Manual equipment selection
    const eer = body.eer || 10;
    const equipmentRecord = await prisma.equipment.upsert({
      where: { id: body.equipmentId || 'new' },
      update: {},
      create: {
        manufacturer: body.brand || '',
        model: body.model || '',
        type: body.type || 'wall_split',
        capacityTR: body.capacityTR || body.capacityBTU / 12000,
        capacityBTU: body.capacityBTU || 0,
        capacityKW: (body.capacityBTU || 0) * 0.000293,
        powerInputKW: 0,
        currentAmps: 0,
        refrigerant: body.refrigerant || 'R32',
        eer,
        cop: eer / 3.412,
        unitPricePHP: body.unitPrice || 0,
      },
    });

    const sel = await prisma.selectedEquipment.create({
      data: {
        roomId: body.roomId,
        equipmentId: equipmentRecord.id,
        quantity: body.quantity || 1,
      },
    });

    return NextResponse.json({ equipment: sel }, { status: 201 });
  } catch (error) {
    console.error('POST equipment error:', error);
    const d = getErrorDetails(error, 'Failed to select equipment');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
