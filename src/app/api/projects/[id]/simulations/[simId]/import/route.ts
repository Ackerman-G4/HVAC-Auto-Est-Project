/**
 * Simulation Import API — Import external CFD results
 * POST /api/projects/[id]/simulations/[simId]/import
 *
 * Accepts field data arrays and normalizes them into internal format.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  updateSimulationCase,
  createRunJob,
  updateRunJobStatus,
  saveArtifactManifest,
} from '@/lib/firebase/simulation-cases-store';
import { importFieldData } from '@/lib/engine/simulation/result-importer';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import type { RunSource } from '@/types/simulation';

type RouteContext = { params: Promise<{ id: string; simId: string }> };

function isProjectOwnerOrAdmin(
  user: { id: string; role: string },
  project: { createdBy?: string },
): boolean {
  if (user.role === 'admin') return true;
  return !!project.createdBy && project.createdBy === user.id;
}

export async function POST(request: NextRequest, context: RouteContext) {
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
      return errorResponse(400, 'Not meshed', 'Case must have a mesh for result import.', 'NOT_MESHED');
    }

    const body = await request.json();

    if (!body.fields) {
      return errorResponse(400, 'Fields required', 'Provide field data to import.', 'MISSING_FIELDS');
    }

    const source: RunSource = body.source || 'manual-import';
    const dims = {
      nx: simCase.mesh.nx,
      ny: simCase.mesh.ny,
      nz: simCase.mesh.nz,
    };

    // Create a run job to record the import
    const job = await createRunJob(projectId, simId, {
      ownerId: auth.user.id,
      source,
      totalIterations: 0,
    });

    try {
      const result = importFieldData(
        simId,
        job.id,
        source,
        dims,
        body.fields,
      );

      await saveArtifactManifest(projectId, simId, result.manifest);

      await updateRunJobStatus(projectId, simId, job.id, 'completed', {
        completedAt: new Date().toISOString(),
      });

      await updateSimulationCase(projectId, simId, {
        status: 'imported',
        resultId: job.id,
        runSource: source,
      });

      return NextResponse.json({
        manifest: result.manifest,
        fieldsImported: result.fields.map((f) => f.name),
      }, { status: 201 });
    } catch (importErr) {
      await updateRunJobStatus(projectId, simId, job.id, 'failed', {
        errorMessage: importErr instanceof Error ? importErr.message : 'Import failed',
        completedAt: new Date().toISOString(),
      });

      return errorResponse(
        422,
        'Import error',
        importErr instanceof Error ? importErr.message : 'Failed to parse field data',
        'IMPORT_ERROR',
      );
    }
  } catch (error) {
    console.error('POST .../import error:', error);
    const d = getErrorDetails(error, 'Failed to import simulation results');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
