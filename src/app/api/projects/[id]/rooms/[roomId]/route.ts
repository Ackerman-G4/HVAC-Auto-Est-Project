/**
 * Individual Room API — Update + Delete
 * PUT    /api/projects/[id]/rooms/[roomId] — Update room
 * DELETE /api/projects/[id]/rooms/[roomId] — Delete room
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import {
  errorResponse,
  getErrorDetails,
  buildCoolingLoadInput,
  coolingLoadToDbFields,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; roomId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, roomId } = await context.params;
    const body = await request.json();

    const existing = await neon.room.findUnique({
      where: { id: roomId },
      include: { floor: true },
    });
    if (!existing || existing.floor.projectId !== projectId) {
      return errorResponse(404, 'Room not found', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    const room = await neon.room.update({
      where: { id: roomId },
      data: {
        name: body.name ?? existing.name,
        spaceType: body.spaceType ?? existing.spaceType,
        area: body.area ?? existing.area,
        perimeter: body.perimeter ?? existing.perimeter,
        polygon: body.polygon ? JSON.stringify(body.polygon) : existing.polygon,
        ceilingHeight: body.ceilingHeight ?? existing.ceilingHeight,
        wallConstruction: body.wallConstruction ?? existing.wallConstruction,
        windowType: body.windowType ?? existing.windowType,
        windowArea: body.windowArea ?? existing.windowArea,
        windowOrientation: body.windowOrientation ?? existing.windowOrientation,
        occupantCount: body.occupantCount ?? existing.occupantCount,
        lightingDensity: body.lightingDensity ?? existing.lightingDensity,
        equipmentLoad: body.equipmentLoad ?? existing.equipmentLoad,
        hasRoofExposure: body.hasRoofExposure ?? existing.hasRoofExposure,
        notes: body.notes ?? existing.notes,
      },
    });

    // Recalculate cooling load if room has area
    if (room.area > 0) {
      const project = await neon.project.findUnique({ where: { id: projectId } });
      if (project) {
        const loadInput = buildCoolingLoadInput(room, project);
        const result = calculateCoolingLoad(loadInput, room.id, room.name);

        await neon.coolingLoad.upsert({
          where: { roomId: room.id },
          create: { roomId: room.id, ...coolingLoadToDbFields(result) },
          update: coolingLoadToDbFields(result),
        });
      }
    }

    const updatedRoom = await neon.room.findUnique({
      where: { id: room.id },
      include: { coolingLoad: true },
    });

    return NextResponse.json({ room: updatedRoom });
  } catch (error) {
    console.error('PUT room error:', error);
    const d = getErrorDetails(error, 'Failed to update room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, roomId } = await context.params;

    const existing = await neon.room.findUnique({
      where: { id: roomId },
      include: { floor: true },
    });
    if (!existing || existing.floor.projectId !== projectId) {
      return errorResponse(404, 'Room not found', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    await neon.room.delete({ where: { id: roomId } });

    return NextResponse.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('DELETE room error:', error);
    const d = getErrorDetails(error, 'Failed to delete room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
