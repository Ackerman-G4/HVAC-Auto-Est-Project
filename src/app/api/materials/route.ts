/**
 * Materials API — Firebase-backed CRUD
 * GET  /api/materials — List materials
 * POST /api/materials — Create material
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { getUserId, getAuthToken, isAdmin, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to view materials.');
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.toLowerCase();

    const snapshot = await adminDb.ref('metadata/materials').once('value');
    const materialsMap = snapshot.val() || {};
    
    let materials = Object.entries(materialsMap).map(([id, data]) => ({
      id,
      ...(data as any),
    }));

    // Filtering
    if (category) {
      materials = materials.filter((m) => m.category === category);
    }
    if (search) {
      materials = materials.filter((m) => 
        m.name?.toLowerCase().includes(search) || 
        m.category?.toLowerCase().includes(search) || 
        m.specification?.toLowerCase().includes(search)
      );
    }

    // Sort: category ASC, name ASC
    materials.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    const categories = [...new Set(materials.map((m) => m.category))];

    return NextResponse.json({
      materials,
      categories,
      totalCount: materials.length,
    });
  } catch (error) {
    console.error('GET /api/materials error:', error);
    const d = getErrorDetails(error, 'Failed to fetch materials');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to create materials.');
    }

    if (!isAdmin(token)) {
      return errorResponse(403, 'Forbidden', 'Only administrators can create materials.');
    }

    const uid = token.uid;
    const body = await request.json();
    const newRef = adminDb.ref('metadata/materials').push();
    
    const materialData = {
      category: body.category || 'misc',
      name: body.name || 'New Material',
      specification: body.specification || '',
      unit: body.unit || 'pc',
      unitPricePHP: body.unitPricePHP ?? 0,
      supplierId: body.supplierId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await newRef.set(materialData);

    return NextResponse.json({ 
      material: { id: newRef.key, ...materialData } 
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/materials error:', error);
    const d = getErrorDetails(error, 'Failed to create material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
