/**
 * Equipment Catalog API — Browse available equipment
 * GET /api/equipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import { parseBoundedInt } from '@/lib/utils/api-helpers';

const EQUIPMENT_CATALOG_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'equipment-get', EQUIPMENT_CATALOG_GET_RATE_LIMIT);
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
    const brand = searchParams.get('brand');
    const search = searchParams.get('search');
    const minCapacityRaw = searchParams.get('minCapacity');
    const maxCapacityRaw = searchParams.get('maxCapacity');
    const minCapacity = parseBoundedInt(minCapacityRaw, {
      defaultValue: 0,
      min: 0,
      max: 5_000_000,
    });
    const maxCapacity = parseBoundedInt(maxCapacityRaw, {
      defaultValue: 5_000_000,
      min: 0,
      max: 5_000_000,
    });

    if (minCapacity > maxCapacity) {
      return NextResponse.json(
        { error: 'minCapacity must be less than or equal to maxCapacity' },
        { status: 400 },
      );
    }

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

    if (minCapacityRaw !== null) {
      equipment = equipment.filter(
        (e) => e.capacityBTU >= minCapacity
      );
    }

    if (maxCapacityRaw !== null) {
      equipment = equipment.filter(
        (e) => e.capacityBTU <= maxCapacity
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
