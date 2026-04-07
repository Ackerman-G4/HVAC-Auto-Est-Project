/**
 * Materials API — DB-backed CRUD
 * GET  /api/materials — List materials
 * POST /api/materials — Create material
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createMaterialRecord,
  getSupplierRecord,
  listMaterialsForApi,
} from '@/lib/firebase/catalog-store';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
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
    const body = await request.json();

    const created = await createMaterialRecord({
      category: body.category || 'misc',
      name: body.name || 'New Material',
      specification: body.specification || '',
      unit: body.unit || 'pc',
      unitPricePHP: body.unitPricePHP ?? 0,
      supplierId: body.supplierId || null,
    });

    const supplier = created.supplierId ? await getSupplierRecord(created.supplierId) : null;
    const material = { ...created, supplier };

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    console.error('POST /api/materials error:', error);
    const d = getErrorDetails(error, 'Failed to create material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
