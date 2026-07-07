/**
 * OpenFOAM solver callback (plan §4.3, second NEW route).
 * POST /api/projects/[id]/simulations/[simId]/runs/[runId]/openfoam-callback
 *
 * Called server-to-server by the cfd-solver Cloud Run Job when a solve finishes.
 * Authenticated by a shared X-Callback-Secret header, NOT by a user session.
 *
 * Idempotent: a duplicate callback for an already-terminal run is a no-op.
 *   - completed → importFieldData → saveArtifactManifest + saveRunFieldSnapshot
 *                 + updateRunJobStatus('completed') + case → completed
 *   - failed    → updateRunJobStatus('failed', { errorMessage }) + case → failed
 */

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  getRunJob,
  getSimulationCase,
  updateRunJobStatus,
  updateCaseStatus,
  updateSimulationCase,
  saveArtifactManifest,
  saveRunFieldSnapshot,
} from '@/lib/firebase/simulation-cases-store';
import { importFieldData, type ImportedFieldData } from '@/lib/engine/simulation/result-importer';
import { buildRunFieldSnapshotFromFields } from '@/lib/simulation/field-snapshot';
import { getCallbackSecret } from '@/lib/engine/simulation/cfd-cloud';
import { errorResponse, getErrorDetails, requireJsonRequest } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; simId: string; runId: string }> };

const CALLBACK_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 120,
} as const;

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface CallbackBody {
  status?: 'completed' | 'failed';
  dimensions?: { nx: number; ny: number; nz: number };
  data?: ImportedFieldData;
  iteration?: number;
  errorMessage?: string;
  logTail?: string[];
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-runs-runid-callback', CALLBACK_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const expectedSecret = getCallbackSecret();
    if (!expectedSecret) {
      return errorResponse(503, 'Callbacks disabled', 'No callback secret configured.', 'CALLBACK_DISABLED');
    }
    if (!secretMatches(request.headers.get('x-callback-secret'), expectedSecret)) {
      return errorResponse(401, 'Unauthorized', 'Invalid callback secret.', 'INVALID_CALLBACK_SECRET');
    }

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) return jsonGuard;

    const { id: projectId, simId, runId } = await context.params;

    const job = await getRunJob(projectId, simId, runId);
    if (!job) {
      return errorResponse(404, 'Run not found', 'No such run job.', 'RUN_NOT_FOUND');
    }

    // Idempotency: terminal runs ignore duplicate callbacks.
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({ status: job.status, idempotent: true });
    }

    const body = (await request.json()) as CallbackBody;
    const logTail = Array.isArray(body.logTail) ? body.logTail.slice(-50) : undefined;

    if (body.status === 'failed') {
      await updateRunJobStatus(projectId, simId, runId, 'failed', {
        errorMessage: body.errorMessage || 'Solver reported failure',
        completedAt: new Date().toISOString(),
        ...(logTail ? { logTail } : {}),
      });
      await updateCaseStatus(projectId, simId, 'failed');
      return NextResponse.json({ status: 'failed' });
    }

    if (body.status !== 'completed') {
      return errorResponse(400, 'Bad status', 'Callback status must be "completed" or "failed".', 'BAD_CALLBACK_STATUS');
    }

    if (!body.data) {
      return errorResponse(400, 'Missing data', 'Completed callback must include field data.', 'MISSING_FIELDS');
    }

    // Resolve dimensions from the payload, falling back to the case mesh.
    let dimensions = body.dimensions;
    if (!dimensions) {
      const simCase = await getSimulationCase(projectId, simId);
      if (simCase?.mesh) {
        dimensions = { nx: simCase.mesh.nx, ny: simCase.mesh.ny, nz: simCase.mesh.nz };
      }
    }
    if (!dimensions) {
      return errorResponse(400, 'Missing dimensions', 'Could not resolve grid dimensions for import.', 'MISSING_DIMENSIONS');
    }

    try {
      const result = importFieldData(simId, runId, 'openfoam', dimensions, body.data);

      await saveArtifactManifest(projectId, simId, result.manifest);

      try {
        const snapshot = buildRunFieldSnapshotFromFields({
          caseId: simId,
          runJobId: runId,
          source: 'openfoam',
          dimensions,
          fields: result.fields,
          iteration: body.iteration,
        });
        await saveRunFieldSnapshot(projectId, simId, runId, snapshot);
      } catch (snapshotError) {
        console.warn('openfoam-callback: failed to persist run field snapshot:', snapshotError);
      }

      await updateRunJobStatus(projectId, simId, runId, 'completed', {
        completedAt: new Date().toISOString(),
        ...(typeof body.iteration === 'number' ? { currentIteration: body.iteration } : {}),
        ...(logTail ? { logTail } : {}),
      });

      await updateSimulationCase(projectId, simId, {
        status: 'completed',
        resultId: runId,
        runSource: 'openfoam',
      });

      return NextResponse.json({
        status: 'completed',
        fieldsImported: result.fields.map((f) => f.name),
      });
    } catch (importErr) {
      const errorMessage = importErr instanceof Error ? importErr.message : 'Failed to import solver result';
      await updateRunJobStatus(projectId, simId, runId, 'failed', {
        errorMessage,
        completedAt: new Date().toISOString(),
        ...(logTail ? { logTail } : {}),
      });
      await updateCaseStatus(projectId, simId, 'failed');
      return errorResponse(422, 'Import error', errorMessage, 'IMPORT_ERROR');
    }
  } catch (error) {
    console.error('POST .../openfoam-callback error:', error);
    const d = getErrorDetails(error, 'Failed to process solver callback');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
