import { NextRequest, NextResponse } from 'next/server';
import { createLogoutResponse } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';

const LOGOUT_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

export async function POST(request: NextRequest) {
  const rateLimit = evaluateRateLimit(request, 'auth-logout', LOGOUT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    );
  }

  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  return createLogoutResponse();
}
