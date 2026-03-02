/**
 * Materials API — Browse & search material catalog
 * GET /api/materials
 */

import { NextRequest, NextResponse } from 'next/server';
import { MATERIAL_DEFAULTS } from '@/constants/material-defaults';
import { PHILIPPINE_SUPPLIERS } from '@/constants/philippine-suppliers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    let materials = [...MATERIAL_DEFAULTS];

    if (category) {
      materials = materials.filter((m) => m.category === category);
    }

    if (search) {
      const q = search.toLowerCase();
      materials = materials.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.specification?.toLowerCase().includes(q)
      );
    }

    // Get unique categories
    const categories = [...new Set(MATERIAL_DEFAULTS.map((m: { category: any; }) => m.category))];

    // Transform to match frontend expectations
    const transformed = materials.map((m) => ({
      name: m.name,
      category: m.category,
      unit: m.unit,
      unitPrice: m.unitPricePHP,
      specifications: m.specification,
    }));

    return NextResponse.json({
      materials: transformed,
      categories,
      totalCount: transformed.length,
    });
  } catch (error) {
    console.error('GET /api/materials error:', error);
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
  }
}

/**
 * Suppliers API — GET /api/materials/suppliers
 */
export async function POST(request: NextRequest) {
  // Used as a workaround to get suppliers via /api/materials with POST
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    let suppliers = [...PHILIPPINE_SUPPLIERS];

    if (type) {
      suppliers = suppliers.filter((s) => s.type === type);
    }

    return NextResponse.json({ suppliers });
  } catch (error) {
    console.error('POST /api/materials error:', error);
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}
