import { PrismaClient } from '../../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { getDatabaseUrl, MISSING_DB_URL_MESSAGE } from './database-url';

function createNeonClient(): PrismaClient {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    const runtimeError = new Error(MISSING_DB_URL_MESSAGE);
    return new Proxy({} as PrismaClient, {
      get() {
        throw runtimeError;
      },
    });
  }

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForNeon = globalThis as unknown as {
  neon: PrismaClient | undefined;
};

export const neon = globalForNeon.neon ?? createNeonClient();

if (process.env.NODE_ENV !== 'production') {
  globalForNeon.neon = neon;
}

export default neon;
