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
} from '@/lib/firebase/simulation-report-history-store';
import {
  errorResponse,
  getErrorDetails,
  parseBoundedInt,
  requireJsonRequest,
} from '@/lib/utils/api-helpers';
import { parseJsonBody, parseValue } from '@/lib/validation/http';
import { createReportHistorySchema, reportHistoryScopeSchema, isUnscopedProjectId } from '@/lib/validation/simulation-reports';

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

// `isValidFormat` and `isValidSource` stood here. Both are now the enums in
// createReportHistorySchema, which narrows to the same union — and reports the
// allowed values in the 400 rather than in a hand-written message that had
// already drifted (it listed "viewer, workspace" while the guard also accepted
// "engine").

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

    const parsed = await parseJsonBody(request, createReportHistorySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const projectId = body.projectId;

    if (!isUnscopedProjectId(projectId)) {
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
      // Every default and bound now comes from createReportHistorySchema. The
      // `typeof x === 'number'` guards these replace are true for NaN and
      // Infinity, so a diverged solve stored NaN into maxTemperatureC and pue
      // and the history view rendered the literal text "NaN". hotspotCount was
      // worse: Math.max(0, Math.trunc(NaN)) is NaN, so the clamp that looks
      // like it bounds the value passed it through.
      projectName: body.projectName,
      floorId: body.floorId,
      runtimeMode: body.runtimeMode,
      converged: body.converged,
      maxTemperatureC: body.maxTemperatureC,
      pue: body.pue,
      hotspotCount: body.hotspotCount,
      report: parseReportPayload(body.report),
      generatedAt: body.generatedAt,
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
      // A body is optional here: no body means "clear everything for this
      // owner", which is a legitimate call.
      //
      // A body that is *present but malformed* is now rejected. The previous
      // `.catch(() => null)` swallowed it and left projectId undefined — so a
      // request that meant "clear history for project X" silently became
      // "clear this owner's entire history". A parse failure widening a delete
      // is not a tolerable default.
      const rawBody = (await request.text()).trim();

      if (rawBody) {
        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return errorResponse(
            400,
            'Invalid request payload',
            'The request body is not valid JSON.',
            'INVALID_JSON',
          );
        }

        const parsed = parseValue(payload, reportHistoryScopeSchema);
        if (!parsed.ok) return parsed.response;
        if (parsed.data.projectId) {
          projectId = parsed.data.projectId;
        }
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
