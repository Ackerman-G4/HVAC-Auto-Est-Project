import { describe, expect, it } from 'vitest';
import { parseJsonBody, type ValidationErrorBody } from '../http';
import { refreshRequestSchema } from '../auth';

/**
 * The token refresh boundary.
 *
 * This route is unauthenticated by construction — the refresh token is the only
 * credential it carries — and the value it reads is forwarded verbatim to
 * Google's securetoken endpoint. It previously read `body.refreshToken` off an
 * `any`, coerced a non-string to `''`, and reported that as "Missing refresh
 * token", so a caller sending the wrong type was told the field was absent.
 */

function jsonRequest(body: unknown): Request {
  return new Request('https://example.test/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<ValidationErrorBody> {
  return (await response.json()) as ValidationErrorBody;
}

describe('a well formed refresh request is accepted', () => {
  it('returns the token', () => {
    const parsed = refreshRequestSchema.safeParse({ refreshToken: 'AMf-vBx9_token_value' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.refreshToken).toBe('AMf-vBx9_token_value');
  });

  it('strips surrounding whitespace, so a padded token is not sent onward padded', () => {
    const parsed = refreshRequestSchema.safeParse({ refreshToken: '  token_value  ' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.refreshToken).toBe('token_value');
  });
});

describe('a refresh request that cannot be honoured is rejected at the boundary', () => {
  it('rejects an absent token', () => {
    expect(refreshRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a token that is whitespace only, which trims to empty', () => {
    expect(refreshRequestSchema.safeParse({ refreshToken: '   ' }).success).toBe(false);
  });

  it('names the wrong type rather than reporting the field as missing', () => {
    // The replaced code coerced any non-string to '' and returned "Missing
    // refresh token", which is a false statement about the request.
    const parsed = refreshRequestSchema.safeParse({ refreshToken: 12345 });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0].code).toBe('invalid_type');
    expect(parsed.error.issues[0].path).toEqual(['refreshToken']);
  });

  it('rejects a token long enough to be an abuse of the outbound request', () => {
    const parsed = refreshRequestSchema.safeParse({ refreshToken: 'a'.repeat(4097) });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0].message).toBe('Refresh token is too long');
  });

  it('accepts a token at the ceiling, so the bound is not off by one', () => {
    expect(refreshRequestSchema.safeParse({ refreshToken: 'a'.repeat(4096) }).success).toBe(true);
  });

  it('rejects an unknown key instead of ignoring it', () => {
    const parsed = refreshRequestSchema.safeParse({
      refreshToken: 'token_value',
      role: 'admin',
    });

    expect(parsed.success).toBe(false);
  });
});

describe('the handler contract for an invalid refresh body', () => {
  it('answers 400 with per-field detail rather than throwing', async () => {
    const parsed = await parseJsonBody(jsonRequest({ refreshToken: null }), refreshRequestSchema);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);

    const body = await bodyOf(parsed.response);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details[0].path).toBe('refreshToken');
  });
});
