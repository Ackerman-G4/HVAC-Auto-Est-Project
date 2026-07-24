/**
 * Individual Material API — Update + Delete
 * PUT    /api/materials/[id] — Update material
 * DELETE /api/materials/[id] — Delete material
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  deleteMaterialRecord,
  getMaterialRecord,
  getSupplierRecord,
  updateMaterialRecord,
} from '@/lib/firebase/catalog-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest, resourceNotFound } from '@/lib/utils/api-helpers';
import {
  getCatalogValidationError,
  materialUpdateSchema,
} from '@/lib/validation/catalog';

type RouteContext = { params: Promise<{ id: string }> };

const MATERIAL_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'materials-id-put', MATERIAL_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = materialUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getCatalogValidationError(parsed.error) }, { status: 400 });
    }

    const payload = parsed.data;

    const existing = await getMaterialRecord(id);
    if (!existing) {
      return resourceNotFound('Material', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    const updated = await updateMaterialRecord(id, {
      category: payload.category ?? existing.category,
      name: payload.name ?? existing.name,
      specification: payload.specification ?? existing.specification,
      unit: payload.unit ?? existing.unit,
      unitPricePHP: payload.unitPricePHP ?? existing.unitPricePHP,
      supplierId: 'supplierId' in payload ? payload.supplierId ?? null : existing.supplierId,
    });

    if (!updated) {
      return resourceNotFound('Material', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    const supplier = updated.supplierId ? await getSupplierRecord(updated.supplierId) : null;
    const material = { ...updated, supplier };

    await writeAuditLog({
      projectId: 'system',
      action: 'updated',
      entity: 'material',
      entityId: updated.id,
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
      }),
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updated),
    });

    return NextResponse.json({ material });
  } catch (error) {
    console.error('PUT material error:', error);
    const d = getErrorDetails(error, 'Failed to update material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'materials-id-delete', MATERIAL_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;

    const existing = await getMaterialRecord(id);
    if (!existing) {
      return resourceNotFound('Material', 'The material does not exist.', 'MATERIAL_NOT_FOUND');
    }

    await deleteMaterialRecord(id);

    await writeAuditLog({
      projectId: 'system',
      action: 'deleted',
      entity: 'material',
      entityId: id,
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
      }),
      previousValue: JSON.stringify(existing),
    });

    return NextResponse.json({ message: 'Material deleted' });
  } catch (error) {
    console.error('DELETE material error:', error);
    const d = getErrorDetails(error, 'Failed to delete material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
