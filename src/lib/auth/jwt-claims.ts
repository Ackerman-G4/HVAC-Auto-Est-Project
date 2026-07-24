// NOT signature verification — decodes JWT claims for UX-level routing only; real enforcement is requireAuth in API routes.

function decodeBase64UrlSegment(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const segments = token.split('.');
    if (segments.length !== 3) {
      return null;
    }

    const payload: unknown = JSON.parse(decodeBase64UrlSegment(segments[1]));
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return null;
    }

    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getRoleFromToken(token: string): string | null {
  const role = decodeJwtPayloadUnsafe(token)?.role;
  return typeof role === 'string' ? role : null;
}
