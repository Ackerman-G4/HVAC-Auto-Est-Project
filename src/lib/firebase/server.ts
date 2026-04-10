import {
  App,
  ServiceAccount,
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

type GlobalFirebaseCache = typeof globalThis & {
  __firebaseAdminApp?: App;
  __firebaseDb?: Firestore;
};

const globalCache = globalThis as GlobalFirebaseCache;

function readPrivateKeyFromEnv(): string | undefined {
  const direct = process.env.FIREBASE_PRIVATE_KEY;
  if (direct && direct.trim()) {
    return direct.replace(/\\n/g, '\n');
  }

  const base64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  if (base64 && base64.trim()) {
    try {
      return Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function parseServiceAccountFromJsonEnv(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    const projectId = parsed.projectId;
    const clientEmail = parsed.clientEmail;
    const privateKey = parsed.privateKey;

    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }

    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

function readServiceAccountFromDiscreteEnv(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = readPrivateKeyFromEnv();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function resolveServiceAccount(): ServiceAccount | null {
  return parseServiceAccountFromJsonEnv() || readServiceAccountFromDiscreteEnv();
}

function getDatabaseURL(): string | undefined {
  return process.env.FIREBASE_DATABASE_URL;
}

function initFirebaseAdminApp(): App {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  const serviceAccount = resolveServiceAccount();
  const databaseURL = getDatabaseURL();

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
      databaseURL,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseURL,
  });
}

export function getFirebaseAdminApp(): App {
  if (!globalCache.__firebaseAdminApp) {
    globalCache.__firebaseAdminApp = initFirebaseAdminApp();
  }
  return globalCache.__firebaseAdminApp;
}

export function getFirebaseDb(): Firestore {
  if (!globalCache.__firebaseDb) {
    globalCache.__firebaseDb = getFirestore(getFirebaseAdminApp());
  }
  return globalCache.__firebaseDb;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseAdminApp());
}
