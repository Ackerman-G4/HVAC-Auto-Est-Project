import { z } from 'zod';

import type { AdminMutation } from '@/lib/auth/admin-user-mutations';

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

const adminRoleSchema = z.enum(['admin', 'engineer']);

/**
 * An admin account mutation as it arrives on the wire.
 *
 * A discriminated union rather than a flat object carrying an optional `role`,
 * because `role` is meaningful only on the `setRole` arm. A flat schema would
 * accept `{ action: 'disable', role: 'admin' }` and silently discard the role,
 * which reads back to the caller as an accepted instruction that never ran.
 *
 * `.strict()` on each arm rejects unknown keys, so a misspelled `roles` is a
 * 400 naming the field rather than a silent fallback to the default role.
 */
const adminUserMutationWireSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('disable') }).strict(),
  z.object({ action: z.literal('enable') }).strict(),
  z.object({ action: z.literal('setRole'), role: adminRoleSchema }).strict(),
]);

/**
 * Parses straight to the domain type, so no handler ever holds the wire shape.
 * The `action` / `type` rename is the only difference between the two, and it
 * happens once here instead of at each call site.
 */
export const adminUserMutationSchema = adminUserMutationWireSchema.transform(
  (wire): AdminMutation =>
    wire.action === 'setRole' ? { type: 'setRole', role: wire.role } : { type: wire.action },
);

export function getAdminValidationError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid request payload';
}
