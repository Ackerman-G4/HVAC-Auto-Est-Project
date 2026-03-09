import { PrismaClient } from '../../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { getDatabaseUrlOrNull, MISSING_DB_URL_MESSAGE } from './database-url';

function createPrismaClient(): PrismaClient {
  const connectionString = getDatabaseUrlOrNull({ allowMissing: true });

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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
