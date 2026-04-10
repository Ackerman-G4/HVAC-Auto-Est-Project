import { NextRequest, NextResponse } from 'next/server';
import { createAuthResponse } from '@/lib/auth/session';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { signUpWithEmailPassword } from '@/lib/firebase/auth-rest';
import { getFirebaseAuth } from '@/lib/firebase/server';
import { getFirstZodErrorMessage, registerRequestSchema } from '@/lib/validation/auth';

const REGISTER_RATE_LIMIT = {
	windowMs: 60_000,
	maxRequests: 6,
} as const;

const ALLOW_ADMIN_SELF_ASSIGNMENT = process.env.ALLOW_ADMIN_SELF_ASSIGNMENT === 'true';

function resolveRole(role: unknown): 'admin' | 'engineer' {
	return role === 'admin' ? 'admin' : 'engineer';
}

function isMissingAdminCredentialError(message: string): boolean {
	return (
		message.includes('Could not load the default credentials') ||
		message.includes('credential implementation provided to initializeApp()')
	);
}

function resolveStatusFromError(message: string): number {
	if (message === 'Email already exists') return 409;
	if (message === 'Password is too weak') return 400;
	if (message === 'Sign-in method is disabled in Firebase Auth') return 400;
	return 500;
}

export async function POST(req: NextRequest) {
	try {
		const rateLimit = evaluateRateLimit(req, 'auth-register', REGISTER_RATE_LIMIT);
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
		const parsed = registerRequestSchema.safeParse(payload);

		if (!parsed.success) {
			return NextResponse.json({ error: getFirstZodErrorMessage(parsed.error) }, { status: 400 });
		}

		const { email, password, name, role } = parsed.data;
		const requestedRole = resolveRole(role);

		if (requestedRole === 'admin' && !ALLOW_ADMIN_SELF_ASSIGNMENT) {
			return NextResponse.json(
				{ error: 'Admin role requires manual provisioning' },
				{ status: 403 },
			);
		}

		const authResponse = await signUpWithEmailPassword(email, password);
		const safeRole = requestedRole;
		const safeName = typeof name === 'string' ? name.trim() : '';

		try {
			const auth = getFirebaseAuth();
			if (safeName) {
				await auth.updateUser(authResponse.localId, { displayName: safeName });
			}
			await auth.setCustomUserClaims(authResponse.localId, { role: safeRole });
		} catch (error) {
			const message = error instanceof Error ? error.message : '';
			if (!isMissingAdminCredentialError(message)) {
				throw error;
			}
		}

		return createAuthResponse({
			token: authResponse.idToken,
			refreshToken: authResponse.refreshToken,
			user: {
				id: authResponse.localId,
				email: authResponse.email,
				name: safeName,
				role: safeRole,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Registration failed';
		return NextResponse.json({ error: message }, { status: resolveStatusFromError(message) });
	}
}
