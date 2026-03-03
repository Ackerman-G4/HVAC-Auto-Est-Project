/**
 * Single Project API — GET, PUT, DELETE
 * GET    /api/projects/[id]
 * PUT    /api/projects/[id]
 * DELETE /api/projects/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import {
  toNumber,
  toInt,
  errorResponse,
  getErrorDetails,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        floors: {
          include: {
            rooms: {
              include: {
                coolingLoad: true,
                selectedEquipment: { include: { equipment: true } },
              },
            },
          },
          orderBy: { floorNumber: 'asc' },
        },
        boqItems: true,
        auditLogs: { orderBy: { timestamp: 'desc' }, take: 50 },
      },
    });

    if (!project) {
      return errorResponse(404, 'Project not found', 'The project ID does not match any existing project record.', 'PROJECT_NOT_FOUND');
    }

    // Flatten selectedEquipment from rooms for frontend
    const allSelectedEquipment = project.floors.flatMap((f) =>
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
        })),
      ),
    );

    return NextResponse.json({
      project: { ...project, selectedEquipment: allSelectedEquipment },
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

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Project not found', 'The project you are trying to update no longer exists.', 'PROJECT_NOT_FOUND');
    }

    const finalOutdoorDB = toNumber(body.outdoorDB, existing.outdoorDB);
    const finalOutdoorRH = toNumber(body.outdoorRH, existing.outdoorRH);
    const computedWB = calcWetBulb(finalOutdoorDB, finalOutdoorRH);

    const project = await prisma.project.update({
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
        notes: body.notes ?? existing.notes,
        status: body.status ?? existing.status,
      },
      include: { floors: { include: { rooms: true } } },
    });

    await prisma.auditLog.create({
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

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(404, 'Project not found', 'The project you are trying to delete no longer exists.', 'PROJECT_NOT_FOUND');
    }

    if (permanent) {
      await prisma.project.delete({ where: { id } });
    } else {
      await prisma.project.update({ where: { id }, data: { status: 'archived' } });
      await prisma.auditLog.create({
        data: {
          projectId: id,
          action: 'archived',
          entity: 'project',
          entityId: id,
          details: JSON.stringify({ name: existing.name }),
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
