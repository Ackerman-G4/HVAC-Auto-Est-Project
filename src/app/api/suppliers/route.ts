/**
 * Suppliers API — Firebase-backed CRUD
 * GET  /api/suppliers — List suppliers
 * POST /api/suppliers — Create supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { getUserId, getAuthToken, isAdmin, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to view suppliers.');
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.toLowerCase();

    const snapshot = await adminDb.ref('metadata/suppliers').once('value');
    const suppliersMap = snapshot.val() || {};
    
    let suppliers = Object.entries(suppliersMap).map(([id, data]) => ({
      id,
      ...(data as any),
    }));

    // Filtering
    if (type) {
      suppliers = suppliers.filter((s) => s.type === type);
    }
    if (search) {
      suppliers = suppliers.filter((s) => 
        s.name?.toLowerCase().includes(search) || 
        s.location?.toLowerCase().includes(search)
      );
    }

    // Sort: name ASC
    suppliers.sort((a, b) => a.name.localeCompare(b.name));

    const types = [...new Set(suppliers.map((s) => s.type))];

    return NextResponse.json({ suppliers, types });
  } catch (error) {
    console.error('GET /api/suppliers error:', error);
    const d = getErrorDetails(error, 'Failed to fetch suppliers');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to create suppliers.');
    }

    if (!isAdmin(token)) {
      return errorResponse(403, 'Forbidden', 'Only administrators can create suppliers.');
    }

    const uid = token.uid;
    const body = await request.json();
    const newRef = adminDb.ref('metadata/suppliers').push();

    const supplierData = {
      name: body.name || 'New Supplier',
      type: body.type || 'local',
      website: body.website || '',
      location: body.location || '',
      contactInfo: body.contactInfo || '',
      coverageArea: body.coverageArea || '',
      categories: body.categories || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await newRef.set(supplierData);

    return NextResponse.json({ 
      supplier: { id: newRef.key, ...supplierData } 
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/suppliers error:', error);
    const d = getErrorDetails(error, 'Failed to create supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
