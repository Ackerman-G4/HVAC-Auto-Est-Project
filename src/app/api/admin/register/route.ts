import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/firebase-admin';
import { getAuthToken, isAdmin, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

/**
 * Admin-only route to create a new user account.
 * Uses email and birthday (as password).
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is an admin
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in.');
    }

    if (!isAdmin(token)) {
      return errorResponse(403, 'Forbidden', 'Only administrators can create accounts.');
    }

    // 2. Parse request body
    const body = await request.json();
    const { email, birthday, fullName, role = 'engineer' } = body;

    if (!email || !birthday || !fullName) {
      return errorResponse(400, 'Missing fields', 'Email, birthday, and full name are required.');
    }

    // Birthday format expected: YYYY-MM-DD
    // We'll use this as the initial password
    const password = birthday.replace(/-/g, ''); // e.g. 19900101

    if (password.length < 6) {
      return errorResponse(400, 'Invalid Birthday', 'Birthday format must result in at least 6 characters.');
    }

    // 3. Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
    });

    const uid = userRecord.uid;

    // 4. Set custom claims (roles)
    const claims = role === 'admin' ? { admin: true, role: 'admin' } : { role };
    await adminAuth.setCustomUserClaims(uid, claims);

    // 5. Initialize user data in RTDB
    const userData = {
      email,
      fullName,
      role,
      birthday,
      createdAt: new Date().toISOString(),
      registeredBy: token.uid,
    };

    await adminDb.ref(`users/${uid}`).set(userData);
    
    // Also save to a "recognized_emails" list for quick lookup if needed
    const emailKey = email.replace(/[.#$[\]]/g, '_');
    await adminDb.ref(`recognizedEmails/${emailKey}`).set({
      uid,
      role,
    });

    return NextResponse.json({ 
      success: true, 
      user: { 
        uid, 
        email, 
        fullName, 
        role 
      } 
    }, { status: 201 });

  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.code === 'auth/email-already-exists') {
      return errorResponse(400, 'Email Exists', 'This email is already registered.');
    }
    const d = getErrorDetails(error, 'Failed to create user');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
