import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
  } else {
    // During build time or if env vars are missing, we might not have these.
    // We can initialize with dummy data or just avoid initializing if it's strictly for build.
    // However, some routes might fail if they try to use adminAuth/adminDb.
    console.warn('Firebase Admin SDK not initialized: Missing environment variables.');
  }
}

const adminDb = admin.apps.length ? admin.database() : null as unknown as admin.database.Database;
const adminAuth = admin.apps.length ? admin.auth() : null as unknown as admin.auth.Auth;

export { adminDb, adminAuth };
