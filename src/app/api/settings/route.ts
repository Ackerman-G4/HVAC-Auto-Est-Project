/**
 * Settings API — DB-backed app settings
 * GET /api/settings — Get settings
 * PUT /api/settings — Update settings
 */

import { NextResponse } from 'next/server';
import { getMergedSettings, upsertSettings } from '@/lib/firebase/catalog-store';
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
    const settings = await getMergedSettings(DEFAULT_SETTINGS);

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

    const settings = await upsertSettings(DEFAULT_SETTINGS, body || {});

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    const d = getErrorDetails(error, 'Failed to update settings');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
