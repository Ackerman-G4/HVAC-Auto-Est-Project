/**
 * Calculation API — Run or re-run cooling load calculations
 * POST /api/projects/[id]/calculate
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { checkProjectAccess } from '@/lib/auth/project-access';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  getFloorsWithRooms,
  getProjectRecord,
  setRoomCoolingLoad,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import {
  errorResponse,
  getErrorDetails,
  buildCoolingLoadInput,
  coolingLoadToDbFields,
} from '@/lib/utils/api-helpers';
import { finalizeDualValue } from '@/lib/utils/dual-control';

type RouteContext = { params: Promise<{ id: string }> };

const PROJECT_CALCULATE_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 8,
} as const;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-calculate-post', PROJECT_CALCULATE_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id: projectId } = await context.params;

    // Ownership, not merely authentication. Every store call below uses the
    // Admin SDK, which bypasses Firestore rules, so this is the only gate.
    const access = checkProjectAccess(await getProjectRecord(projectId), auth.user);
    if (!access.ok) return access.response;
    const project = access.project;

    const floors = await getFloorsWithRooms(projectId, {
      includeRoomEquipment: false,
      includeRoomEquipmentCount: false,
    });

    const allRooms = floors.flatMap((f) => f.rooms);
    if (allRooms.length === 0) {
      return errorResponse(400, 'No rooms to calculate', 'Add rooms to the project before running cooling load calculations.', 'NO_ROOMS');
    }

    const results: ReturnType<typeof calculateCoolingLoad>[] = [];
    let totalProjectLoad = 0;
    let totalProjectTR = 0;

    for (const floor of floors) {
      for (const room of floor.rooms) {
        if (room.area <= 0) continue;

        const loadInput = buildCoolingLoadInput(room, project);
        const loadResult = calculateCoolingLoad(loadInput, room.id, room.name);
        const existingLoad =
          room.coolingLoad && typeof room.coolingLoad === 'object'
            ? (room.coolingLoad as {
                userTrOverride?: number | null;
                userBtuOverride?: number | null;
                overrideReason?: string;
                overrideUpdatedAt?: string | null;
              })
            : undefined;
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
              ? (existingLoad?.overrideUpdatedAt ?? new Date().toISOString())
              : null,
          timestamp: new Date().toISOString(),
        };

        await setRoomCoolingLoad(room.id, { roomId: room.id, ...fields });

        totalProjectLoad += loadResult.totalLoad;
        totalProjectTR += trSelection.final;
        results.push(loadResult);
      }
    }

    await updateProjectRecord(projectId, {
      isEquipmentStale: true,
      isBoqStale: true,
      lastBoqGeneratedAt: null,
      lastCoolingLoadAt: new Date().toISOString(),
    });

    await writeAuditLog({
      projectId,
      action: 'calculated',
      entity: 'cooling_load',
      entityId: projectId,
      details: JSON.stringify({
        roomCount: results.length,
        totalTR: totalProjectTR,
      }),
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
