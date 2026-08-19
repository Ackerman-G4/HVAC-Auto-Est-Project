/**
 * Simulation Run History + Engineering-tier orchestration API
 * GET  /api/projects/[id]/simulations/[simId]/runs  — list run jobs
 * POST /api/projects/[id]/simulations/[simId]/runs  — trigger an OpenFOAM (Engineering) run
 *
 * The POST route is the plan §4.3 "Phase C3" orchestration entry point: it
 * exports the case to an OpenFOAM package, records a run job, and dispatches the
 * cfd-solver Cloud Run Job. It never blocks on the solve — results arrive via the
 * openfoam-callback route. Preview-tier runs continue to use POST .../run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/http';
import { startEngineeringRunSchema } from '@/lib/validation/simulation-cases';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  listRunJobs,
  createRunJob,
  updateSimulationCase,
  updateCaseStatus,
  updateRunJobStatus,
} from '@/lib/firebase/simulation-cases-store';
import { buildOpenFOAMConfig, generateCaseFiles } from '@/lib/engine/simulation/openfoam-exporter';
import { buildStructuredGrid, recommendCellSize } from '@/lib/engine/simulation/geometry-builder';
import { toFallbackGeometry } from '@/lib/simulation/building-case';
import {
  isOpenFOAMCloudConfigured,
  missingOpenFOAMCloudConfig,
  getOpenFOAMCloudConfig,
  uploadCaseInput,
  triggerSolveJob,
  resolveCallbackUrl,
  caseInputObjectPath,
  resultOutputObjectPath,
} from '@/lib/engine/simulation/cfd-cloud';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

const SIMULATION_RUNS_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

// Engineering runs cost compute — keep the per-user trigger rate low (plan §D5:
// per-user rate limiting lives at the API layer, no new queue infra).
const SIMULATION_RUNS_POST_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 6,
} as const;

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-runs-get', SIMULATION_RUNS_GET_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

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

    const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? '25');
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, Math.floor(requestedLimit)))
      : 25;

    const runs = await listRunJobs(projectId, simId, limit);

    return NextResponse.json({
      runs,
      activeRunId: simCase.activeRunId ?? null,
      status: simCase.status,
    });
  } catch (error) {
    console.error('GET .../runs error:', error);
    const d = getErrorDetails(error, 'Failed to list run history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-runs-post', SIMULATION_RUNS_POST_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: projectId, simId } = await context.params;

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

    if (simCase.status === 'running' || simCase.status === 'queued') {
      return errorResponse(409, 'Already running', 'Case already has an active run.', 'ALREADY_RUNNING');
    }

    const parsed = await parseJsonBody(request, startEngineeringRunSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const backend = body?.solverBackend;
    if (backend === 'preview') {
      return errorResponse(
        400,
        'Wrong tier endpoint',
        'The Preview tier runs in-browser via POST .../run. This route triggers Engineering (OpenFOAM) runs.',
        'USE_PREVIEW_ENDPOINT',
      );
    }

    // Ensure the case has a mesh to export. Mirror the export route: building-scope
    // cases without a stored mesh get a synthetic structured grid derived on the fly.
    let caseForExport = simCase;
    if (!simCase.mesh) {
      if (simCase.simulationScope === 'building' && simCase.buildingGeometry) {
        const geometry = toFallbackGeometry(simCase.buildingGeometry);
        const cellSize = recommendCellSize(geometry);
        const mesh = buildStructuredGrid(geometry, cellSize);
        caseForExport = { ...simCase, mesh, geometry };
      } else {
        return errorResponse(400, 'Not meshed', 'Generate a mesh before running an Engineering simulation.', 'NOT_MESHED');
      }
    }

    const mesh = caseForExport.mesh!;
    const dimensions = { nx: mesh.nx, ny: mesh.ny, nz: mesh.nz };

    // Build the OpenFOAM case package up front so an export failure is surfaced
    // synchronously, before we ever create a run job or touch the cloud.
    const config = buildOpenFOAMConfig(caseForExport);
    const files: Record<string, string> = {};
    for (const [path, content] of generateCaseFiles(config)) {
      files[path] = content;
    }

    // Gate on provisioning. When the Engineering tier is not provisioned (the
    // default before C2), return a clean 503 rather than creating a dangling job.
    if (!isOpenFOAMCloudConfigured()) {
      return errorResponse(
        503,
        'Engineering tier not provisioned',
        `The OpenFOAM cloud path is not configured. Missing: ${missingOpenFOAMCloudConfig().join(', ')}. ` +
          'Use the Preview tier, or complete plan phases C1–C2.',
        'ENGINEERING_TIER_NOT_PROVISIONED',
      );
    }

    const cloud = getOpenFOAMCloudConfig();

    // Record the run job and mark the case queued before dispatch.
    const job = await createRunJob(projectId, simId, {
      ownerId: auth.user.id,
      source: 'openfoam',
      totalIterations: caseForExport.solver.maxIterations,
    });
    await updateSimulationCase(projectId, simId, {
      status: 'queued',
      activeRunId: job.id,
      runSource: 'openfoam',
      solverBackend: 'engineering',
    });

    try {
      const inputObjectPath = caseInputObjectPath(projectId, simId, job.id);
      const resultObjectPath = resultOutputObjectPath(projectId, simId, job.id);
      const callbackUrl = resolveCallbackUrl(
        request.nextUrl.origin,
        projectId,
        simId,
        job.id,
        cloud.callbackBaseUrl,
      );

      await uploadCaseInput(cloud, inputObjectPath, {
        solver: config.solver,
        caseName: config.caseName,
        files,
        dimensions,
        runJobId: job.id,
        callbackUrl,
        callbackSecret: cloud.callbackSecret,
      });

      const execution = await triggerSolveJob(cloud, {
        runJobId: job.id,
        inputObjectPath,
        resultObjectPath,
        callbackUrl,
      });

      await updateRunJobStatus(projectId, simId, job.id, 'running', {
        startedAt: new Date().toISOString(),
        logTail: [`Cloud Run Job dispatched: ${execution}`],
      });
      await updateCaseStatus(projectId, simId, 'running');

      // 202 Accepted — never block the request on the solve (plan §4.3).
      return NextResponse.json(
        { runId: job.id, status: 'running', source: 'openfoam', execution },
        { status: 202 },
      );
    } catch (dispatchErr) {
      const errorMessage = dispatchErr instanceof Error ? dispatchErr.message : 'Failed to dispatch solver job';
      await updateRunJobStatus(projectId, simId, job.id, 'failed', {
        errorMessage,
        completedAt: new Date().toISOString(),
      });
      await updateCaseStatus(projectId, simId, 'failed');
      return errorResponse(502, 'Dispatch failed', errorMessage, 'SOLVER_DISPATCH_FAILED');
    }
  } catch (error) {
    console.error('POST .../runs error:', error);
    const d = getErrorDetails(error, 'Failed to start Engineering simulation run');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
