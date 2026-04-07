import { NextRequest, NextResponse } from 'next/server';
import { signUpWithEmailPassword } from '@/lib/firebase/auth-rest';
import { getFirebaseAuth } from '@/lib/firebase/server';

function isMissingAdminCredentialError(message: string): boolean {
	return (
		message.includes('Could not load the default credentials') ||
		message.includes('credential implementation provided to initializeApp()')
	);
}

function resolveStatusFromError(message: string): number {
	if (message === 'Email already exists') return 409;
	if (message === 'Password is too weak') return 400;
	if (message === 'Email/password sign-in is disabled in Firebase Auth') return 400;
	return 500;
}

export async function POST(req: NextRequest) {
	try {
		const { email, password, name, role } = await req.json();
		if (!email || !password) {
			return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
		}

		const authResponse = await signUpWithEmailPassword(email, password);
		const safeRole = typeof role === 'string' && role.trim() ? role : 'engineer';
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

		return NextResponse.json({
			token: authResponse.idToken,
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
