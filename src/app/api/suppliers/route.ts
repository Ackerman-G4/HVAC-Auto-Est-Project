/**
 * Suppliers API — DB-backed CRUD
 * GET  /api/suppliers — List suppliers
 * POST /api/suppliers — Create supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { createSupplierRecord, listSuppliersForApi } from '@/lib/firebase/catalog-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest } from '@/lib/utils/api-helpers';
import {
  getCatalogValidationError,
  supplierCreateSchema,
} from '@/lib/validation/catalog';

const SUPPLIER_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

const SUPPLIER_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'suppliers-get', SUPPLIER_GET_RATE_LIMIT);
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
    const rateLimit = evaluateRateLimit(request, 'suppliers-post', SUPPLIER_MUTATION_RATE_LIMIT);
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
