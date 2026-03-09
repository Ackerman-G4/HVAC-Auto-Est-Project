/**
 * Individual Floor API — Update + Delete
 * PUT    /api/projects/[id]/floors/[floorId] — Update floor
 * DELETE /api/projects/[id]/floors/[floorId] — Delete floor
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; floorId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, floorId } = await context.params;
    const body = await request.json();

    const existing = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!existing || existing.projectId !== projectId) {
      return errorResponse(404, 'Floor not found', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    const floor = await prisma.floor.update({
      where: { id: floorId },
      data: {
        name: body.name ?? existing.name,
        floorNumber: body.floorNumber ?? existing.floorNumber,
        ceilingHeight: body.ceilingHeight ?? existing.ceilingHeight,
        scale: body.scale ?? existing.scale,
        floorPlanImage: body.floorPlanImage !== undefined ? body.floorPlanImage : existing.floorPlanImage,
      },
    });

    return NextResponse.json({ floor });
  } catch (error) {
    console.error('PUT floor error:', error);
    const d = getErrorDetails(error, 'Failed to update floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, floorId } = await context.params;

    const existing = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!existing || existing.projectId !== projectId) {
      return errorResponse(404, 'Floor not found', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    await prisma.floor.delete({ where: { id: floorId } });

    return NextResponse.json({ message: 'Floor deleted successfully' });
  } catch (error) {
    console.error('DELETE floor error:', error);
    const d = getErrorDetails(error, 'Failed to delete floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
