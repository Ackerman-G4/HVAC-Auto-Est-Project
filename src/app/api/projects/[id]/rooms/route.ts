/**
 * Rooms API — CRUD + Cooling Load Calculation
 * GET  /api/projects/[id]/rooms — List rooms
 * POST /api/projects/[id]/rooms — Create room
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/http';
import { createRoomSchema } from '@/lib/validation/rooms';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
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
  requireJsonRequest,
  resourceNotFound,
} from '@/lib/utils/api-helpers';
import { finalizeDualValue } from '@/lib/utils/dual-control';
import {
  parseRoomPolygon,
  validateRoomPolygon,
} from '@/lib/utils/room-polygon';

type RouteContext = { params: Promise<{ id: string }> };

const ROOM_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const ROOM_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

/**
 * Applied only when a floor is created implicitly and the request named no
 * ceiling height. Rooms take the floor's height unless they override it.
 */
const DEFAULT_CEILING_HEIGHT_M = 2.7;

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-rooms-get', ROOM_GET_RATE_LIMIT);
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
    const rateLimit = evaluateRateLimit(request, 'projects-id-rooms-post', ROOM_MUTATION_RATE_LIMIT);
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

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const parsed = await parseJsonBody(request, createRoomSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    // Find or create floor
    let floor = await findFloorByProjectAndNumber(projectId, body.floorNumber);
    if (!floor) {
      floor = await createFloorRecord(projectId, {
        floorNumber: body.floorNumber,
        name: body.floorName ?? `Floor ${body.floorNumber}`,
        ceilingHeight: body.ceilingHeight ?? DEFAULT_CEILING_HEIGHT_M,
      });
    }

    // The schema has already established these are finite non-negative numbers
    // when present, so only presence is in question here.
    const fallbackArea = body.area ?? 0;
    const fallbackPerimeter =
      body.perimeter ?? (fallbackArea > 0 ? Math.sqrt(fallbackArea) * 4 : 0);
    const metrics = derivePolygonMetrics(body.polygon, fallbackArea, fallbackPerimeter);
    if (metrics.validationError) {
      return errorResponse(400, 'Invalid room polygon', metrics.validationError, 'INVALID_ROOM_POLYGON');
    }

    // Create room
    // Every default below now comes from createRoomSchema. The previous
    // `body.<field> || <fallback>` form fired on any falsy value, so a
    // deliberately-supplied 0 was overwritten — lightingDensity: 0 became 15
    // W/m² and equipmentLoad: 0 became 10 W/m², inflating the cooling load and
    // everything costed from it.
    const room = await createRoomRecord(projectId, floor.id, {
      name: body.name,
      spaceType: body.spaceType,
      area: metrics.area,
      perimeter: metrics.perimeter,
      polygon: body.polygon !== undefined ? JSON.stringify(body.polygon) : '[]',
      ceilingHeight: body.ceilingHeight ?? floor.ceilingHeight,
      wallConstruction: body.wallConstruction,
      windowType: body.windowType,
      windowArea: body.windowArea,
      windowOrientation: body.windowOrientation,
      occupantCount: body.occupantCount,
      lightingDensity: body.lightingDensity,
      equipmentLoad: body.equipmentLoad,
      hasRoofExposure: body.hasRoofExposure,
      notes: body.notes,
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
        overrideReason: body.overrideReason,
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
