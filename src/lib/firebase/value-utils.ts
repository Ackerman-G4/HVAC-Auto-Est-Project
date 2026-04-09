export function nowIso(): string {
  return new Date().toISOString();
}

export function toStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function toNumberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function toIntValue(value: unknown, fallback: number): number {
  return Math.trunc(toNumberValue(value, fallback));
}

export function toBooleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function toNullableNumberValue(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (value === undefined) return fallback;

  const parsed = toNumberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableStringValue(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  return typeof value === 'string' ? value : fallback;
}
