import { describe, expect, it } from 'vitest';
import { parseJsonBody, type ValidationErrorBody } from '../http';
import { adminUserMutationSchema } from '../admin';

/**
 * Admin account mutations: disable, enable, and role change.
 *
 * This is the highest-privilege client write in the product — it can strip an
 * account of access or grant it admin. It was guarded by a hand-rolled parser
 * that collapsed every rejection to `null`, so a caller was told only "invalid
 * mutation" with no indication of which field was wrong, and an unknown key was
 * silently discarded.
 *
 * The schema parses to the domain shape, so these tests also pin the `action`
 * (wire) to `type` (domain) rename in one place.
 */

function jsonRequest(body: unknown): Request {
  return new Request('https://example.test/api/admin/users/u1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<ValidationErrorBody> {
  return (await response.json()) as ValidationErrorBody;
}

describe('each legal mutation parses to its domain shape', () => {
  it('disables an account', () => {
    const parsed = adminUserMutationSchema.safeParse({ action: 'disable' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ type: 'disable' });
  });

  it('enables an account', () => {
    const parsed = adminUserMutationSchema.safeParse({ action: 'enable' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ type: 'enable' });
  });

  it('promotes an account to admin', () => {
    const parsed = adminUserMutationSchema.safeParse({ action: 'setRole', role: 'admin' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ type: 'setRole', role: 'admin' });
  });

  it('demotes an account to engineer', () => {
    const parsed = adminUserMutationSchema.safeParse({ action: 'setRole', role: 'engineer' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ type: 'setRole', role: 'engineer' });
  });
});

describe('a privilege change cannot be smuggled past the discriminant', () => {
  it('refuses a role on the disable arm rather than discarding it', () => {
    // A flat schema with an optional role would accept this and silently drop
    // the role, which reads back to the caller as an accepted instruction.
    expect(
      adminUserMutationSchema.safeParse({ action: 'disable', role: 'admin' }).success,
    ).toBe(false);
  });

  it('refuses setRole with no role at all', () => {
    expect(adminUserMutationSchema.safeParse({ action: 'setRole' }).success).toBe(false);
  });

  it('refuses a role outside the two the system defines', () => {
    const parsed = adminUserMutationSchema.safeParse({ action: 'setRole', role: 'superuser' });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0].path).toEqual(['role']);
  });

  it('refuses a misspelled field instead of falling back to a default role', () => {
    expect(
      adminUserMutationSchema.safeParse({ action: 'setRole', roles: 'admin' }).success,
    ).toBe(false);
  });

  it('refuses an unknown action', () => {
    expect(adminUserMutationSchema.safeParse({ action: 'delete' }).success).toBe(false);
  });

  it('refuses a body with no action', () => {
    expect(adminUserMutationSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('refuses a non-object body', () => {
    expect(adminUserMutationSchema.safeParse('disable').success).toBe(false);
    expect(adminUserMutationSchema.safeParse(null).success).toBe(false);
  });
});

describe('the handler contract for an invalid mutation body', () => {
  it('answers 400 naming the offending field, not a bare "invalid mutation"', async () => {
    const parsed = await parseJsonBody(
      jsonRequest({ action: 'setRole', role: 'superuser' }),
      adminUserMutationSchema,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);

    const body = await bodyOf(parsed.response);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details[0].path).toBe('role');
  });
});
