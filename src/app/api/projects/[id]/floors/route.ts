/**
 * Floors API — List + Create
 * GET  /api/projects/[id]/floors — List floors
 * POST /api/projects/[id]/floors — Create floor
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/http';
import { createFloorSchema } from '@/lib/validation/projects';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  createFloorRecord,
  getFloorsWithRooms,
  getProjectRecord,
} from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest, resourceNotFound } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

type RouteContext = { params: Promise<{ id: string }> };

const FLOOR_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const FLOOR_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-floors-get', FLOOR_GET_RATE_LIMIT);
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

    const floors = await getFloorsWithRooms(projectId, {
      includeRoomEquipment: true,
      includeRoomEquipmentCount: false,
    });

    return NextResponse.json({ floors });
  } catch (error) {
    logger.error('GET floors error', error);
    const d = getErrorDetails(error, 'Failed to fetch floors');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-floors-post', FLOOR_MUTATION_RATE_LIMIT);
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

    const parsed = await parseJsonBody(request, createFloorSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    // Defaults come from createFloorSchema. `name` is the one field left to the
    // handler, because its default is derived from another field's value.
    const floor = await createFloorRecord(projectId, {
      floorNumber: body.floorNumber,
      name: body.name ?? `Floor ${body.floorNumber}`,
      ceilingHeight: body.ceilingHeight,
      scale: body.scale,
      floorPlanImage: body.floorPlanImage,
    });

    return NextResponse.json({ floor }, { status: 201 });
  } catch (error) {
    logger.error('POST floor error', error);
    const d = getErrorDetails(error, 'Failed to create floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
