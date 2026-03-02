/**
 * Suppliers API
 * GET /api/suppliers
 */

import { NextRequest, NextResponse } from 'next/server';
import { PHILIPPINE_SUPPLIERS } from '@/constants/philippine-suppliers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search');

    let suppliers = [...PHILIPPINE_SUPPLIERS];

    if (type) {
      suppliers = suppliers.filter((s) => s.type === type);
    }

    if (search) {
      const q = search.toLowerCase();
      suppliers = suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q) ||
          s.categories?.some((c: string) => c.toLowerCase().includes(q))
      );
    }

    const types = [...new Set(PHILIPPINE_SUPPLIERS.map((s) => s.type))];

    return NextResponse.json({ suppliers, types });
  } catch (error) {
    console.error('GET /api/suppliers error:', error);
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}
