/**
 * Materials API — DB-backed CRUD
 * GET  /api/materials — List materials
 * POST /api/materials — Create material
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import {
  createMaterialRecord,
  getSupplierRecord,
  listMaterialsForApi,
} from '@/lib/firebase/catalog-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import {
  getCatalogValidationError,
  materialCreateSchema,
} from '@/lib/validation/catalog';

export async function GET(request: NextRequest) {
  try {
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
