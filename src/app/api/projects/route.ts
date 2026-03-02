/**
 * Projects API — CRUD operations
 * GET /api/projects — List all projects
 * POST /api/projects — Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';

function toNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toInt(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

function errorResponse(
  status: number,
  error: string,
  description: string,
  code?: string
) {
  return NextResponse.json(
    { error, description, code: code || `PROJECTS_${status}` },
    { status }
  );
}

function getErrorDetails(error: unknown, fallback: string) {
  if (error instanceof SyntaxError) {
    return {
      error: 'Invalid request payload',
      description: 'The request body is not valid JSON.',
      code: 'INVALID_JSON',
    };
  }

  if (typeof error === 'object' && error !== null) {
    const maybeCode = 'code' in error ? String((error as { code?: unknown }).code) : '';
    const maybeMessage = 'message' in error ? String((error as { message?: unknown }).message) : '';

    if (maybeCode === 'P2002') {
      return {
        error: 'Duplicate record',
        description: 'A project with the same unique value already exists.',
        code: maybeCode,
      };
    }

    if (maybeCode === 'P2003') {
      return {
        error: 'Invalid relation reference',
        description: 'One of the related records referenced by this request does not exist.',
        code: maybeCode,
      };
    }

    if (maybeCode === 'P2025') {
      return {
        error: 'Record not found',
        description: 'The target record was not found while processing this request.',
        code: maybeCode,
      };
    }

    if (maybeMessage) {
      return {
        error: fallback,
        description: maybeMessage,
        code: maybeCode || 'UNKNOWN_ERROR',
      };
    }
  }

  return {
    error: fallback,
    description: 'An unexpected server error occurred while processing the request.',
    code: 'UNKNOWN_ERROR',
  };
}

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
    const details = getErrorDetails(error, 'Failed to fetch projects');
    return errorResponse(500, details.error, details.description, details.code);
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
      return errorResponse(
        400,
        'Project name is required',
        'Enter a project name before creating the project.',
        'MISSING_NAME'
      );
    }

    // Auto-compute wet-bulb from dry-bulb + RH via Carrier psychrometric chart
    const normalizedTotalFloorArea = toNumber(totalFloorArea, 0);
    const normalizedFloorsAbove = toInt(floorsAboveGrade, 1);
    const normalizedFloorsBelow = toInt(floorsBelowGrade, 0);
    const finalDB = toNumber(outdoorDB, 35);
    const finalRH = toNumber(outdoorRH, 65);
    const finalIndoorDB = toNumber(indoorDB, 24);
    const finalIndoorRH = toNumber(indoorRH, 50);
    const normalizedOutdoorWB = toNumber(outdoorWB, NaN);
    const computedWB = Number.isFinite(normalizedOutdoorWB)
      ? normalizedOutdoorWB
      : Math.round(calcWetBulb(finalDB, finalRH) * 100) / 100;

    const project = await prisma.project.create({
      data: {
        name,
        clientName: clientName || '',
        buildingType: buildingType || 'commercial',
        location: location || '',
        city: city || 'Manila',
        totalFloorArea: normalizedTotalFloorArea,
        floorsAboveGrade: normalizedFloorsAbove,
        floorsBelowGrade: normalizedFloorsBelow,
        outdoorDB: finalDB,
        outdoorWB: computedWB,
        outdoorRH: finalRH,
        indoorDB: finalIndoorDB,
        indoorRH: finalIndoorRH,
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
    const details = getErrorDetails(error, 'Failed to create project');
    return errorResponse(500, details.error, details.description, details.code);
  }
}
