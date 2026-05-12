import { NextRequest, NextResponse } from 'next/server';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { createAuthResponse } from '@/lib/auth/session';
import { getFirebaseAuth } from '@/lib/firebase/server';
import { lookupAccountByIdToken } from '@/lib/firebase/auth-rest';
import { resolveLocalFallbackRole } from '@/lib/auth/fallback-role';
import { isLocalAuthMode, localRefreshToken } from '@/lib/auth/local-auth';
import { requireJsonRequest } from '@/lib/utils/api-helpers';

const REFRESH_RATE_LIMIT = {
	windowMs: 10 * 60_000,
	maxRequests: 6,
} as const;

interface SecureTokenResponse {
	id_token: string;
	refresh_token: string;
	expires_in: string;
	token_type: string;
	user_id: string;
	project_id: string;
}

interface SecureTokenError {
	error?: { message?: string };
}

function resolveRole(role: unknown): 'admin' | 'engineer' {
	return role === 'admin' ? 'admin' : 'engineer';
}

export async function POST(req: NextRequest) {
	try {
		const jsonGuard = requireJsonRequest(req);
		if (jsonGuard) {
			return jsonGuard;
		}

		const rateLimit = evaluateRateLimit(req, 'auth-refresh', REFRESH_RATE_LIMIT);
		if (!rateLimit.allowed) {
			return NextResponse.json(
				{ error: 'Too many attempts. Please try again later' },
				{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
			);
		}

		const body = await req.json();
		const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';

		if (!refreshToken) {
			return NextResponse.json({ error: 'Missing refresh token' }, { status: 400 });
		}

		// Use local auth when Firebase is not configured
		if (isLocalAuthMode()) {
			const result = localRefreshToken(refreshToken);
			return createAuthResponse({
				token: result.token,
				refreshToken: result.refreshToken,
				user: result.user,
			});
		}

		const apiKey = process.env.FIREBASE_WEB_API_KEY;
		if (!apiKey) {
			return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
		}

		const tokenRes = await fetch(
			`https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					grant_type: 'refresh_token',
					refresh_token: refreshToken,
				}),
			},
		);

		if (!tokenRes.ok) {
			const errData = (await tokenRes.json().catch(() => ({}))) as SecureTokenError;
			const msg = errData.error?.message || 'Token refresh failed';
			return NextResponse.json({ error: msg }, { status: 401 });
		}

		const tokenData = (await tokenRes.json()) as SecureTokenResponse;
		const newIdToken = tokenData.id_token;
		const newRefreshToken = tokenData.refresh_token;

		try {
			const auth = getFirebaseAuth();
			const decoded = await auth.verifyIdToken(newIdToken);
			const userRecord = await auth.getUser(decoded.uid);
			const role = resolveRole(decoded.role ?? userRecord.customClaims?.role);

			return createAuthResponse({
				token: newIdToken,
				refreshToken: newRefreshToken,
				user: {
					id: decoded.uid,
					email: userRecord.email || decoded.email || '',
					name: userRecord.displayName || '',
					role,
				},
			});
		} catch {
			const account = await lookupAccountByIdToken(newIdToken);
			return createAuthResponse({
				token: newIdToken,
				refreshToken: newRefreshToken,
				user: {
					id: account.id,
					email: account.email,
					name: account.name,
					role: resolveLocalFallbackRole(account.email),
				},
			});
		}
	} catch {
		return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
	}
}
