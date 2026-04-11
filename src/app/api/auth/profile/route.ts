import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest } from '@/lib/auth/session';
import { resolveLocalFallbackRole } from '@/lib/auth/fallback-role';
import { lookupAccountByIdToken } from '@/lib/firebase/auth-rest';
import { getFirebaseAuth } from '@/lib/firebase/server';
import { isLocalAuthMode, localVerifyToken } from '@/lib/auth/local-auth';

function resolveRole(role: unknown): 'admin' | 'engineer' {
	return role === 'admin' ? 'admin' : 'engineer';
}

export async function GET(req: NextRequest) {
	const token = getTokenFromRequest(req);

	if (!token) {
		return NextResponse.json({ error: 'Missing or invalid token' }, { status: 401 });
	}

	// Use local auth when Firebase is not configured
	if (isLocalAuthMode()) {
		try {
			const user = localVerifyToken(token);
			return NextResponse.json({ user });
		} catch {
			return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
		}
	}

	try {
		const authClient = getFirebaseAuth();
		const decoded = await authClient.verifyIdToken(token);
		const userRecord = await authClient.getUser(decoded.uid);
		const role = resolveRole(decoded.role ?? userRecord.customClaims?.role);

		return NextResponse.json({
			user: {
				id: decoded.uid,
				email: userRecord.email || decoded.email || '',
				name: userRecord.displayName || '',
				role,
			},
		});
	} catch {
		try {
			const account = await lookupAccountByIdToken(token);
			return NextResponse.json({
				user: {
					id: account.id,
					email: account.email,
					name: account.name,
					role: resolveLocalFallbackRole(account.email),
				},
			});
		} catch {
			return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
		}
	}
}
