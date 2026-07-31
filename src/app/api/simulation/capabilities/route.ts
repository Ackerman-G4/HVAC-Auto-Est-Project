/**
 * Simulation Capabilities API — GET /api/simulation/capabilities
 *
 * Reports which solver tiers this deployment can actually run, so the UI can
 * gate its controls up front instead of letting a user click "Run Engineering"
 * and collecting a 503 from POST .../runs.
 *
 * The Engineering tier is unprovisioned by default (see .env.example) — the app
 * is fully usable on the Preview tier without it. That is a deployment state,
 * not an error, so this route always returns 200 and describes the state.
 *
 * The missing-variable names are already documented in .env.example and carry no
 * secret material, but they are only useful to someone configuring the
 * deployment, so they are returned to admins only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  isOpenFOAMCloudConfigured,
  missingOpenFOAMCloudConfig,
} from '@/lib/engine/simulation/cfd-cloud';
import { internalServerError } from '@/lib/utils/api-helpers';

const CAPABILITIES_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'simulation-capabilities', CAPABILITIES_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const provisioned = isOpenFOAMCloudConfigured();

    return NextResponse.json({
      capabilities: {
        // Preview runs in-browser and needs no provisioning, so it is always on.
        preview: { available: true },
        engineering: {
          available: provisioned,
          reason: provisioned
            ? null
            : 'This deployment has no OpenFOAM cloud solver configured. Preview-tier runs are unaffected.',
          ...(auth.user.role === 'admin' && !provisioned
            ? { missingConfig: missingOpenFOAMCloudConfig() }
            : {}),
        },
      },
    });
  } catch (error) {
    console.error('GET /api/simulation/capabilities error:', error);
    return internalServerError('Failed to read simulation capabilities');
  }
}
