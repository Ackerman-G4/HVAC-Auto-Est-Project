/**
 * Suppliers API — DB-backed CRUD
 * GET  /api/suppliers — List suppliers
 * POST /api/suppliers — Create supplier
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const suppliers = await neon.supplier.findMany({
      where,
      include: { materials: true },
      orderBy: { name: 'asc' },
    });

    const allSuppliers = await neon.supplier.findMany({ select: { type: true } });
    const types = [...new Set(allSuppliers.map((s) => s.type))];

    return NextResponse.json({ suppliers, types });
  } catch (error) {
    console.error('GET /api/suppliers error:', error);
    const d = getErrorDetails(error, 'Failed to fetch suppliers');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const supplier = await prisma.supplier.create({
      data: {
        name: body.name || 'New Supplier',
        type: body.type || 'local',
        website: body.website || '',
        location: body.location || '',
        contactInfo: body.contactInfo || '',
        coverageArea: body.coverageArea || '',
        categories: body.categories ? JSON.stringify(body.categories) : '[]',
      },
    });

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    console.error('POST /api/suppliers error:', error);
    const d = getErrorDetails(error, 'Failed to create supplier');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
