import { PrismaClient } from '../../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { getDatabaseUrl, MISSING_DB_URL_MESSAGE } from './database-url';

let cachedClient: PrismaClient | undefined;

function initClient(): PrismaClient {
  const connectionString = getDatabaseUrl();
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export function getNeon(): PrismaClient {
  if (cachedClient) return cachedClient;
  try {
    const client = initClient();
    // Cache in dev to avoid multiple instances across HMR
    if (process.env.NODE_ENV !== 'production') {
      cachedClient = client;
    }
    return client;
  } catch (err) {
    // Provide a clearer error if env is missing when accessed at runtime
    const message = err instanceof Error ? err.message : String(err);
    const runtimeError = new Error(message || MISSING_DB_URL_MESSAGE);
    throw runtimeError;
  }
}

// Backward-compatible default export that throws only when actually used
const throwingProxy: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, _prop) {
    // Encourage importing { getNeon } and delay initialization to request time
    throw new Error(
      `${MISSING_DB_URL_MESSAGE} (Tip: import { getNeon } from '@/lib/db/prisma' and call it inside your handler.)`
    );
  },
});

export default throwingProxy;
