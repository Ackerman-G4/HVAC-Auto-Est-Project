/**
 * Run Snapshot Iteration API — fetch or request a specific snapshot iteration
 * GET  /api/projects/[id]/simulations/[simId]/runs/[runId]/snapshots/[iteration]
 * GET  ?fields=temperature,velocity — fetch selected field payloads
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  getRunJob,
  getRunFieldSnapshot,
  getRunFieldSnapshotMeta,
  getRunFieldSnapshotField,
} from '@/lib/firebase/simulation-cases-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import type { FieldName, FieldPayload } from '@/types/simulation';

type RouteContext = {
  params: Promise<{ id: string; simId: string; runId: string; iteration: string }>;
};

const SNAPSHOT_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
} as const;

const VALID_FIELD_NAMES = new Set<FieldName>([
  'temperature',
  'velocity',
  'pressure',
  'humidity',
  'turbulentViscosity',
]);

function isValidFieldName(value: string): value is FieldName {
  return VALID_FIELD_NAMES.has(value as FieldName);
}

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(
      request,
      'projects-id-simulations-simid-runs-runid-snapshots-iteration-get',
      SNAPSHOT_GET_RATE_LIMIT,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId, runId, iteration: iterationParam } = await context.params;

    const project = await getProjectRecord(projectId);
    if (!project) {
      return errorResponse(404, 'Project not found', 'No project.', 'PROJECT_NOT_FOUND');
    }
    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'Access denied.', 'FORBIDDEN');
    }

    const simCase = await getSimulationCase(projectId, simId);
    if (!simCase) {
      return errorResponse(404, 'Case not found', 'No case.', 'CASE_NOT_FOUND');
    }

    const run = await getRunJob(projectId, simId, runId);
    if (!run) {
      return errorResponse(404, 'Run not found', 'No run found for this case.', 'RUN_NOT_FOUND');
    }

    const iteration = Math.floor(Number(iterationParam));
    if (!Number.isFinite(iteration) || iteration < 1) {
      return errorResponse(400, 'Invalid iteration', 'Iteration must be a positive integer.', 'INVALID_ITERATION');
    }

    const fieldsParam = request.nextUrl.searchParams.get('fields');
    if (fieldsParam !== null) {
      const requestedFields = Array.from(
        new Set(
          fieldsParam
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      );

      if (requestedFields.length === 0) {
        return errorResponse(
          400,
          'Invalid fields query',
          'Query parameter "fields" must contain at least one field name.',
          'INVALID_FIELDS_QUERY',
        );
      }

      const invalidFields = requestedFields.filter((fieldName) => !isValidFieldName(fieldName));
      if (invalidFields.length > 0) {
        return errorResponse(
          400,
          'Invalid field name',
          `Field must be one of: ${[...VALID_FIELD_NAMES].join(', ')}`,
          'INVALID_FIELD_NAME',
        );
      }

      const meta = await getRunFieldSnapshotMeta(projectId, simId, runId, iteration);
      if (!meta) {
        return errorResponse(404, 'Snapshot not found', 'No snapshot for this iteration.', 'SNAPSHOT_NOT_FOUND');
      }

      const fields = (
        await Promise.all(
          requestedFields.map((fieldName) =>
            getRunFieldSnapshotField(projectId, simId, runId, iteration, fieldName as FieldName),
          ),
        )
      ).filter((field): field is FieldPayload => Boolean(field));

      if (fields.length === 0) {
        return errorResponse(
          404,
          'Snapshot fields not found',
          'Requested fields were not found for this iteration.',
          'SNAPSHOT_FIELDS_NOT_FOUND',
        );
      }

      return NextResponse.json({
        snapshot: {
          meta,
          fields,
        },
      });
    }

    // Return the full snapshot (meta + all available fields).
    const snapshot = await getRunFieldSnapshot(projectId, simId, runId, iteration);
    if (!snapshot) {
      return errorResponse(404, 'Snapshot not found', 'No snapshot for this iteration.', 'SNAPSHOT_NOT_FOUND');
    }

    return NextResponse.json({
      snapshot,
    });
  } catch (error) {
    console.error('GET .../runs/[runId]/snapshots/[iteration] error:', error);
    const d = getErrorDetails(error, 'Failed to fetch run snapshot');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
