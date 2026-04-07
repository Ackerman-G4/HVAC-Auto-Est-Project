/**
 * Individual Room API — Update + Delete
 * PUT    /api/projects/[id]/rooms/[roomId] — Update room
 * DELETE /api/projects/[id]/rooms/[roomId] — Delete room
 */

import { NextRequest, NextResponse } from 'next/server';
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

type RouteContext = { params: Promise<{ id: string; roomId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, roomId } = await context.params;
    const body = await request.json();

    const existing = await getRoomRecord(roomId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('Room', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
    }

    await updateRoomRecord(roomId, {
      name: body.name ?? existing.name,
      spaceType: body.spaceType ?? existing.spaceType,
      area: body.area ?? existing.area,
      perimeter: body.perimeter ?? existing.perimeter,
      polygon: body.polygon ? JSON.stringify(body.polygon) : existing.polygon,
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
