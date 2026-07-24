import { NextRequest, NextResponse } from 'next/server';
import { createAuthResponse } from '@/lib/auth/session';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { isLocalAuthMode } from '@/lib/auth/local-auth';
import {
  lookupAccountByIdToken,
  signInWithGoogleCredential,
} from '@/lib/firebase/auth-rest';
import { getFirebaseAuth } from '@/lib/firebase/server';
import {
  getFirstZodErrorMessage,
  googleLoginRequestSchema,
} from '@/lib/validation/auth';
import { requireJsonRequest } from '@/lib/utils/api-helpers';

const GOOGLE_LOGIN_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

function resolveRole(role: unknown): 'admin' | 'engineer' {
  return role === 'admin' ? 'admin' : 'engineer';
}

function resolveStatusFromError(message: string): number {
  if (message === 'Google credential is invalid') return 401;
  if (message === 'Google account is already linked to another profile') return 409;
  if (message === 'Account is disabled') return 403;
  if (message === 'Sign-in method is disabled in Firebase Auth') return 400;
  if (message === 'Too many attempts. Please try again later') return 429;
  return 500;
}

export async function POST(req: NextRequest) {
  try {
    const jsonGuard = requireJsonRequest(req);
    if (jsonGuard) {
      return jsonGuard;
    }

    const rateLimit = evaluateRateLimit(req, 'auth-google-login', GOOGLE_LOGIN_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSec) },
        },
      );
    }

    const payload = await req.json();
    const parsed = googleLoginRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: getFirstZodErrorMessage(parsed.error) }, { status: 400 });
    }

    if (isLocalAuthMode()) {
      return NextResponse.json(
        { error: 'Google login is not available in local development mode' },
        { status: 501 },
      );
    }

    const requestUri = req.nextUrl.origin || 'http://localhost';
    const authResponse = await signInWithGoogleCredential(parsed.data.credential, requestUri);

    try {
      const auth = getFirebaseAuth();
      const decoded = await auth.verifyIdToken(authResponse.idToken);
      const userRecord = await auth.getUser(decoded.uid);
      const role = resolveRole(decoded.role ?? userRecord.customClaims?.role);

      if (!userRecord.customClaims?.role) {
        await auth.setCustomUserClaims(decoded.uid, { role });
      }

      if (!userRecord.displayName && authResponse.displayName) {
        await auth.updateUser(decoded.uid, { displayName: authResponse.displayName });
      }

      return createAuthResponse({
        token: authResponse.idToken,
        refreshToken: authResponse.refreshToken,
        user: {
          id: decoded.uid,
          email: decoded.email || authResponse.email,
          name: userRecord.displayName || authResponse.displayName || '',
          role,
        },
      });
    } catch {
      const account = await lookupAccountByIdToken(authResponse.idToken);

      return createAuthResponse({
        token: authResponse.idToken,
        refreshToken: authResponse.refreshToken,
        user: {
          id: account.id,
          email: account.email || authResponse.email,
          name: account.name,
          role: 'engineer',
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google login failed';
    return NextResponse.json({ error: message }, { status: resolveStatusFromError(message) });
  }
}
