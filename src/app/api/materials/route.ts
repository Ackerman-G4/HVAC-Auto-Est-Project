/**
 * Materials API — DB-backed CRUD
 * GET  /api/materials — List materials
 * POST /api/materials — Create material
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  createMaterialRecord,
  getSupplierRecord,
  listMaterialsForApi,
} from '@/lib/firebase/catalog-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest } from '@/lib/utils/api-helpers';
import {
  getCatalogValidationError,
  materialCreateSchema,
} from '@/lib/validation/catalog';

const MATERIAL_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

const MATERIAL_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'materials-get', MATERIAL_GET_RATE_LIMIT);
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

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const payload = await listMaterialsForApi({ category, search });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/materials error:', error);
    const d = getErrorDetails(error, 'Failed to fetch materials');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'materials-post', MATERIAL_MUTATION_RATE_LIMIT);
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

    const body = await request.json();
    const parsed = materialCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getCatalogValidationError(parsed.error) }, { status: 400 });
    }

    const payload = parsed.data;

    const created = await createMaterialRecord({
      category: payload.category,
      name: payload.name,
      specification: payload.specification || '',
      unit: payload.unit,
      unitPricePHP: payload.unitPricePHP,
      supplierId: payload.supplierId ?? null,
    });

    const supplier = created.supplierId ? await getSupplierRecord(created.supplierId) : null;
    const material = { ...created, supplier };

    await writeAuditLog({
      projectId: 'system',
      action: 'created',
      entity: 'material',
      entityId: created.id,
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        name: created.name,
        category: created.category,
      }),
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    console.error('POST /api/materials error:', error);
    const d = getErrorDetails(error, 'Failed to create material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
