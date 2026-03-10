/**
 * Calculation API — Run or re-run cooling load calculations
 * POST /api/projects/[id]/calculate
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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;

    const project = await neon.project.findUnique({
      where: { id: projectId },
      include: { floors: { include: { rooms: true } } },
    });

    if (!project) {
      return errorResponse(404, 'Project not found', 'The project ID does not match any existing project.', 'PROJECT_NOT_FOUND');
    }

    const allRooms = project.floors.flatMap((f) => f.rooms);
    if (allRooms.length === 0) {
      return errorResponse(400, 'No rooms to calculate', 'Add rooms to the project before running cooling load calculations.', 'NO_ROOMS');
    }

    const results: ReturnType<typeof calculateCoolingLoad>[] = [];
    let totalProjectLoad = 0;
    let totalProjectTR = 0;

    // Wrap all upserts in a transaction for atomicity
    await prisma.$transaction(async (tx) => {
      for (const floor of project.floors) {
        for (const room of floor.rooms) {
          if (room.area <= 0) continue;

          const loadInput = buildCoolingLoadInput(room, project);
          const loadResult = calculateCoolingLoad(loadInput, room.id, room.name);
          const fields = coolingLoadToDbFields(loadResult);

          await tx.coolingLoad.upsert({
            where: { roomId: room.id },
            create: { roomId: room.id, ...fields },
            update: fields,
          });

          totalProjectLoad += loadResult.totalLoad;
          totalProjectTR += loadResult.trValue;
          results.push(loadResult);
        }
      }

      await tx.auditLog.create({
        data: {
          projectId,
          action: 'calculated',
          entity: 'cooling_load',
          entityId: projectId,
          details: JSON.stringify({
            roomCount: results.length,
            totalTR: totalProjectTR,
          }),
        },
      });
    });

    return NextResponse.json({
      results,
      summary: {
        roomCount: results.length,
        totalLoadWatts: totalProjectLoad,
        totalTR: totalProjectTR,
        totalBTU: totalProjectTR * 12000,
      },
    });
  } catch (error) {
    console.error('POST calculate error:', error);
    const d = getErrorDetails(error, 'Failed to calculate cooling loads');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
