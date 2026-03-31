import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

const uid = process.argv[2];
const role = process.argv[3] || 'admin';

if (!uid) {
  console.error('Usage: ts-node scripts/set-admin.ts <uid> [role]');
  process.exit(1);
}

async function setRole(uid: string, role: string) {
  try {
    const claims = role === 'admin' ? { admin: true, role: 'admin' } : { role };
    await admin.auth().setCustomUserClaims(uid, claims);
    console.log(`Successfully set ${role} claims for user ${uid}`);
    
    // Also update user metadata in database if needed
    await admin.database().ref(`users/${uid}/role`).set(role);
    console.log(`Updated user role in database`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error setting claims:', error);
    process.exit(1);
  }
}

setRole(uid, role);
