/**
 * Projects API — CRUD operations
 * GET  /api/projects — List all projects
 * POST /api/projects — Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
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
} from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
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
    const d = getErrorDetails(error, 'Failed to fetch projects');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json();

    if (!body.name) {
      return errorResponse(400, 'Project name is required', 'Enter a project name before creating the project.', 'MISSING_NAME');
    }

    // Auto-compute wet-bulb from dry-bulb + RH via Carrier psychrometric chart
    const finalDB = toNumber(body.outdoorDB, 35);
    const finalRH = toNumber(body.outdoorRH, 50);
    const computedWB = Number.isFinite(toNumber(body.outdoorWB, NaN))
      ? toNumber(body.outdoorWB, 0)
      : calcWetBulb(finalDB, finalRH);

    const project = await createProjectRecord({
      name: body.name,
      clientName: body.clientName || '',
      buildingType: body.buildingType || 'commercial',
      location: body.location || '',
      city: body.city || 'Manila',
      totalFloorArea: toNumber(body.totalFloorArea, 0),
      floorsAboveGrade: toInt(body.floorsAboveGrade, 1),
      floorsBelowGrade: toInt(body.floorsBelowGrade, 0),
      outdoorDB: finalDB,
      outdoorWB: computedWB,
      outdoorRH: finalRH,
      indoorDB: toNumber(body.indoorDB, 24),
      indoorRH: toNumber(body.indoorRH, 50),
      notes: body.notes || '',
      status: 'draft',
    });

    await writeAuditLog({
      projectId: project.id,
      action: 'created',
      entity: 'project',
      entityId: project.id,
      details: JSON.stringify({ name: body.name }),
    });

    return NextResponse.json({ project: { ...project, floors: [] } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    const d = getErrorDetails(error, 'Failed to create project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
