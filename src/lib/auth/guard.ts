import { NextRequest, NextResponse } from 'next/server';
import { lookupAccountByIdToken } from '@/lib/firebase/auth-rest';
import { getFirebaseAuth } from '@/lib/firebase/server';
import { AuthUser, AuthUserRole, getTokenFromRequest } from '@/lib/auth/session';
import { resolveLocalFallbackRole } from '@/lib/auth/fallback-role';
import { isLocalAuthMode, localVerifyToken } from '@/lib/auth/local-auth';

interface RequireAuthOptions {
  allowedRoles?: AuthUserRole[];
}

interface RequireAuthSuccess {
  authorized: true;
  user: AuthUser;
}

interface RequireAuthFailure {
  authorized: false;
  response: NextResponse;
}

export type RequireAuthResult = RequireAuthSuccess | RequireAuthFailure;

function resolveRole(role: unknown): AuthUserRole {
  return role === 'admin' ? 'admin' : 'engineer';
}

function unauthorizedResponse(message = 'Missing or invalid token') {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbiddenResponse(message = 'Insufficient permissions') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireAuth(
  request: NextRequest,
  options: RequireAuthOptions = {},
): Promise<RequireAuthResult> {
  const token = getTokenFromRequest(request);

  if (!token) {
    return { authorized: false, response: unauthorizedResponse() };
  }

  let user: AuthUser | null = null;

  // Use local auth when Firebase is not configured
  if (isLocalAuthMode()) {
    try {
      const localUser = localVerifyToken(token);
      user = localUser;
    } catch {
      return { authorized: false, response: unauthorizedResponse('Invalid token') };
    }
  } else {
    try {
      const auth = getFirebaseAuth();
      const decoded = await auth.verifyIdToken(token);
      const userRecord = await auth.getUser(decoded.uid);

      user = {
        id: decoded.uid,
        email: userRecord.email || decoded.email || '',
        name: userRecord.displayName || '',
        role: resolveRole(decoded.role ?? userRecord.customClaims?.role),
      };
    } catch {
      try {
        const account = await lookupAccountByIdToken(token);
        user = {
          id: account.id,
          email: account.email,
          name: account.name,
          role: resolveLocalFallbackRole(account.email),
        };
      } catch {
        return { authorized: false, response: unauthorizedResponse('Invalid token') };
      }
    }
  }

  if (!user || !user.id) {
    return { authorized: false, response: unauthorizedResponse('Invalid token') };
  }

  if (options.allowedRoles && options.allowedRoles.length > 0) {
    if (!options.allowedRoles.includes(user.role)) {
      return { authorized: false, response: forbiddenResponse() };
    }
  }

  return { authorized: true, user };
}
