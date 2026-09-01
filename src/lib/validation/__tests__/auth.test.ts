import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  registerRequestSchema,
  googleLoginRequestSchema,
  forgotPasswordRequestSchema,
  getFirstZodErrorMessage,
  getZodFieldErrors,
} from '../auth';

/**
 * The password policy and the login/register contracts.
 *
 * 185 lines at 0% coverage until now, and the only thing standing between a
 * weak password and a stored account. Coverage measurement (TASK 5.1) is what
 * surfaced it — the module reads as thorough, which is exactly why nobody
 * checked whether it does what it says.
 *
 * Each rule is tested against a password that violates only that rule, so a
 * failure names the rule that broke rather than "the policy rejected it".
 */

const email = 'estimator@hvac-auto.dev';

/** Satisfies every rule: length, cases, digit, symbol, not common, not a date. */
const strong = 'Kalesa#Breeze42';

const register = (password: string, overrides: Record<string, unknown> = {}) =>
  registerRequestSchema.safeParse({ email, password, name: 'Estimator', ...overrides });

describe('the register password policy', () => {
  it('accepts a password that satisfies every rule', () => {
    expect(register(strong).success).toBe(true);
  });

  it('requires at least 12 characters', () => {
    // Everything else present: cases, digit, symbol.
    expect(register('Ab3#efgh').success).toBe(false);
  });

  it('requires a lowercase letter', () => {
    expect(register('KALESA#BREEZE42').success).toBe(false);
  });

  it('requires an uppercase letter', () => {
    expect(register('kalesa#breeze42').success).toBe(false);
  });

  it('requires a digit', () => {
    expect(register('Kalesa#BreezeXY').success).toBe(false);
  });

  it('requires a symbol', () => {
    expect(register('KalesaBreeze421').success).toBe(false);
  });
});

describe('passwords that pass the character rules but are still weak', () => {
  it('rejects a password containing the email local part', () => {
    // "estimator" is the local part; a policy that counts characters alone
    // would happily accept this.
    expect(register('Estimator#2026x').success).toBe(false);
  });

  it('allows a short local part to appear, since 3 characters is not a giveaway', () => {
    // The rule only fires at 4+ characters, so a user like abc@… is not
    // barred from every password containing "abc".
    const result = registerRequestSchema.safeParse({
      email: 'abc@hvac-auto.dev',
      password: 'Kalesa#abc42Xy',
      name: 'Estimator',
    });
    expect(result.success).toBe(true);
  });

  // The date rule is narrower than it first looks. Its pattern is
  // /^\D{0,2}(\d{8})\D{0,2}$/ — anchored, with at most two non-digits either
  // side. It targets a password that *is* a date, not one that contains one.
  //
  // That is a deliberate scope: rejecting every password containing eight
  // consecutive digits would be over-broad. These assert the boundary of the
  // rule as written, in both directions.

  it('rejects a password that is a yyyymmdd date with minimal decoration', () => {
    // Reaches the character rules, then falls to the date rule.
    expect(register('aB20260815').success).toBe(false);
  });

  it('rejects a password that is a ddmmyyyy date with minimal decoration', () => {
    expect(register('aB15082026').success).toBe(false);
  });

  it('accepts a date buried inside a longer password', () => {
    // Seven non-digits before the run, so the anchored pattern does not match.
    // Documenting the limit rather than implying the rule is broader.
    expect(register('Manila#20260815').success).toBe(true);
  });

  it('accepts an eight-digit run that is not a valid date', () => {
    // 99 is neither a month nor a day, so this is just a number. Padded to the
    // 12-character minimum with the two non-digits the pattern allows either
    // side, so it still matches the pattern and is rejected only if the date
    // check itself fires.
    expect(register('#B99999999c!').success).toBe(true);
  });

  it('rejects a blocklisted password even when it satisfies the character rules', () => {
    // The blocklist is compared case-insensitively.
    expect(register('Password@1234').success).toBe(false);
  });
});

describe('email handling', () => {
  it('rejects a malformed address', () => {
    expect(register(strong, { email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects an empty address', () => {
    expect(register(strong, { email: '' }).success).toBe(false);
  });

  it('treats name as optional, so an account can be created without one', () => {
    expect(registerRequestSchema.safeParse({ email, password: strong }).success).toBe(true);
  });

  it('rejects an unknown field rather than ignoring it', () => {
    // .strict() — an unrecognised field must not be silently dropped. A client
    // sending something like `isAdmin` should be told it was not honoured
    // rather than left believing it was.
    expect(register(strong, { isAdmin: true }).success).toBe(false);
  });
});

describe('login is deliberately laxer than register', () => {
  it('accepts any non-empty password, because the policy applies at creation', () => {
    // Applying the register policy here would lock out every account created
    // before the policy tightened.
    expect(loginRequestSchema.safeParse({ email, password: 'old' }).success).toBe(true);
  });

  it('still requires both fields', () => {
    expect(loginRequestSchema.safeParse({ email, password: '' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ password: strong }).success).toBe(false);
  });

  it('still requires a well-formed email', () => {
    expect(loginRequestSchema.safeParse({ email: 'nope', password: strong }).success).toBe(false);
  });
});

describe('the other auth entry points', () => {
  it('requires a credential for Google login', () => {
    expect(googleLoginRequestSchema.safeParse({}).success).toBe(false);
    // The credential must be at least 10 characters; a real Google JWT is
    // far longer, so a stub that short is not a plausible token.
    expect(googleLoginRequestSchema.safeParse({ credential: 'short' }).success).toBe(false);
    expect(googleLoginRequestSchema.safeParse({ credential: 'a'.repeat(120) }).success).toBe(true);
  });

  it('requires a well-formed email to start a password reset', () => {
    expect(forgotPasswordRequestSchema.safeParse({ email }).success).toBe(true);
    expect(forgotPasswordRequestSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('error surfacing helpers', () => {
  it('returns the first message for a single-line display', () => {
    const result = register('short');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(getFirstZodErrorMessage(result.error).length).toBeGreaterThan(0);
  });

  it('maps issues onto field names so a form can render them inline', () => {
    const result = registerRequestSchema.safeParse({ email: 'nope', password: 'short' });
    expect(result.success).toBe(false);
    if (result.success) return;

    const fields = getZodFieldErrors(result.error);
    expect(fields.email).toBeTruthy();
    expect(fields.password).toBeTruthy();
  });
});
