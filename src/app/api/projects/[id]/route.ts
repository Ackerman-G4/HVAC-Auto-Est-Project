/**
 * Single Project API — GET, PUT, DELETE
 * GET    /api/projects/[id]
 * PUT    /api/projects/[id]
 * DELETE /api/projects/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import {
  deleteProjectRecordPermanently,
  getProjectRecord,
  getProjectWithDetails,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import {
  toNumber,
  toInt,
  errorResponse,
  getErrorDetails,
  resourceNotFound,
} from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

function toNullableNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  const parsed = toNumber(value, NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;

    const project = await getProjectWithDetails(id);

    if (!project) {
      return resourceNotFound(
        'Project',
        'The project ID does not match any existing project record.',
        'PROJECT_NOT_FOUND',
      );
    }

    if (!isProjectOwnerOrAdmin(auth.user, project)) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    return NextResponse.json({
      project,
    });
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to fetch project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;
    const body = await request.json();

    const existing = await getProjectRecord(id);
    if (!existing) {
      return resourceNotFound(
        'Project',
        'The project you are trying to update no longer exists.',
        'PROJECT_NOT_FOUND',
      );
    }

    if (!isProjectOwnerOrAdmin(auth.user, existing)) {
      return errorResponse(403, 'Forbidden', 'You do not have permission to update this project.', 'FORBIDDEN');
    }

    const finalOutdoorDB = toNumber(body.outdoorDB, existing.outdoorDB);
    const finalOutdoorRH = toNumber(body.outdoorRH, existing.outdoorRH);
    const computedWB = calcWetBulb(finalOutdoorDB, finalOutdoorRH);

    const nextSuggestedLaborMultiplier = toNumber(body.suggestedLaborMultiplier, existing.suggestedLaborMultiplier);
    const nextLaborMultiplierOverride = toNullableNumber(body.laborMultiplierOverride, existing.laborMultiplierOverride);
    const nextSuggestedOverheadPercent = toNumber(body.suggestedOverheadPercent, existing.suggestedOverheadPercent);
    const nextOverheadPercentOverride = toNullableNumber(body.overheadPercentOverride, existing.overheadPercentOverride);
    const nextSuggestedContingencyPercent = toNumber(
      body.suggestedContingencyPercent,
      existing.suggestedContingencyPercent,
    );
    const nextContingencyPercentOverride = toNullableNumber(
      body.contingencyPercentOverride,
      existing.contingencyPercentOverride,
    );
    const nextSuggestedVatRate = toNumber(body.suggestedVatRate, existing.suggestedVatRate);
    const nextVatRateOverride = toNullableNumber(body.vatRateOverride, existing.vatRateOverride);

    const pricingChanged =
      nextSuggestedLaborMultiplier !== existing.suggestedLaborMultiplier ||
      nextLaborMultiplierOverride !== existing.laborMultiplierOverride ||
      nextSuggestedOverheadPercent !== existing.suggestedOverheadPercent ||
      nextOverheadPercentOverride !== existing.overheadPercentOverride ||
      nextSuggestedContingencyPercent !== existing.suggestedContingencyPercent ||
      nextContingencyPercentOverride !== existing.contingencyPercentOverride ||
      nextSuggestedVatRate !== existing.suggestedVatRate ||
      nextVatRateOverride !== existing.vatRateOverride;

    await updateProjectRecord(id, {
      name: body.name ?? existing.name,
      clientName: body.clientName ?? existing.clientName,
      buildingType: body.buildingType ?? existing.buildingType,
      location: body.location ?? existing.location,
      city: body.city ?? existing.city,
      totalFloorArea: toNumber(body.totalFloorArea, existing.totalFloorArea),
      floorsAboveGrade: toInt(body.floorsAboveGrade, existing.floorsAboveGrade),
      floorsBelowGrade: toInt(body.floorsBelowGrade, existing.floorsBelowGrade),
      outdoorDB: finalOutdoorDB,
      outdoorWB: Math.round(computedWB * 100) / 100,
      outdoorRH: finalOutdoorRH,
      indoorDB: toNumber(body.indoorDB, existing.indoorDB),
      indoorRH: toNumber(body.indoorRH, existing.indoorRH),
      safetyFactor: toNumber(body.safetyFactor, existing.safetyFactor),
      diversityFactor: toNumber(body.diversityFactor, existing.diversityFactor),
      suggestedLaborMultiplier: nextSuggestedLaborMultiplier,
      laborMultiplierOverride: nextLaborMultiplierOverride,
      suggestedOverheadPercent: nextSuggestedOverheadPercent,
      overheadPercentOverride: nextOverheadPercentOverride,
      suggestedContingencyPercent: nextSuggestedContingencyPercent,
      contingencyPercentOverride: nextContingencyPercentOverride,
      suggestedVatRate: nextSuggestedVatRate,
      vatRateOverride: nextVatRateOverride,
      isBoqStale: pricingChanged ? true : existing.isBoqStale,
      lastBoqGeneratedAt: pricingChanged ? null : existing.lastBoqGeneratedAt,
      notes: body.notes ?? existing.notes,
      status: body.status ?? existing.status,
    });

    await writeAuditLog({
      projectId: id,
      action: 'updated',
      entity: 'project',
      entityId: id,
      details: JSON.stringify(body),
    });

    const project = await getProjectWithDetails(id);
    if (!project) {
      return resourceNotFound(
        'Project',
        'The project you are trying to update no longer exists.',
        'PROJECT_NOT_FOUND',
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('PUT /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to update project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;
    const permanent = new URL(request.url).searchParams.get('permanent') === 'true';

    const existing = await getProjectRecord(id);
    if (!existing) {
      return resourceNotFound(
        'Project',
        'The project you are trying to delete no longer exists.',
        'PROJECT_NOT_FOUND',
      );
    }

    if (!isProjectOwnerOrAdmin(auth.user, existing)) {
      return errorResponse(403, 'Forbidden', 'You do not have permission to delete this project.', 'FORBIDDEN');
    }

    if (permanent) {
      if (auth.user.role !== 'admin') {
        return errorResponse(403, 'Forbidden', 'Only admins can permanently delete projects.', 'FORBIDDEN');
      }
      await writeAuditLog({
        projectId: id,
        action: 'permanently_deleted',
        entity: 'project',
        entityId: id,
      });
      await deleteProjectRecordPermanently(id);
    } else {
      await updateProjectRecord(id, { status: 'deleted' });
      await writeAuditLog({
        projectId: id,
        action: 'deleted',
        entity: 'project',
        entityId: id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error);
    const d = getErrorDetails(error, 'Failed to delete project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
