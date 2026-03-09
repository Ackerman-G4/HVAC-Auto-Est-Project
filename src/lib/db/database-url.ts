const PLACEHOLDER_MARKERS = ['YOUR_PASSWORD', 'YOUR_HOST'];

export const MISSING_DB_URL_MESSAGE =
  'Missing Neon database connection string. Set DATABASE_URL (or NETLIFY_DATABASE_URL on Netlify) to your Neon URL.';

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_MARKERS.some((marker) => value.includes(marker));
}

export function getDatabaseUrl(): string {
  return getDatabaseUrlOrNull({ allowMissing: false }) as string;
}

export function getDatabaseUrlOrNull(options?: { allowMissing?: boolean }): string | null {
  const allowMissing = options?.allowMissing ?? true;
  const connectionString =
    process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.DIRECT_URL;

  if (!connectionString || isPlaceholder(connectionString)) {
    if (allowMissing) {
      return null;
    }

    throw new Error(MISSING_DB_URL_MESSAGE);
  }

  return connectionString;
}
