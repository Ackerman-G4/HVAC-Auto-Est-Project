import { AuthUserRole } from '@/lib/auth/session';

function normalizeEmail(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.trim().toLowerCase();
}

function getConfiguredFallbackAdminEmails(): string[] {
  const candidates = [
    process.env.RBAC_ADMIN_EMAIL,
    process.env.AUTH_SMOKE_ADMIN_EMAIL,
  ];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);
    if (!email || seen.has(email)) {
      continue;
    }

    seen.add(email);
    normalized.push(email);
  }

  return normalized;
}

export function resolveLocalFallbackRole(email: string | null | undefined): AuthUserRole {
  if (process.env.ALLOW_ADMIN_SELF_ASSIGNMENT !== 'true') {
    return 'engineer';
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return 'engineer';
  }

  return getConfiguredFallbackAdminEmails().includes(normalizedEmail) ? 'admin' : 'engineer';
}
