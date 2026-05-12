/**
 * Run Snapshot Single-Field API — fetch one field payload from a snapshot iteration
 * GET /api/projects/[id]/simulations/[simId]/runs/[runId]/snapshots/[iteration]/fields/[fieldName]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  getRunJob,
  getRunFieldSnapshotMeta,
  getRunFieldSnapshotField,
} from '@/lib/firebase/simulation-cases-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import type { FieldName } from '@/types/simulation';

type RouteContext = {
  params: Promise<{
    id: string;
    simId: string;
    runId: string;
    iteration: string;
    fieldName: string;
  }>;
};

const FIELD_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
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
      'projects-id-simulations-simid-runs-runid-snapshots-iteration-field-get',
      FIELD_GET_RATE_LIMIT,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const {
      id: projectId,
      simId,
      runId,
      iteration: iterationParam,
      fieldName: fieldNameParam,
    } = await context.params;

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

    if (!isValidFieldName(fieldNameParam)) {
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

    const field = await getRunFieldSnapshotField(
      projectId,
      simId,
      runId,
      iteration,
      fieldNameParam,
    );
    if (!field) {
      return errorResponse(
        404,
        'Field not found',
        `Field '${fieldNameParam}' is not available in snapshot at iteration ${iteration}.`,
        'FIELD_NOT_FOUND',
      );
    }

    return NextResponse.json({
      meta,
      field,
    });
  } catch (error) {
    console.error('GET .../snapshots/[iteration]/fields/[fieldName] error:', error);
    const d = getErrorDetails(error, 'Failed to fetch snapshot field');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
