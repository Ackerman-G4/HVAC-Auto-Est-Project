/**
 * Floors API — List + Create
 * GET  /api/projects/[id]/floors — List floors
 * POST /api/projects/[id]/floors — Create floor
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;

    const floors = await prisma.floor.findMany({
      where: { projectId },
      include: {
        rooms: {
          include: { coolingLoad: true, selectedEquipment: true },
        },
      },
      orderBy: { floorNumber: 'asc' },
    });

    return NextResponse.json({ floors });
  } catch (error) {
    console.error('GET floors error:', error);
    const d = getErrorDetails(error, 'Failed to fetch floors');
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

    const floor = await prisma.floor.create({
      data: {
        projectId,
        floorNumber: body.floorNumber ?? 1,
        name: body.name || `Floor ${body.floorNumber ?? 1}`,
        ceilingHeight: body.ceilingHeight ?? 3.0,
        scale: body.scale ?? 50,
        floorPlanImage: body.floorPlanImage ?? null,
      },
    });

    return NextResponse.json({ floor }, { status: 201 });
  } catch (error) {
    console.error('POST floor error:', error);
    const d = getErrorDetails(error, 'Failed to create floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
