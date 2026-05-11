/**
 * Individual Room API — Update + Delete
 * PUT    /api/projects/[id]/rooms/[roomId] — Update room
 * DELETE /api/projects/[id]/rooms/[roomId] — Delete room
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import {
  deleteRoomRecord,
  getProjectRecord,
  getRoomRecord,
  setRoomCoolingLoad,
  updateProjectRecord,
  updateRoomRecord,
} from '@/lib/firebase/projects-store';
import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import {
  errorResponse,
  getErrorDetails,
  buildCoolingLoadInput,
  coolingLoadToDbFields,
  resourceNotFound,
} from '@/lib/utils/api-helpers';
import { finalizeDualValue } from '@/lib/utils/dual-control';
import {
  parseRoomPolygon,
  validateRoomPolygon,
} from '@/lib/utils/room-polygon';

type RouteContext = { params: Promise<{ id: string; roomId: string }> };

function derivePolygonMetrics(
  rawPolygon: unknown,
  fallbackArea: number,
  fallbackPerimeter: number,
): { area: number; perimeter: number; validationError?: string } {
  if (rawPolygon === undefined) {
    return {
      area: Math.max(0, fallbackArea),
      perimeter: Math.max(0, fallbackPerimeter),
    };
  }

  const polygon = parseRoomPolygon(rawPolygon);
  if (!polygon) {
    return {
      area: Math.max(0, fallbackArea),
      perimeter: Math.max(0, fallbackPerimeter),
      validationError: 'Polygon payload is malformed or missing required points.',
    };
  }

  const scale = polygon.scale && polygon.scale > 0
    ? polygon.scale
    : 1;
  const pointsInMeters = polygon.points.map((point) => ({
    x: point.x / scale,
    y: point.y / scale,
  }));

  const validation = validateRoomPolygon(pointsInMeters, { minArea: 0.25 });
  if (!validation.isValid) {
    return {
      area: Math.max(0, fallbackArea),
      perimeter: Math.max(0, fallbackPerimeter),
      validationError: validation.issues[0] ?? 'Polygon geometry is invalid.',
    };
  }

  return {
    area: validation.area > 0 ? validation.area : Math.max(0, fallbackArea),
    perimeter: validation.perimeter > 0 ? validation.perimeter : Math.max(0, fallbackPerimeter),
  };
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id: projectId, roomId } = await context.params;
    const body = await request.json();

    const existing = await getRoomRecord(roomId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('Room', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    const fallbackArea = typeof body.area === 'number' ? body.area : existing.area;
    const fallbackPerimeter = typeof body.perimeter === 'number' ? body.perimeter : existing.perimeter;
    const metrics = body.polygon !== undefined
      ? derivePolygonMetrics(body.polygon, fallbackArea, fallbackPerimeter)
      : {
          area: Math.max(0, fallbackArea),
          perimeter: Math.max(0, fallbackPerimeter),
        };
    if (metrics.validationError) {
      return errorResponse(400, 'Invalid room polygon', metrics.validationError, 'INVALID_ROOM_POLYGON');
    }

    await updateRoomRecord(roomId, {
      name: body.name ?? existing.name,
      spaceType: body.spaceType ?? existing.spaceType,
      area: body.polygon !== undefined ? metrics.area : (body.area ?? existing.area),
      perimeter: body.polygon !== undefined ? metrics.perimeter : (body.perimeter ?? existing.perimeter),
      polygon: body.polygon !== undefined ? JSON.stringify(body.polygon) : existing.polygon,
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
    });

    const room = await getRoomRecord(roomId);
    if (!room) {
      return resourceNotFound('Room', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    // Recalculate cooling load if room has area
    if (room.area > 0) {
      const project = await getProjectRecord(projectId);
      if (project) {
        const loadInput = buildCoolingLoadInput(room, project);
        const result = calculateCoolingLoad(loadInput, room.id, room.name);
        const existingLoad =
          room.coolingLoad && typeof room.coolingLoad === 'object'
            ? (room.coolingLoad as {
                userTrOverride?: number | null;
                userBtuOverride?: number | null;
                overrideReason?: string;
                overrideUpdatedAt?: string | null;
              })
            : undefined;
        const trSelection = finalizeDualValue(
          result.trValue,
          body.userTrOverride !== undefined ? body.userTrOverride : existingLoad?.userTrOverride,
        );
        const btuSelection = finalizeDualValue(
          result.btuPerHour,
          body.userBtuOverride !== undefined ? body.userBtuOverride : existingLoad?.userBtuOverride,
        );

        const overrideUpdatedAt =
          trSelection.isOverridden || btuSelection.isOverridden
            ? (existingLoad?.overrideUpdatedAt ?? new Date().toISOString())
            : null;

        await setRoomCoolingLoad(room.id, {
          roomId: room.id,
          ...coolingLoadToDbFields(result),
          suggestedTrValue: result.trValue,
          userTrOverride: trSelection.override,
          finalTrValue: trSelection.final,
          trValue: trSelection.final,
          suggestedBtuPerHour: result.btuPerHour,
          userBtuOverride: btuSelection.override,
          finalBtuPerHour: btuSelection.final,
          btuPerHour: btuSelection.final,
          isOverridden: trSelection.isOverridden || btuSelection.isOverridden,
          overrideReason: body.overrideReason ?? existingLoad?.overrideReason ?? '',
          overrideUpdatedAt,
          timestamp: new Date().toISOString(),
        });

        await updateProjectRecord(projectId, {
          isEquipmentStale: true,
          isBoqStale: true,
          lastBoqGeneratedAt: null,
          lastCoolingLoadAt: new Date().toISOString(),
        });
      }
    }

    const updatedRoom = await getRoomRecord(room.id);

    return NextResponse.json({ room: updatedRoom });
  } catch (error) {
    console.error('PUT room error:', error);
    const d = getErrorDetails(error, 'Failed to update room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id: projectId, roomId } = await context.params;

    const existing = await getRoomRecord(roomId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('Room', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    await deleteRoomRecord(roomId);

    await updateProjectRecord(projectId, {
      isEquipmentStale: true,
      isBoqStale: true,
      lastBoqGeneratedAt: null,
      lastCoolingLoadAt: new Date().toISOString(),
    });

    return NextResponse.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('DELETE room error:', error);
    const d = getErrorDetails(error, 'Failed to delete room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
