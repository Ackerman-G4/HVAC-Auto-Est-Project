/**
 * Forgot Password API
 * POST /api/auth/forgot-password — send a password reset email (Firebase mode)
 *
 * Always returns a generic success response to prevent account enumeration.
 * Rate limited to 3 requests per hour per IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { isLocalAuthMode } from '@/lib/auth/local-auth';
import { sendPasswordResetEmail } from '@/lib/firebase/auth-rest';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import { forgotPasswordRequestSchema, getFirstZodErrorMessage } from '@/lib/validation/auth';
import { errorResponse, getErrorDetails, requireJsonRequest } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

const FORGOT_PASSWORD_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
} as const;

const GENERIC_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

export async function POST(req: NextRequest) {
  try {
    const jsonGuard = requireJsonRequest(req);
    if (jsonGuard) {
      return jsonGuard;
    }

    const rateLimit = evaluateRateLimit(req, 'auth-forgot-password', FORGOT_PASSWORD_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const payload = await req.json();
    const parsed = forgotPasswordRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: getFirstZodErrorMessage(parsed.error) }, { status: 400 });
    }

    const { email } = parsed.data;

    // In Firebase mode, dispatch the reset email. Swallow "account not found"
    // so the response never reveals whether the address is registered.
    if (!isLocalAuthMode()) {
      try {
        await sendPasswordResetEmail(email);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message !== 'Account not found') {
          logger.error('Password reset dispatch error', message);
        }
      }
    }

    try {
      await writeAuditLog({
        projectId: 'system',
        action: 'password_reset_requested',
        entity: 'auth',
        entityId: email.toLowerCase(),
      });
    } catch (error) {
      logger.error('Failed to write password reset audit log', error);
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    const d = getErrorDetails(error, 'Failed to process password reset');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
