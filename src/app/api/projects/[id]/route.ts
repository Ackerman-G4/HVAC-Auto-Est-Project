/**
 * Single Project API — GET, PUT, DELETE
 * GET /api/projects/[id]
 * PUT /api/projects/[id]
 * DELETE /api/projects/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';

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
                selectedEquipment: {
                  include: { equipment: true },
                },
              },
            },
          },
          orderBy: { floorNumber: 'asc' },
        },
        boqItems: true,
        auditLogs: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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
          isInverter: sel.equipment.eer >= 11,
          refrigerant: sel.equipment.refrigerant,
        }))
      )
    );

    const transformedProject = {
      ...project,
      selectedEquipment: allSelectedEquipment,
    };

    return NextResponse.json({ project: transformedProject });
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Auto-compute wet-bulb from dry-bulb + RH via Carrier psychrometric chart
    const finalOutdoorDB = body.outdoorDB ?? existing.outdoorDB;
    const finalOutdoorRH = body.outdoorRH ?? existing.outdoorRH;
    const computedWB = calcWetBulb(finalOutdoorDB, finalOutdoorRH);

    const project = await prisma.project.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        clientName: body.clientName ?? existing.clientName,
        buildingType: body.buildingType ?? existing.buildingType,
        location: body.location ?? existing.location,
        city: body.city ?? existing.city,
        totalFloorArea: body.totalFloorArea ?? existing.totalFloorArea,
        floorsAboveGrade: body.floorsAboveGrade ?? existing.floorsAboveGrade,
        floorsBelowGrade: body.floorsBelowGrade ?? existing.floorsBelowGrade,
        outdoorDB: finalOutdoorDB,
        outdoorWB: Math.round(computedWB * 100) / 100,
        outdoorRH: finalOutdoorRH,
        indoorDB: body.indoorDB ?? existing.indoorDB,
        indoorRH: body.indoorRH ?? existing.indoorRH,
        safetyFactor: body.safetyFactor ?? existing.safetyFactor,
        diversityFactor: body.diversityFactor ?? existing.diversityFactor,
        notes: body.notes ?? existing.notes,
        status: body.status ?? existing.status,
      },
      include: {
        floors: { include: { rooms: true } },
      },
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
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (permanent) {
      await prisma.project.delete({ where: { id } });
      // Audit log is also deleted via cascade
    } else {
      // Soft delete — archive
      await prisma.project.update({
        where: { id },
        data: { status: 'archived' },
      });
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
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
