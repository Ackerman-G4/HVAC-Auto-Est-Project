import { z } from 'zod';

/**
 * Request shape for updating a bill-of-quantities line item.
 *
 * This is the last hop before a currency figure reaches a client-facing
 * document, so the bounds here are about keeping a corrupt number out of a
 * total rather than about input hygiene. `quantity` and `suggestedUnitPrice`
 * are multiplied together directly, so a non-finite value in either produces a
 * `NaN` or `Infinity` line total that then propagates into the project sum.
 *
 * The handler's `??` chains are already correct — unlike the rooms and
 * equipment handlers, this one never used `||`, so a supplied 0 was preserved.
 * What was missing is any check that the values are numbers at all.
 */

/** Money. Non-negative and finite; a negative line price is not a discount. */
const priceSchema = z.number().finite().nonnegative().max(1_000_000_000);

export const updateBoqItemSchema = z
  .object({
    description: z.string().trim().min(1).max(1000).optional(),
    specification: z.string().max(2000).optional(),
    /**
     * Zero is allowed here, unlike an equipment selection. A BOQ line may
     * legitimately be zeroed out to exclude it from the total while keeping it
     * visible in the document.
     */
    quantity: z.number().finite().nonnegative().max(1_000_000).optional(),
    unit: z.string().trim().min(1).max(50).optional(),

    suggestedUnitPrice: priceSchema.optional(),

    /**
     * Three ways to express intent, all distinct:
     *   `useSuggested: true`          — discard the override, revert to suggested
     *   `userUnitPriceOverride: null` — clear the override
     *   field absent                  — leave the stored override alone
     */
    useSuggested: z.boolean().optional(),
    userUnitPriceOverride: priceSchema.nullable().optional(),
    /** Legacy alias the handler still honours; same semantics as the above. */
    unitPrice: priceSchema.nullable().optional(),

    overrideReason: z.string().max(2000).optional(),
    notes: z.string().max(5000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateBoqItemBody = z.infer<typeof updateBoqItemSchema>;
