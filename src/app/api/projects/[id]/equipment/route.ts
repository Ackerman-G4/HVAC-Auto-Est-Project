/**
 * Equipment Selection API
 * GET  /api/projects/[id]/equipment — Get selected equipment
 * POST /api/projects/[id]/equipment — Auto-size + select equipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/http';
import { createEquipmentSelectionSchema, isAutoSizeRequest } from '@/lib/validation/equipment';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  listSelectedEquipmentForProject,
  toApiEquipment,
} from '@/lib/firebase/project-estimation-store';
import {
  autoSizeProjectEquipment,
  selectEquipmentManually,
  type SelectEquipmentRefusal,
} from '@/lib/equipment/select-equipment';
import { productionEquipmentDeps } from '@/lib/equipment/select-equipment-deps';
import { errorResponse, getErrorDetails, requireJsonRequest, resourceNotFound } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

type RouteContext = { params: Promise<{ id: string }> };

const EQUIPMENT_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const EQUIPMENT_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-equipment-get', EQUIPMENT_GET_RATE_LIMIT);
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

    const selections = await listSelectedEquipmentForProject(id);
    const equipment = selections.map((selection) => toApiEquipment(selection));

    return NextResponse.json({ equipment });
  } catch (error) {
    logger.error('GET equipment error', error);
    const d = getErrorDetails(error, 'Failed to fetch equipment');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

/** One refusal, one status. Exhaustive: a new reason is a compile error. */
function selectionRefusalResponse(refusal: SelectEquipmentRefusal): NextResponse {
  switch (refusal.reason) {
    case 'NO_ROOMS':
      return errorResponse(400, 'No rooms found', 'Add rooms to the project before auto-sizing equipment.', 'NO_ROOMS');
    case 'NO_LOADS':
      return errorResponse(
        400,
        'No cooling loads calculated',
        'Run "Calculate" first to compute cooling loads for all rooms before auto-sizing equipment.',
        'NO_LOADS',
      );
    case 'ROOM_NOT_FOUND':
      return resourceNotFound('Room', 'The room does not exist in this project.', 'ROOM_NOT_FOUND');
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-equipment-post', EQUIPMENT_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId } = await context.params;

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) return jsonGuard;

    const parsed = await parseJsonBody(request, createEquipmentSelectionSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    if (isAutoSizeRequest(body)) {
      const result = await autoSizeProjectEquipment(productionEquipmentDeps, {
        projectId,
        budgetLevel: body.budgetLevel,
        preferredBrand: body.preferredBrand,
        preferredType: body.preferredType,
      });
      if (!result.ok) return selectionRefusalResponse(result);
      return NextResponse.json({ results: result.results }, { status: 201 });
    }

    const result = await selectEquipmentManually(productionEquipmentDeps, { projectId, body });
    if (!result.ok) return selectionRefusalResponse(result);
    return NextResponse.json({ equipment: result.equipment }, { status: 201 });
  } catch (error) {
    logger.error('POST equipment error', error);
    const d = getErrorDetails(error, 'Failed to select equipment');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
