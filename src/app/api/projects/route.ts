/**
 * Projects API — CRUD operations
 * GET  /api/projects — List all projects
 * POST /api/projects — Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  createProjectRecord,
  listProjectsForApi,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import {
  toNumber,
  toInt,
  errorResponse,
  getErrorDetails,
  requireJsonRequest,
} from '@/lib/utils/api-helpers';

const CREATE_PROJECT_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

const PROJECTS_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

function toStringField(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-get', PROJECTS_GET_RATE_LIMIT);
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const projects = await listProjectsForApi({
      status,
      search,
      sortBy,
      sortOrder,
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('GET /api/projects error:', error);
    const d = getErrorDetails(error, 'Failed to fetch projects', {
      classifySyntaxErrorAsInvalidJson: false,
    });
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const rateLimit = evaluateRateLimit(request, 'projects-create', CREATE_PROJECT_RATE_LIMIT);
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

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return errorResponse(
        400,
        'Invalid request payload',
        'The request body is not valid JSON.',
        'INVALID_JSON',
      );
    }

    const projectName = toStringField(body.name).trim();

    if (!projectName) {
      return errorResponse(400, 'Project name is required', 'Enter a project name before creating the project.', 'MISSING_NAME');
    }

    // Auto-compute wet-bulb from dry-bulb + RH via Carrier psychrometric chart
    const finalDB = toNumber(body.outdoorDB, 35);
    const finalRH = toNumber(body.outdoorRH, 50);
    const computedWB = Number.isFinite(toNumber(body.outdoorWB, NaN))
      ? toNumber(body.outdoorWB, 0)
      : calcWetBulb(finalDB, finalRH);

    const project = await createProjectRecord({
      name: projectName,
      createdBy: auth.user.id,
      clientName: toStringField(body.clientName),
      buildingType: toStringField(body.buildingType, 'commercial'),
      location: toStringField(body.location),
      city: toStringField(body.city, 'Manila'),
      totalFloorArea: toNumber(body.totalFloorArea, 0),
      floorsAboveGrade: toInt(body.floorsAboveGrade, 1),
      floorsBelowGrade: toInt(body.floorsBelowGrade, 0),
      outdoorDB: finalDB,
      outdoorWB: computedWB,
      outdoorRH: finalRH,
      indoorDB: toNumber(body.indoorDB, 24),
      indoorRH: toNumber(body.indoorRH, 50),
      notes: toStringField(body.notes),
      status: 'draft',
    });

    await writeAuditLog({
      projectId: project.id,
      action: 'created',
      entity: 'project',
      entityId: project.id,
      details: JSON.stringify({ name: projectName }),
    });

    return NextResponse.json({ project: { ...project, floors: [] } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    const d = getErrorDetails(error, 'Failed to create project', {
      classifySyntaxErrorAsInvalidJson: false,
    });
    return errorResponse(500, d.error, d.description, d.code);
  }
}
