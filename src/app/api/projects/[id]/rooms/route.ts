/**
 * Rooms API — CRUD + Cooling Load Calculation
 * GET  /api/projects/[id]/rooms — List rooms
 * POST /api/projects/[id]/rooms — Create room
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import {
  createFloorRecord,
  createRoomRecord,
  findFloorByProjectAndNumber,
  getFloorsWithRooms,
  getProjectRecord,
  getRoomRecord,
  setRoomCoolingLoad,
  updateProjectRecord,
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
  calculatePolygonArea,
  calculatePolygonPerimeter,
  parseRoomPolygon,
} from '@/lib/utils/room-polygon';

type RouteContext = { params: Promise<{ id: string }> };

function derivePolygonMetrics(
  rawPolygon: unknown,
  fallbackArea: number,
  fallbackPerimeter: number,
): { area: number; perimeter: number } {
  const polygon = parseRoomPolygon(rawPolygon);
  if (!polygon) {
    return {
      area: Math.max(0, fallbackArea),
      perimeter: Math.max(0, fallbackPerimeter),
    };
  }

  const scale = polygon.scale && polygon.scale > 0
    ? polygon.scale
    : 1;
  const pointsInMeters = polygon.points.map((point) => ({
    x: point.x / scale,
    y: point.y / scale,
  }));

  const area = calculatePolygonArea(pointsInMeters);
  const perimeter = calculatePolygonPerimeter(pointsInMeters);

  return {
    area: area > 0 ? area : Math.max(0, fallbackArea),
    perimeter: perimeter > 0 ? perimeter : Math.max(0, fallbackPerimeter),
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;

    const floors = await getFloorsWithRooms(id, {
      includeRoomEquipment: false,
      includeRoomEquipmentCount: false,
    });

    return NextResponse.json({ floors });
  } catch (error) {
    console.error('GET rooms error:', error);
    const d = getErrorDetails(error, 'Failed to fetch rooms');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id: projectId } = await context.params;
    const body = await request.json();

    const project = await getProjectRecord(projectId);
    if (!project) {
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    // Find or create floor
    let floor = await findFloorByProjectAndNumber(projectId, body.floorNumber || 1);
    if (!floor) {
      floor = await createFloorRecord(projectId, {
        floorNumber: body.floorNumber || 1,
        name: body.floorName || `Floor ${body.floorNumber || 1}`,
        ceilingHeight: body.ceilingHeight || 2.7,
      });
    }

    const fallbackArea = typeof body.area === 'number' ? body.area : 0;
    const fallbackPerimeter = typeof body.perimeter === 'number'
      ? body.perimeter
      : (fallbackArea > 0 ? Math.sqrt(fallbackArea) * 4 : 0);
    const metrics = derivePolygonMetrics(body.polygon, fallbackArea, fallbackPerimeter);

    // Create room
    const room = await createRoomRecord(projectId, floor.id, {
      name: body.name || 'New Room',
      spaceType: body.spaceType || 'office',
      area: metrics.area,
      perimeter: metrics.perimeter,
      polygon: body.polygon ? JSON.stringify(body.polygon) : '[]',
      ceilingHeight: body.ceilingHeight || floor.ceilingHeight,
      wallConstruction: body.wallConstruction || 'concrete_block_200mm',
      windowType: body.windowType || 'single_clear_6mm',
      windowArea: body.windowArea || 0,
      windowOrientation: body.windowOrientation || 'N',
      occupantCount: body.occupantCount || 0,
      lightingDensity: body.lightingDensity || 15,
      equipmentLoad: body.equipmentLoad || 10,
      hasRoofExposure: body.hasRoofExposure || false,
      notes: body.notes || '',
    });

    // Auto‑calculate cooling load when room has an area
    if (room.area > 0) {
      const loadInput = buildCoolingLoadInput(room, project);
      const result = calculateCoolingLoad(loadInput, room.id, room.name);
      const trSelection = finalizeDualValue(result.trValue, body.userTrOverride);
      const btuSelection = finalizeDualValue(result.btuPerHour, body.userBtuOverride);

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
        overrideReason: body.overrideReason || '',
        overrideUpdatedAt:
          trSelection.isOverridden || btuSelection.isOverridden ? new Date().toISOString() : null,
        timestamp: new Date().toISOString(),
      });

      await updateProjectRecord(projectId, {
        isEquipmentStale: true,
        isBoqStale: true,
        lastBoqGeneratedAt: null,
        lastCoolingLoadAt: new Date().toISOString(),
      });
    }

    const createdRoom = await getRoomRecord(room.id);

    return NextResponse.json({ room: createdRoom }, { status: 201 });
  } catch (error) {
    console.error('POST rooms error:', error);
    const d = getErrorDetails(error, 'Failed to create room');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
