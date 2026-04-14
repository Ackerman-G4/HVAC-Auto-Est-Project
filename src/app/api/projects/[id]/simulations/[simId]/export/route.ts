/**
 * Simulation Export API — Generate OpenFOAM case package
 * GET /api/projects/[id]/simulations/[simId]/export
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import { getSimulationCase } from '@/lib/firebase/simulation-cases-store';
import { buildOpenFOAMConfig, generateCaseFiles } from '@/lib/engine/simulation/openfoam-exporter';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
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
    if (!simCase.mesh) {
      return errorResponse(400, 'Not meshed', 'Case must have a mesh before export.', 'NOT_MESHED');
    }

    const config = buildOpenFOAMConfig(simCase);
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
