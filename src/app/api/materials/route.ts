/**
 * Materials API — DB-backed CRUD
 * GET  /api/materials — List materials
 * POST /api/materials — Create material
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { specification: { contains: search, mode: 'insensitive' } },
      ];
    }

    const materials = await neon.material.findMany({
      where,
      include: { supplier: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const allMaterials = await neon.material.findMany({ select: { category: true } });
    const categories = [...new Set(allMaterials.map((m) => m.category))];

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
    const body = await request.json();

    const material = await neon.material.create({
      data: {
        category: body.category || 'misc',
        name: body.name || 'New Material',
        specification: body.specification || '',
        unit: body.unit || 'pc',
        unitPricePHP: body.unitPricePHP ?? 0,
        supplierId: body.supplierId || null,
      },
      include: { supplier: true },
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    console.error('POST /api/materials error:', error);
    const d = getErrorDetails(error, 'Failed to create material');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
