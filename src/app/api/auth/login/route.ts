import { NextRequest, NextResponse } from 'next/server';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { lookupAccountByIdToken, signInWithEmailPassword } from '@/lib/firebase/auth-rest';
import { createAuthResponse } from '@/lib/auth/session';
import { getFirebaseAuth } from '@/lib/firebase/server';
import { resolveLocalFallbackRole } from '@/lib/auth/fallback-role';
import { getFirstZodErrorMessage, loginRequestSchema } from '@/lib/validation/auth';
import { isLocalAuthMode, localSignIn } from '@/lib/auth/local-auth';
import { errorResponse, requireJsonRequest } from '@/lib/utils/api-helpers';
import {
	clearFailedLogins,
	isLockedOut,
	recordFailedLogin,
	writeLoginEvent,
} from '@/lib/firebase/security-store';

const LOGIN_RATE_LIMIT = {
	windowMs: 60_000,
	maxRequests: 10,
} as const;

const GENERIC_CREDENTIAL_ERROR = 'Email or password is invalid';

function resolveRole(role: unknown): 'admin' | 'engineer' {
	return role === 'admin' ? 'admin' : 'engineer';
}

function resolveStatusFromError(message: string): number {
	if (message === 'Account not found') return 401;
	if (message === GENERIC_CREDENTIAL_ERROR) return 401;
	if (message === 'Account is disabled') return 403;
	if (message === 'Password is too weak' || message === 'Sign-in method is disabled in Firebase Auth') return 400;
	if (message === 'Too many attempts. Please try again later') return 429;
	return 500;
}

function resolveClientAddress(req: NextRequest): string {
	const forwarded = req.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0]?.trim() || '127.0.0.1';
	}

	const realIp = req.headers.get('x-real-ip');
	if (realIp?.trim()) {
		return realIp.trim();
	}

	return '127.0.0.1';
}

function isLockoutEnforcementEnabled(): boolean {
	return process.env.AUTH_RATE_LIMIT_DISABLED !== 'true';
}

async function writeLoginEventSafely(input: {
	email: string;
	uid?: string;
	ip: string;
	userAgent: string;
	success: boolean;
	reason?: string;
}): Promise<void> {
	try {
		await writeLoginEvent(input);
	} catch (error) {
		console.error('Failed to write login event', error);
	}
}

async function recordLoginSuccessSafely(input: {
	email: string;
	uid: string;
	ip: string;
	userAgent: string;
}): Promise<void> {
	if (isLockoutEnforcementEnabled()) {
		try {
			await clearFailedLogins(input.email);
		} catch (error) {
			console.error('Failed to clear login lockout state', error);
		}
	}

	await writeLoginEventSafely({ ...input, success: true });
}

async function recordLoginFailureSafely(input: {
	email: string;
	ip: string;
	userAgent: string;
	reason: string;
	countTowardLockout: boolean;
}): Promise<void> {
	if (input.countTowardLockout && isLockoutEnforcementEnabled()) {
		try {
			await recordFailedLogin(input.email);
		} catch (error) {
			console.error('Failed to record failed login attempt', error);
		}
	}

	await writeLoginEventSafely({
		email: input.email,
		ip: input.ip,
		userAgent: input.userAgent,
		success: false,
		reason: input.reason,
	});
}

export async function POST(req: NextRequest) {
	try {
		const jsonGuard = requireJsonRequest(req);
		if (jsonGuard) {
			return jsonGuard;
		}

		// Skip rate limiting in local auth mode (no Firebase key) — smoke/test
		// scripts run many logins in sequence and would exhaust the window.
		if (!isLocalAuthMode()) {
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
		}

		const payload = await req.json();
		const parsed = loginRequestSchema.safeParse(payload);

		if (!parsed.success) {
			return NextResponse.json({ error: getFirstZodErrorMessage(parsed.error) }, { status: 400 });
		}

		const { email, password } = parsed.data;
		const ip = resolveClientAddress(req);
		const userAgent = req.headers.get('user-agent') || '';

		if (isLockoutEnforcementEnabled()) {
			let lockout = { locked: false, retryAfterSec: 0 };
			try {
				lockout = await isLockedOut(email);
			} catch (error) {
				console.error('Failed to check login lockout state', error);
			}

			if (lockout.locked) {
				await writeLoginEventSafely({ email, ip, userAgent, success: false, reason: 'locked' });
				const minutesRemaining = Math.max(1, Math.ceil(lockout.retryAfterSec / 60));
				return errorResponse(
					423,
					'Account temporarily locked',
					`Too many failed login attempts. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.`,
					'ACCOUNT_LOCKED',
				);
			}
		}

		try {
			// Use local auth when Firebase is not configured
			if (isLocalAuthMode()) {
				const result = await localSignIn(email, password);
				await recordLoginSuccessSafely({ email, uid: result.user.id, ip, userAgent });
				return createAuthResponse({
					token: result.token,
					refreshToken: result.refreshToken,
					user: result.user,
				});
			}

			const authResponse = await signInWithEmailPassword(email, password);

			try {
				const auth = getFirebaseAuth();
				const decoded = await auth.verifyIdToken(authResponse.idToken);
				const userRecord = await auth.getUser(decoded.uid);
				const role = resolveRole(decoded.role ?? userRecord.customClaims?.role);

				await recordLoginSuccessSafely({ email, uid: decoded.uid, ip, userAgent });
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
				await recordLoginSuccessSafely({ email, uid: account.id, ip, userAgent });
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
			const status = resolveStatusFromError(message);
			await recordLoginFailureSafely({
				email,
				ip,
				userAgent,
				reason: message,
				countTowardLockout: status === 401,
			});
			return NextResponse.json(
				{ error: status === 401 ? GENERIC_CREDENTIAL_ERROR : message },
				{ status },
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Login failed';
		const status = resolveStatusFromError(message);
		return NextResponse.json(
			{ error: status === 401 ? GENERIC_CREDENTIAL_ERROR : message },
			{ status },
		);
	}
}
