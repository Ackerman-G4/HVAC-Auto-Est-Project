import {
  App,
  ServiceAccount,
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { generateKeyPairSync } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { isLocalFirestoreMode, getLocalFirestore } from '@/lib/firebase/local-firestore';

type GlobalFirebaseCache = typeof globalThis & {
  __firebaseAdminApp?: App;
  __firebaseDb?: Firestore;
};

const globalCache = globalThis as GlobalFirebaseCache;
let emulatorPrivateKey: string | null = null;

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

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
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const projectId =
      readNonEmptyString(parsed.projectId) ||
      readNonEmptyString(parsed.project_id);
    const clientEmail =
      readNonEmptyString(parsed.clientEmail) ||
      readNonEmptyString(parsed.client_email);
    const privateKey =
      readNonEmptyString(parsed.privateKey) ||
      readNonEmptyString(parsed.private_key);

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

function resolveProjectId(): string | undefined {
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
}

function getOrCreateEmulatorPrivateKey(): string {
  if (emulatorPrivateKey) {
    return emulatorPrivateKey;
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  });

  emulatorPrivateKey = privateKey;
  return emulatorPrivateKey;
}

function createEmulatorServiceAccount(projectId: string): ServiceAccount {
  return {
    projectId,
    clientEmail: `local-emulator@${projectId}.iam.gserviceaccount.com`,
    privateKey: getOrCreateEmulatorPrivateKey(),
  };
}

function shouldBypassApplicationDefaultInEmulatorMode(): boolean {
  const emulatorHost = readNonEmptyString(process.env.FIRESTORE_EMULATOR_HOST);
  if (!emulatorHost) {
    return false;
  }

  const hasServiceAccount = resolveServiceAccount() !== null;
  const hasGoogleApplicationCredentials = readNonEmptyString(process.env.GOOGLE_APPLICATION_CREDENTIALS) !== null;

  return !hasServiceAccount && !hasGoogleApplicationCredentials;
}

function initFirebaseAdminApp(): App {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  const serviceAccount = resolveServiceAccount();
  const databaseURL = getDatabaseURL();
  const projectId = resolveProjectId();

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
      databaseURL,
    });
  }

  if (shouldBypassApplicationDefaultInEmulatorMode()) {
    const emulatorProjectId = projectId || 'demo-hvac-auto';
    const emulatorServiceAccount = createEmulatorServiceAccount(emulatorProjectId);

    return initializeApp({
      credential: cert(emulatorServiceAccount),
      projectId: emulatorProjectId,
      databaseURL,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
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
  if (isLocalFirestoreMode()) {
    return getLocalFirestore() as unknown as Firestore;
  }
  if (!globalCache.__firebaseDb) {
    globalCache.__firebaseDb = getFirestore(getFirebaseAdminApp());
  }
  return globalCache.__firebaseDb;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseAdminApp());
}
