import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'hvac-auto-67f97';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || 'https://hvac-auto-67f97-default-rtdb.asia-southeast1.firebasedatabase.app',
    });
  } else {
    console.warn('Firebase Admin SDK: Missing FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY. Initializing with just projectId for token verification. Database access will fail without proper credentials.');
    try {
      admin.initializeApp({
        projectId,
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || 'https://hvac-auto-67f97-default-rtdb.asia-southeast1.firebasedatabase.app',
      });
    } catch (e) {
      console.error('Failed to initialize Firebase Admin fallback:', e);
    }
  }
}

const adminDb = admin.apps.length ? admin.database() : null as unknown as admin.database.Database;
const adminAuth = admin.apps.length ? admin.auth() : null as unknown as admin.auth.Auth;

if (!adminDb || !adminAuth) {
  console.error('CRITICAL: Firebase Admin SDK failed to initialize. API routes requiring database access will fail.');
}

export { adminDb, adminAuth };

