const PLACEHOLDER_MARKERS = ['YOUR_PASSWORD', 'YOUR_HOST'];

export const MISSING_DB_URL_MESSAGE =
  'Missing Neon database connection string. Set NEON_DATABASE_URL (or NETLIFY_NEON_DATABASE_URL on Netlify) to your Neon URL.';

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_MARKERS.some((marker) => value.includes(marker));
}

export function getDatabaseUrl(): string {
  const connectionString =
    process.env.NEON_DATABASE_URL || process.env.NETLIFY_NEON_DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString || isPlaceholder(connectionString)) {
    throw new Error(MISSING_DB_URL_MESSAGE);
  }
  return connectionString;
}
