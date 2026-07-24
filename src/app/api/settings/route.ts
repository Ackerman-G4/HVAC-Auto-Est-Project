/**
 * Settings API — DB-backed app settings
 * GET /api/settings — Get settings
 * PUT /api/settings — Update settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getMergedSettings, upsertSettings } from '@/lib/firebase/catalog-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { errorResponse, getErrorDetails, requireJsonRequest } from '@/lib/utils/api-helpers';
import {
  getCatalogValidationError,
  settingsUpdateSchema,
} from '@/lib/validation/catalog';

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

const SETTINGS_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 15,
} as const;

const SETTINGS_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'settings-get', SETTINGS_GET_RATE_LIMIT);
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

    const settings = await getMergedSettings(DEFAULT_SETTINGS);

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    const d = getErrorDetails(error, 'Failed to fetch settings');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'settings-put', SETTINGS_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json();
    const parsed = settingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getCatalogValidationError(parsed.error) }, { status: 400 });
    }

    const previousSettings = await getMergedSettings(DEFAULT_SETTINGS);

    const settings = await upsertSettings(DEFAULT_SETTINGS, parsed.data || {});

    await writeAuditLog({
      projectId: 'system',
      action: 'updated',
      entity: 'settings',
      entityId: 'global',
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
      }),
      previousValue: JSON.stringify(previousSettings),
      newValue: JSON.stringify(settings),
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    const d = getErrorDetails(error, 'Failed to update settings');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
