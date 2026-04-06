/**
 * Calculation API — Run or re-run cooling load calculations
 * POST /api/projects/[id]/calculate
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
import { finalizeDualValue } from '@/lib/utils/dual-control';

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
    await neon.$transaction(async (tx) => {
      for (const floor of project.floors) {
        for (const room of floor.rooms) {
          if (room.area <= 0) continue;

          const loadInput = buildCoolingLoadInput(room, project);
          const loadResult = calculateCoolingLoad(loadInput, room.id, room.name);
          const existingLoad = await tx.coolingLoad.findUnique({
            where: { roomId: room.id },
            select: {
              userTrOverride: true,
              userBtuOverride: true,
              overrideReason: true,
              overrideUpdatedAt: true,
            },
          });
          const trSelection = finalizeDualValue(loadResult.trValue, existingLoad?.userTrOverride);
          const btuSelection = finalizeDualValue(loadResult.btuPerHour, existingLoad?.userBtuOverride);

          const fields = {
            ...coolingLoadToDbFields(loadResult),
            suggestedTrValue: loadResult.trValue,
            userTrOverride: trSelection.override,
            finalTrValue: trSelection.final,
            trValue: trSelection.final,
            suggestedBtuPerHour: loadResult.btuPerHour,
            userBtuOverride: btuSelection.override,
            finalBtuPerHour: btuSelection.final,
            btuPerHour: btuSelection.final,
            isOverridden: trSelection.isOverridden || btuSelection.isOverridden,
            overrideReason: existingLoad?.overrideReason || '',
            overrideUpdatedAt:
              trSelection.isOverridden || btuSelection.isOverridden
                ? (existingLoad?.overrideUpdatedAt ?? new Date())
                : null,
          };

          await tx.coolingLoad.upsert({
            where: { roomId: room.id },
            create: { roomId: room.id, ...fields },
            update: fields,
          });

          totalProjectLoad += loadResult.totalLoad;
          totalProjectTR += trSelection.final;
          results.push(loadResult);
        }
      }

      await tx.project.update({
        where: { id: projectId },
        data: {
          isEquipmentStale: true,
          isBoqStale: true,
          lastBoqGeneratedAt: null,
          lastCoolingLoadAt: new Date(),
        },
      });

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
