import { describe, expect, it } from 'vitest';
import {
  adminUserMutationSchema,
  priceOverrideRequestSchema,
  clearOverrideSchema,
} from '../admin';

/**
 * Admin request contracts.
 *
 * The user mutation endpoint assigns roles, so it is the privilege-escalation
 * surface. The hand-rolled parser it replaces was **correct** — it narrowed
 * from `unknown` and already constrained `role` to the two valid values. These
 * tests exist to keep it that way now that the narrowing lives in a schema,
 * not because a hole was found.
 */

describe('role assignment stays constrained', () => {
  it('accepts the two valid roles', () => {
    expect(adminUserMutationSchema.parse({ action: 'setRole', role: 'admin' })).toEqual({
      action: 'setRole',
      role: 'admin',
    });
    expect(adminUserMutationSchema.parse({ action: 'setRole', role: 'engineer' })).toEqual({
      action: 'setRole',
      role: 'engineer',
    });
  });

  it('rejects a role outside the vocabulary', () => {
    expect(adminUserMutationSchema.safeParse({ action: 'setRole', role: 'superadmin' }).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({ action: 'setRole', role: 'owner' }).success).toBe(false);
  });

  it('rejects setRole with no role at all', () => {
    // Without this, a role-less setRole would reach the mutation layer.
    expect(adminUserMutationSchema.safeParse({ action: 'setRole' }).success).toBe(false);
  });

  it('rejects a non-string role', () => {
    expect(adminUserMutationSchema.safeParse({ action: 'setRole', role: { admin: true } }).success).toBe(false);
  });
});

describe('the action discriminates what else is allowed', () => {
  it('accepts disable and enable without a role', () => {
    expect(adminUserMutationSchema.parse({ action: 'disable' })).toEqual({ action: 'disable' });
    expect(adminUserMutationSchema.parse({ action: 'enable' })).toEqual({ action: 'enable' });
  });

  it('rejects a role smuggled onto disable', () => {
    // A flat object with an optional role would accept this and silently
    // ignore the role, which reads as a granted request that never happened.
    expect(adminUserMutationSchema.safeParse({ action: 'disable', role: 'admin' }).success).toBe(false);
  });

  it('rejects an unknown action', () => {
    expect(adminUserMutationSchema.safeParse({ action: 'delete' }).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({ action: 'promote' }).success).toBe(false);
  });

  it('rejects a body with no action', () => {
    expect(adminUserMutationSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({}).success).toBe(false);
  });
});

describe('price overrides', () => {
  const valid = {
    model: 'FTKF35A',
    overridePricePhp: 42_000,
    justification: 'Supplier quote dated 2026-08-01 supersedes the catalogue price.',
  };

  it('accepts a justified override', () => {
    expect(priceOverrideRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a zero or negative price', () => {
    // This figure lands directly in a quotation.
    expect(priceOverrideRequestSchema.safeParse({ ...valid, overridePricePhp: 0 }).success).toBe(false);
    expect(priceOverrideRequestSchema.safeParse({ ...valid, overridePricePhp: -1 }).success).toBe(false);
  });

  it('rejects a non-finite price', () => {
    expect(priceOverrideRequestSchema.safeParse({ ...valid, overridePricePhp: Infinity }).success).toBe(false);
    expect(priceOverrideRequestSchema.safeParse({ ...valid, overridePricePhp: NaN }).success).toBe(false);
  });

  it('requires a substantive justification', () => {
    // An override is a deliberate departure from the catalogue; a one-word
    // reason is not an audit trail.
    expect(priceOverrideRequestSchema.safeParse({ ...valid, justification: 'cheaper' }).success).toBe(false);
  });

  it('rejects unknown fields rather than ignoring them', () => {
    // .strict() — a typo'd field name is a mistake worth surfacing, not
    // something to drop silently.
    expect(priceOverrideRequestSchema.safeParse({ ...valid, overridePrice: 100 }).success).toBe(false);
  });

  it('requires a model to clear an override', () => {
    expect(clearOverrideSchema.safeParse({}).success).toBe(false);
    expect(clearOverrideSchema.safeParse({ model: '   ' }).success).toBe(false);
    expect(clearOverrideSchema.parse({ model: 'FTKF35A' }).model).toBe('FTKF35A');
  });
});
