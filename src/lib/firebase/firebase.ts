import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import type { Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]?.trim());

/** Firebase client app — null when env vars are missing (local dev mode). */
export const app: FirebaseApp | null =
  missingEnvVars.length > 0
    ? null
    : getApps().length > 0
      ? getApp()
      : initializeApp(firebaseConfig);

/** True when Firebase client SDK is NOT available (local dev mode). */
export function isFirebaseClientMissing(): boolean {
  return app === null;
}

let cachedAnalytics: Analytics | null = null;

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!app) return null;

  if (cachedAnalytics) {
    return cachedAnalytics;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const analyticsModule = await import('firebase/analytics');
  const supported = await analyticsModule.isSupported().catch(() => false);
  if (!supported) {
    return null;
  }

  cachedAnalytics = analyticsModule.getAnalytics(app);
  return cachedAnalytics;
}
