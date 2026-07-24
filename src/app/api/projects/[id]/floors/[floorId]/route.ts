/**
 * Individual Floor API — Update + Delete
 * PUT    /api/projects/[id]/floors/[floorId] — Update floor
 * DELETE /api/projects/[id]/floors/[floorId] — Delete floor
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  deleteFloorRecord,
  getFloorRecord,
  updateFloorRecord,
} from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest, resourceNotFound } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; floorId: string }> };

const FLOOR_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-floors-floorid-put', FLOOR_MUTATION_RATE_LIMIT);
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

    const { id: projectId, floorId } = await context.params;

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const body = await request.json();

    const existing = await getFloorRecord(floorId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('Floor', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    await updateFloorRecord(floorId, {
      name: body.name ?? existing.name,
      floorNumber: body.floorNumber ?? existing.floorNumber,
      ceilingHeight: body.ceilingHeight ?? existing.ceilingHeight,
      scale: body.scale ?? existing.scale,
      floorPlanImage: body.floorPlanImage !== undefined ? body.floorPlanImage : existing.floorPlanImage,
    });

    const floor = await getFloorRecord(floorId);
    if (!floor) {
      return resourceNotFound('Floor', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    return NextResponse.json({ floor });
  } catch (error) {
    console.error('PUT floor error:', error);
    const d = getErrorDetails(error, 'Failed to update floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-floors-floorid-delete', FLOOR_MUTATION_RATE_LIMIT);
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

    const { id: projectId, floorId } = await context.params;

    const existing = await getFloorRecord(floorId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('Floor', 'The floor does not exist in this project.', 'FLOOR_NOT_FOUND');
    }

    await deleteFloorRecord(floorId);

    return NextResponse.json({ message: 'Floor deleted successfully' });
  } catch (error) {
    console.error('DELETE floor error:', error);
    const d = getErrorDetails(error, 'Failed to delete floor');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
