import { PrismaClient } from '../../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl, MISSING_DB_URL_MESSAGE } from './database-url';

let cachedClient: PrismaClient | undefined;

function useLocalPgAdapter(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function initClient(): PrismaClient {
  const connectionString = getDatabaseUrl();
  const adapter = useLocalPgAdapter(connectionString)
    ? new PrismaPg({ connectionString })
    : new PrismaNeon({ connectionString });
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

// Backward-compatible default export for existing route handlers.
const compatProxy: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getNeon() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];

    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export default compatProxy;
