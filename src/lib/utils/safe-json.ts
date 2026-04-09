export function safeJsonParse<T>(rawValue: string | null | undefined): T | null {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}