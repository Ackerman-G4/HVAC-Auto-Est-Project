/**
 * Suppliers API — DB-backed CRUD
 * GET  /api/suppliers — List suppliers
 * POST /api/suppliers — Create supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupplierRecord, listSuppliersForApi } from '@/lib/firebase/catalog-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
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
    const body = await request.json();

    const supplier = await createSupplierRecord({
      name: body.name || 'New Supplier',
      type: body.type || 'local',
      website: body.website || '',
      location: body.location || '',
      contactInfo: body.contactInfo || '',
      coverageArea: body.coverageArea || '',
      categories: body.categories ? JSON.stringify(body.categories) : '[]',
    });

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    console.error('POST /api/suppliers error:', error);
    const d = getErrorDetails(error, 'Failed to create supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
