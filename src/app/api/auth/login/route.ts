import { NextRequest, NextResponse } from 'next/server';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { lookupAccountByIdToken, signInWithEmailPassword } from '@/lib/firebase/auth-rest';
import { createAuthResponse } from '@/lib/auth/session';
import { getFirebaseAuth } from '@/lib/firebase/server';
import { resolveLocalFallbackRole } from '@/lib/auth/fallback-role';
import { getFirstZodErrorMessage, loginRequestSchema } from '@/lib/validation/auth';

const LOGIN_RATE_LIMIT = {
	windowMs: 60_000,
	maxRequests: 10,
} as const;

function resolveRole(role: unknown): 'admin' | 'engineer' {
	return role === 'admin' ? 'admin' : 'engineer';
}

function resolveStatusFromError(message: string): number {
	if (message === 'Account not found') return 404;
	if (message === 'Email or password is invalid') return 401;
	if (message === 'Account is disabled') return 403;
	if (message === 'Password is too weak' || message === 'Sign-in method is disabled in Firebase Auth') return 400;
	if (message === 'Too many attempts. Please try again later') return 429;
	return 500;
}

export async function POST(req: NextRequest) {
	try {
		const rateLimit = evaluateRateLimit(req, 'auth-login', LOGIN_RATE_LIMIT);
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
		const parsed = loginRequestSchema.safeParse(payload);

		if (!parsed.success) {
			return NextResponse.json({ error: getFirstZodErrorMessage(parsed.error) }, { status: 400 });
		}

		const { email, password } = parsed.data;

		const authResponse = await signInWithEmailPassword(email, password);

		try {
			const auth = getFirebaseAuth();
			const decoded = await auth.verifyIdToken(authResponse.idToken);
			const userRecord = await auth.getUser(decoded.uid);
			const role = resolveRole(decoded.role ?? userRecord.customClaims?.role);

			return createAuthResponse({
				token: authResponse.idToken,
				refreshToken: authResponse.refreshToken,
				user: {
					id: decoded.uid,
					email: decoded.email || authResponse.email,
					name: userRecord.displayName || '',
					role,
				},
			});
		} catch {
			const account = await lookupAccountByIdToken(authResponse.idToken);
			const fallbackEmail = account.email || authResponse.email;
			return createAuthResponse({
				token: authResponse.idToken,
				refreshToken: authResponse.refreshToken,
				user: {
					id: account.id,
					email: fallbackEmail,
					name: account.name,
					role: resolveLocalFallbackRole(fallbackEmail),
				},
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Login failed';
		return NextResponse.json({ error: message }, { status: resolveStatusFromError(message) });
	}
}
