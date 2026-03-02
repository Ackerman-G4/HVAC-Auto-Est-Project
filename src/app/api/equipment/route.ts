/**
 * Equipment Catalog API — Browse available equipment
 * GET /api/equipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const brand = searchParams.get('brand');
    const search = searchParams.get('search');
    const minCapacity = searchParams.get('minCapacity');
    const maxCapacity = searchParams.get('maxCapacity');

    let equipment = [...EQUIPMENT_CATALOG];

    if (type) {
      equipment = equipment.filter((e) => e.type === type);
    }

    if (brand) {
      equipment = equipment.filter(
        (e) => e.manufacturer.toLowerCase() === brand.toLowerCase()
      );
    }

    if (search) {
      const q = search.toLowerCase();
      equipment = equipment.filter(
        (e) =>
          e.manufacturer.toLowerCase().includes(q) ||
          e.model.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q)
      );
    }

    if (minCapacity) {
      equipment = equipment.filter(
        (e) => e.capacityBTU >= parseInt(minCapacity)
      );
    }

    if (maxCapacity) {
      equipment = equipment.filter(
        (e) => e.capacityBTU <= parseInt(maxCapacity)
      );
    }

    const brands = [...new Set(EQUIPMENT_CATALOG.map((e) => e.manufacturer))];
    const types = [...new Set(EQUIPMENT_CATALOG.map((e) => e.type))];

    return NextResponse.json({
      equipment,
      brands,
      types,
      totalCount: equipment.length,
    });
  } catch (error) {
    console.error('GET /api/equipment error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment catalog' },
      { status: 500 }
    );
  }
}
