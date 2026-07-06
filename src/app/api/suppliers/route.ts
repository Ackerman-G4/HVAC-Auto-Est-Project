/**
 * Suppliers API — DB-backed CRUD
 * GET  /api/suppliers — List suppliers
 * POST /api/suppliers — Create supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { createSupplierRecord, listSuppliersForApi } from '@/lib/firebase/catalog-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import {
  getCatalogValidationError,
  supplierCreateSchema,
} from '@/lib/validation/catalog';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search');

    const payload = await listSuppliersForApi({ type, search });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/suppliers error:', error);
    const d = getErrorDetails(error, 'Failed to fetch suppliers');
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
    const parsed = supplierCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getCatalogValidationError(parsed.error) }, { status: 400 });
    }

    const payload = parsed.data;

    const supplier = await createSupplierRecord({
      name: payload.name,
      type: payload.type,
      website: payload.website || '',
      location: payload.location || '',
      contactInfo: payload.contactInfo || '',
      coverageArea: payload.coverageArea || '',
      categories: JSON.stringify(payload.categories || []),
    });

    await writeAuditLog({
      projectId: 'system',
      action: 'created',
      entity: 'supplier',
      entityId: supplier.id,
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        name: supplier.name,
        type: supplier.type,
      }),
    });

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    console.error('POST /api/suppliers error:', error);
    const d = getErrorDetails(error, 'Failed to create supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
