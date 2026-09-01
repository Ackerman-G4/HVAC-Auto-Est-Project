/**
 * Shared route-boundary plumbing.
 *
 * Every authenticated API route repeats the same three opening moves — rate
 * limit, authenticate, and wrap the body in a try/catch that maps an unexpected
 * throw to a 500 — and the same block is written out by hand in 41 route files.
 * Duplication at that scale is not a style problem: it is 41 independent
 * chances to omit the `Retry-After` header, leak an internal error message, or
 * let an exception escape as an unhandled rejection.
 *
 * Extracted during TASK 3.1 and used by the simulation run route. The remaining
 * handlers adopt it as they are decomposed (TASK 3.2) rather than in a sweep,
 * so each adoption is covered by that handler's own tests.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { errorResponse, getErrorDetails, rateLimitResponse } from '@/lib/utils/api-helpers';
import type { AuthUser } from '@/lib/auth/session';

export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
}

/**
 * Either the authenticated caller, or the response to return instead.
 *
 * A union rather than a throw-or-null: the caller cannot reach `user` without
 * first checking `ok`, so forgetting the rate-limit or auth branch is a
 * compile error rather than an authorisation hole.
 */
export type GuardResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

/**
 * Apply the rate limit, then authenticate.
 *
 * Order matters: rate limiting runs first so an unauthenticated flood is
 * rejected without the cost of a token verification round-trip.
 */
export async function guardRequest(
  request: NextRequest,
  rateLimitKey: string,
  policy: RateLimitPolicy,
): Promise<GuardResult> {
  const limit = evaluateRateLimit(request, rateLimitKey, policy);
  if (!limit.allowed) {
    return { ok: false, response: rateLimitResponse(limit.retryAfterSec) };
  }

  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return { ok: false, response: auth.response };
  }

  return { ok: true, user: auth.user };
}

/**
 * Wrap a handler so an unexpected throw becomes a 500 rather than escaping.
 *
 * `getErrorDetails` decides what is safe to surface; `fallbackMessage` is used
 * when the thrown value carries nothing usable. The error is logged with the
 * route label so a 500 can be traced without a stack in the response body.
 */
export function withRouteErrorHandling<Context>(
  routeLabel: string,
  fallbackMessage: string,
  handler: (request: NextRequest, context: Context) => Promise<NextResponse>,
): (request: NextRequest, context: Context) => Promise<NextResponse> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error(`${routeLabel} error:`, error);
      const details = getErrorDetails(error, fallbackMessage);
      return errorResponse(500, details.error, details.description, details.code);
    }
  };
}
