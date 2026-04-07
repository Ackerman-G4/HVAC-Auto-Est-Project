import { NextRequest, NextResponse } from 'next/server';
import { lookupAccountByIdToken, signInWithEmailPassword } from '@/lib/firebase/auth-rest';
import { getFirebaseAuth } from '@/lib/firebase/server';

function resolveStatusFromError(message: string): number {
	if (message === 'Account not found') return 404;
	if (message === 'Email or password is invalid') return 401;
	if (message === 'Account is disabled') return 403;
	if (message === 'Password is too weak') return 400;
	return 500;
}

export async function POST(req: NextRequest) {
	try {
		const { email, password } = await req.json();
		if (!email || !password) {
			return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
		}

		const authResponse = await signInWithEmailPassword(email, password);

		try {
			const auth = getFirebaseAuth();
			const decoded = await auth.verifyIdToken(authResponse.idToken);
			const userRecord = await auth.getUser(decoded.uid);
			const role =
				typeof decoded.role === 'string'
					? decoded.role
					: typeof userRecord.customClaims?.role === 'string'
						? userRecord.customClaims.role
						: 'engineer';

			return NextResponse.json({
				token: authResponse.idToken,
				user: {
					id: decoded.uid,
					email: decoded.email || authResponse.email,
					name: userRecord.displayName || '',
					role,
				},
			});
		} catch {
			const account = await lookupAccountByIdToken(authResponse.idToken);
			return NextResponse.json({
				token: authResponse.idToken,
				user: {
					id: account.id,
					email: account.email || authResponse.email,
					name: account.name,
					role: 'engineer',
				},
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Login failed';
		return NextResponse.json({ error: message }, { status: resolveStatusFromError(message) });
	}
}
