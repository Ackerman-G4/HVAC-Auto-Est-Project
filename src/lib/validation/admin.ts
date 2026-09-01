import { z } from 'zod';

const MODEL_MAX = 120;
const JUSTIFICATION_MIN = 20;
const JUSTIFICATION_MAX = 500;

const trimmedString = z.string().trim();
const modelSchema = trimmedString.min(1).max(MODEL_MAX);

export const priceOverrideRequestSchema = z
  .object({
    model: modelSchema,
    overridePricePhp: z.number().finite().positive(),
    justification: trimmedString.min(JUSTIFICATION_MIN).max(JUSTIFICATION_MAX),
  })
  .strict();

export const clearOverrideSchema = z
  .object({
    model: modelSchema,
  })
  .strict();

/**
 * A privileged mutation on another user's account.
 *
 * Mirrors `AdminMutation` in `lib/auth/admin-user-mutations.ts`. The handler
 * previously narrowed this by hand from `unknown`, which was **correct** — role
 * was already constrained to the two valid values, so there was no privilege
 * escalation here. What it could not do was distinguish a malformed body from a
 * server fault: `await request.json()` threw into the outer catch and returned
 * 500 for what is a client mistake.
 *
 * `role` is only meaningful for `setRole`, so this is a discriminated union
 * rather than a flat object with an optional role — the latter would accept
 * `{ action: 'disable', role: 'admin' }` and silently ignore the role.
 */
export const adminUserMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('disable') }).strict(),
  z.object({ action: z.literal('enable') }).strict(),
  z
    .object({
      action: z.literal('setRole'),
      role: z.enum(['admin', 'engineer']),
    })
    .strict(),
]);

export type AdminUserMutationBody = z.infer<typeof adminUserMutationSchema>;

// `getAdminValidationError` stood here and now has no consumers. It returned
// `error.issues[0].message` alone, which is the pattern `parseJsonBody`
// replaces: one message at a time, no field paths, and a `{ error }` body
// shaped differently from every other route's. Removed rather than left as a
// second way to do the same thing.
