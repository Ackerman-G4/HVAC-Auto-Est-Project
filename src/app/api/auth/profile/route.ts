import { NextRequest, NextResponse } from 'next/server';
import { lookupAccountByIdToken } from '@/lib/firebase/auth-rest';
import { getFirebaseAuth } from '@/lib/firebase/server';

export async function GET(req: NextRequest) {
	const auth = req.headers.get('authorization');
	if (!auth || !auth.startsWith('Bearer ')) {
		return NextResponse.json({ error: 'Missing or invalid token' }, { status: 401 });
	}
	const token = auth.split(' ')[1];
	try {
		const authClient = getFirebaseAuth();
		const decoded = await authClient.verifyIdToken(token);
		const userRecord = await authClient.getUser(decoded.uid);
		const role =
			typeof decoded.role === 'string'
				? decoded.role
				: typeof userRecord.customClaims?.role === 'string'
					? userRecord.customClaims.role
					: 'engineer';

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
					role: 'engineer',
				},
			});
		} catch {
			return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
		}
	}
}
