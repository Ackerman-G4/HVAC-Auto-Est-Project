/**
 * Simulation Export API — Generate OpenFOAM case package
 * GET /api/projects/[id]/simulations/[simId]/export
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import { getSimulationCase } from '@/lib/firebase/simulation-cases-store';
import { buildOpenFOAMConfig, generateCaseFiles } from '@/lib/engine/simulation/openfoam-exporter';
import { buildStructuredGrid, recommendCellSize } from '@/lib/engine/simulation/geometry-builder';
import { toFallbackGeometry } from '@/lib/simulation/building-case';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

const SIMULATION_EXPORT_GET_RATE_LIMIT = {
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
    const rateLimit = evaluateRateLimit(request, 'projects-id-simulations-simid-export-get', SIMULATION_EXPORT_GET_RATE_LIMIT);
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
    if (!simCase.mesh && simCase.simulationScope !== 'building') {
      return errorResponse(400, 'Not meshed', 'Case must have a mesh before export.', 'NOT_MESHED');
    }

    // For building-scope cases without a stored mesh, derive a synthetic mesh for export
    let caseForExport = simCase;
    if (simCase.simulationScope === 'building' && !simCase.mesh && simCase.buildingGeometry) {
      const geometry = toFallbackGeometry(simCase.buildingGeometry);
      const cellSize = recommendCellSize(geometry);
      const mesh = buildStructuredGrid(geometry, cellSize);
      caseForExport = { ...simCase, mesh, geometry };
    }

    const config = buildOpenFOAMConfig(caseForExport);
    const files = generateCaseFiles(config);

    // Return as JSON map of file paths to content
    const fileMap: Record<string, string> = {};
    for (const [path, content] of files) {
      fileMap[path] = content;
    }

    return NextResponse.json({
      caseName: config.caseName,
      files: fileMap,
      config,
    });
  } catch (error) {
    console.error('GET .../export error:', error);
    const d = getErrorDetails(error, 'Failed to export simulation case');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
