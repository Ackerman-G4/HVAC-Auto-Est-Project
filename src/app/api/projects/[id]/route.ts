/**
 * Single Project API — GET, PUT, DELETE
 * GET /api/projects/[id]
 * PUT /api/projects/[id]
 * DELETE /api/projects/[id]
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
    { error, description, code: code || `PROJECT_${status}` },
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
        description: 'A record with the same unique value already exists.',
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
      return errorResponse(
        404,
        'Project not found',
        'The project ID does not match any existing project record.',
        'PROJECT_NOT_FOUND'
      );
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
    const details = getErrorDetails(error, 'Failed to fetch project');
    return errorResponse(500, details.error, details.description, details.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(
        404,
        'Project not found',
        'The project you are trying to update no longer exists.',
        'PROJECT_NOT_FOUND'
      );
    }

    // Auto-compute wet-bulb from dry-bulb + RH via Carrier psychrometric chart
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
    const details = getErrorDetails(error, 'Failed to update project');
    return errorResponse(500, details.error, details.description, details.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(
        404,
        'Project not found',
        'The project you are trying to delete no longer exists.',
        'PROJECT_NOT_FOUND'
      );
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
    const details = getErrorDetails(error, 'Failed to delete project');
    return errorResponse(500, details.error, details.description, details.code);
  }
}
