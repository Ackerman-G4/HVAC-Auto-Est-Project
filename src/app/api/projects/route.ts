/**
 * Projects API — CRUD operations
 * GET /api/projects — List all projects
 * POST /api/projects — Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';

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
      // Exclude archived by default
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
        _count: {
          select: {
            boqItems: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
    });

    // Transform to add selectedEquipment count at project level
    const transformedProjects = projects.map((p) => {
      const totalEquipment = p.floors.reduce(
        (sum, f) => sum + f.rooms.reduce((rSum, r) => rSum + r._count.selectedEquipment, 0),
        0
      );
      return {
        ...p,
        _count: {
          ...p._count,
          selectedEquipment: totalEquipment,
        },
      };
    });

    return NextResponse.json({ projects: transformedProjects });
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      clientName,
      buildingType,
      location,
      city,
      totalFloorArea,
      floorsAboveGrade,
      floorsBelowGrade,
      outdoorDB,
      outdoorWB,
      outdoorRH,
      indoorDB,
      indoorRH,
      notes,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    // Auto-compute wet-bulb from dry-bulb + RH via Carrier psychrometric chart
    const finalDB = outdoorDB || 35;
    const finalRH = outdoorRH || 65;
    const computedWB = outdoorWB || Math.round(calcWetBulb(finalDB, finalRH) * 100) / 100;

    const project = await prisma.project.create({
      data: {
        name,
        clientName: clientName || '',
        buildingType: buildingType || 'commercial',
        location: location || '',
        city: city || 'Manila',
        totalFloorArea: totalFloorArea || 0,
        floorsAboveGrade: floorsAboveGrade || 1,
        floorsBelowGrade: floorsBelowGrade || 0,
        outdoorDB: finalDB,
        outdoorWB: computedWB,
        outdoorRH: finalRH,
        indoorDB: indoorDB || 24,
        indoorRH: indoorRH || 50,
        notes: notes || '',
        status: 'draft',
      },
      include: {
        floors: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        projectId: project.id,
        action: 'created',
        entity: 'project',
        entityId: project.id,
        details: JSON.stringify({ name }),
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
