/**
 * Rooms API — CRUD + Cooling Load Calculation
 * GET  /api/projects/[id]/rooms — List rooms
 * POST /api/projects/[id]/rooms — Create room
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import {
  errorResponse,
  getErrorDetails,
  buildCoolingLoadInput,
  coolingLoadToDbFields,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const floors = await prisma.floor.findMany({
      where: { projectId: id },
      include: { rooms: { include: { coolingLoad: true } } },
      orderBy: { floorNumber: 'asc' },
    });

    return NextResponse.json({ floors });
  } catch (error) {
    console.error('GET rooms error:', error);
    const d = getErrorDetails(error, 'Failed to fetch rooms');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const body = await request.json();

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return errorResponse(404, 'Project not found', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    // Find or create floor
    let floor = await prisma.floor.findFirst({
      where: { projectId, floorNumber: body.floorNumber || 1 },
    });
    if (!floor) {
      floor = await prisma.floor.create({
        data: {
          projectId,
          floorNumber: body.floorNumber || 1,
          name: body.floorName || `Floor ${body.floorNumber || 1}`,
          ceilingHeight: body.ceilingHeight || 2.7,
        },
      });
    }

    // Create room
    const room = await prisma.room.create({
      data: {
        floorId: floor.id,
        name: body.name || 'New Room',
        spaceType: body.spaceType || 'office',
        area: body.area || 0,
        ceilingHeight: body.ceilingHeight || floor.ceilingHeight,
        wallConstruction: body.wallConstruction || 'concrete_block_200mm',
        windowType: body.windowType || 'single_clear_6mm',
        windowArea: body.windowArea || 0,
        windowOrientation: body.windowOrientation || 'N',
        occupantCount: body.occupantCount || 0,
        lightingDensity: body.lightingDensity || 15,
        equipmentLoad: body.equipmentLoad || 10,
        hasRoofExposure: body.hasRoofExposure || false,
        notes: body.notes || '',
      },
    });

    // Auto‑calculate cooling load when room has an area
    if (room.area > 0) {
      const loadInput = buildCoolingLoadInput(room, project);
      const result = calculateCoolingLoad(loadInput, room.id, room.name);

      await prisma.coolingLoad.create({
        data: { roomId: room.id, ...coolingLoadToDbFields(result) },
      });
    }

    const createdRoom = await prisma.room.findUnique({
      where: { id: room.id },
      include: { coolingLoad: true },
    });

    return NextResponse.json({ room: createdRoom }, { status: 201 });
  } catch (error) {
    console.error('POST rooms error:', error);
    const d = getErrorDetails(error, 'Failed to create room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
