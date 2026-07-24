/**
 * Simulation Report History API
 * GET    /api/simulation/reports
 * POST   /api/simulation/reports
 * DELETE /api/simulation/reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import type { SimulationEngineeringReport } from '@/lib/reports/simulation-report';
import {
  clearSimulationReportHistoryForOwner,
  createSimulationReportHistoryRecord,
  listSimulationReportHistoryForOwner,
  type SimulationReportExportFormat,
  type SimulationReportExportSource,
} from '@/lib/firebase/simulation-report-history-store';
import {
  errorResponse,
  getErrorDetails,
  parseBoundedInt,
  requireJsonRequest,
} from '@/lib/utils/api-helpers';

const REPORT_HISTORY_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

const REPORT_HISTORY_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

function isValidFormat(value: unknown): value is SimulationReportExportFormat {
  return value === 'pdf' || value === 'csv' || value === 'json';
}

function isValidSource(value: unknown): value is SimulationReportExportSource {
  return value === 'viewer' || value === 'workspace' || value === 'engine';
}

function parseReportPayload(value: unknown): SimulationEngineeringReport | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as SimulationEngineeringReport;
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'simulation-reports-get', REPORT_HISTORY_GET_RATE_LIMIT);
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

    const limit = parseBoundedInt(request.nextUrl.searchParams.get('limit'), {
      defaultValue: 50,
      min: 1,
      max: 200,
    });

    const projectId = request.nextUrl.searchParams.get('projectId') || undefined;
    const history = await listSimulationReportHistoryForOwner(auth.user.id, limit, projectId);

    return NextResponse.json({ history });
  } catch (error) {
    console.error('GET /api/simulation/reports error:', error);
    const d = getErrorDetails(error, 'Failed to fetch simulation report history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const rateLimit = evaluateRateLimit(request, 'simulation-reports-post', REPORT_HISTORY_MUTATION_RATE_LIMIT);
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

    const body = await request.json();

    if (!isValidFormat(body.format)) {
      return errorResponse(400, 'Invalid format', 'format must be one of: pdf, csv, json.', 'INVALID_FORMAT');
    }

    if (!isValidSource(body.source)) {
      return errorResponse(400, 'Invalid source', 'source must be one of: viewer, workspace.', 'INVALID_SOURCE');
    }

    const projectId = typeof body.projectId === 'string' && body.projectId.trim().length > 0
      ? body.projectId.trim()
      : 'unknown-project';

    if (projectId !== 'unknown-project' && projectId !== 'workspace') {
      const project = await getProjectRecord(projectId);
      if (!project) {
        return errorResponse(404, 'Project not found', 'No project with this ID.', 'PROJECT_NOT_FOUND');
      }

      if (!isProjectOwnerOrAdmin(auth.user, project)) {
        return errorResponse(403, 'Forbidden', 'You do not have permission to write report history for this project.', 'FORBIDDEN');
      }
    }

    const entry = await createSimulationReportHistoryRecord({
      ownerId: auth.user.id,
      format: body.format,
      source: body.source,
      projectId,
      projectName: typeof body.projectName === 'string' && body.projectName.trim().length > 0
        ? body.projectName.trim()
        : 'Simulation Project',
      floorId: typeof body.floorId === 'string' && body.floorId.trim().length > 0
        ? body.floorId.trim()
        : 'unknown-floor',
      runtimeMode: typeof body.runtimeMode === 'string' && body.runtimeMode.trim().length > 0
        ? body.runtimeMode.trim()
        : 'worker',
      converged: body.converged === true,
      maxTemperatureC: typeof body.maxTemperatureC === 'number' ? body.maxTemperatureC : 0,
      pue: typeof body.pue === 'number' ? body.pue : 0,
      hotspotCount: typeof body.hotspotCount === 'number' ? Math.max(0, Math.trunc(body.hotspotCount)) : 0,
      report: parseReportPayload(body.report),
      generatedAt: typeof body.generatedAt === 'string' ? body.generatedAt : undefined,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('POST /api/simulation/reports error:', error);
    const d = getErrorDetails(error, 'Failed to record simulation report export');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'simulation-reports-delete', REPORT_HISTORY_MUTATION_RATE_LIMIT);
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

    let projectId = request.nextUrl.searchParams.get('projectId') || undefined;

    if (!projectId) {
      const body = await request.json().catch(() => null);
      if (body && typeof body.projectId === 'string' && body.projectId.trim().length > 0) {
        projectId = body.projectId.trim();
      }
    }

    const deletedCount = await clearSimulationReportHistoryForOwner(auth.user.id, projectId);
    return NextResponse.json({ deletedCount });
  } catch (error) {
    console.error('DELETE /api/simulation/reports error:', error);
    const d = getErrorDetails(error, 'Failed to clear simulation report history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
