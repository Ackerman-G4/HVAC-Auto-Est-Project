/**
 * Projects API — CRUD operations
 * GET  /api/projects — List all projects
 * POST /api/projects — Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import {
  toNumber,
  toInt,
  errorResponse,
  getErrorDetails,
} from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const where: Record<string, unknown> = {};

    if (status && status !== 'all') {
      where.status = status;
    } else {
      where.status = { not: 'archived' };
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { clientName: { contains: search } },
        { buildingType: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        floors: {
          include: {
            rooms: {
              include: {
                coolingLoad: true,
                _count: { select: { selectedEquipment: true } },
              },
            },
          },
        },
        _count: { select: { boqItems: true } },
      },
      orderBy: { [sortBy]: sortOrder },
    });

    const transformedProjects = projects.map((p) => ({
      ...p,
      _count: {
        ...p._count,
        selectedEquipment: p.floors.reduce(
          (sum, f) => sum + f.rooms.reduce((rSum, r) => rSum + r._count.selectedEquipment, 0),
          0,
        ),
      },
    }));

    return NextResponse.json({ projects: transformedProjects });
  } catch (error) {
    console.error('GET /api/projects error:', error);
    const d = getErrorDetails(error, 'Failed to fetch projects');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name) {
      return errorResponse(400, 'Project name is required', 'Enter a project name before creating the project.', 'MISSING_NAME');
    }

    // Auto-compute wet-bulb from dry-bulb + RH via Carrier psychrometric chart
    const finalDB = toNumber(body.outdoorDB, 35);
    const finalRH = toNumber(body.outdoorRH, 50);
    const computedWB = Number.isFinite(toNumber(body.outdoorWB, NaN))
      ? toNumber(body.outdoorWB, 0)
      : calcWetBulb(finalDB, finalRH);

    const project = await prisma.project.create({
      data: {
        name: body.name,
        clientName: body.clientName || '',
        buildingType: body.buildingType || 'commercial',
        location: body.location || '',
        city: body.city || 'Manila',
        totalFloorArea: toNumber(body.totalFloorArea, 0),
        floorsAboveGrade: toInt(body.floorsAboveGrade, 1),
        floorsBelowGrade: toInt(body.floorsBelowGrade, 0),
        outdoorDB: finalDB,
        outdoorWB: computedWB,
        outdoorRH: finalRH,
        indoorDB: toNumber(body.indoorDB, 24),
        indoorRH: toNumber(body.indoorRH, 50),
        notes: body.notes || '',
        status: 'draft',
      },
      include: { floors: true },
    });

    await prisma.auditLog.create({
      data: {
        projectId: project.id,
        action: 'created',
        entity: 'project',
        entityId: project.id,
        details: JSON.stringify({ name: body.name }),
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    const d = getErrorDetails(error, 'Failed to create project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
