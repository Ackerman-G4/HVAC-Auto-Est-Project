/**
 * Settings API — DB-backed app settings
 * GET /api/settings — Get settings
 * PUT /api/settings — Update settings
 */

import { NextResponse } from 'next/server';
import { getNeon } from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

const DEFAULT_SETTINGS = {
  companyName: '',
  companyLogo: '',
  currency: 'PHP',
  defaultSafetyFactor: 1.1,
  defaultDiversityFactor: 0.85,
  defaultOutdoorDB: 35,
  defaultOutdoorWB: 28,
  defaultIndoorDB: 24,
  defaultIndoorRH: 50,
  laborRate: 0.35,
  overheadPercent: 15,
  contingencyPercent: 5,
  vatPercent: 12,
};

export async function GET() {
  try {
    const neon = getNeon();
    const record = await neon.appSettings.findUnique({ where: { id: 'global' } });

    let settings = DEFAULT_SETTINGS;
    if (record) {
      try {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(record.data) };
      } catch {
        // fallback to defaults if JSON is invalid
      }
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    const d = getErrorDetails(error, 'Failed to fetch settings');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Merge with existing settings
    const neon = getNeon();
    const existing = await neon.appSettings.findUnique({ where: { id: 'global' } });
    let current = DEFAULT_SETTINGS;
    if (existing) {
      try {
        current = { ...DEFAULT_SETTINGS, ...JSON.parse(existing.data) };
      } catch {
        // fallback
      }
    }

    const merged = { ...current, ...body };

    const record = await neon.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', data: JSON.stringify(merged) },
      update: { data: JSON.stringify(merged) },
    });

    return NextResponse.json({ settings: JSON.parse(record.data) });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    const d = getErrorDetails(error, 'Failed to update settings');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
