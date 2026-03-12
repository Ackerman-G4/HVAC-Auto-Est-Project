/**
 * Settings API — Firebase-backed user settings
 * GET /api/settings — Get user-specific settings
 * POST /api/settings — Update user-specific settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { getUserId, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

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

export async function GET(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to fetch settings.');
    }

    const snapshot = await adminDb.ref(`users/${uid}/settings`).once('value');
    const data = snapshot.val();

    const settings = { ...DEFAULT_SETTINGS, ...data };

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    const d = getErrorDetails(error, 'Failed to fetch settings');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to update settings.');
    }

    const body = await request.json();
    const ref = adminDb.ref(`users/${uid}/settings`);
    
    // Get existing to merge
    const snapshot = await ref.once('value');
    const current = snapshot.val() || {};
    
    const merged = { ...current, ...body, updatedAt: Date.now() };

    await ref.set(merged);

    return NextResponse.json({ settings: merged });
  } catch (error) {
    console.error('POST /api/settings error:', error);
    const d = getErrorDetails(error, 'Failed to update settings');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
