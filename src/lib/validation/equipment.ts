import { z } from 'zod';

/**
 * Request shapes for the project equipment endpoints.
 *
 * The POST body serves two distinct operations that share no required fields:
 * `autoSize: true` sizes equipment for every room from their computed loads,
 * while the manual form attaches one catalogue (or custom) unit to one room.
 * A discriminated union expresses that — a single flat schema would have to
 * make `roomId` optional, which would let a manual selection through with no
 * room to attach to.
 *
 * The quantity default is the reason this file exists. The handler used
 * `body.quantity || 1`, which fires on 0, so a line item explicitly set to
 * zero units was written as one and costed accordingly.
 */

const budgetLevelSchema = z.enum(['economy', 'mid-range', 'premium']);

/**
 * Mirrors `EquipmentType` in src/types/equipment.ts.
 *
 * This was `string` on the first pass and the compiler rejected it the moment
 * the body became typed — which is the boundary earning its keep. Previously an
 * arbitrary `preferredType` reached the sizing call and simply matched nothing.
 */
const equipmentTypeSchema = z.enum([
  'wall_split', 'ceiling_cassette', 'floor_standing', 'ducted_split',
  'vrf_indoor', 'vrf_outdoor', 'chiller', 'ahu', 'fcu',
]);

/**
 * Quantity is a positive integer. Zero is rejected rather than defaulted:
 * a zero-unit selection is not a meaningful record, and silently promoting it
 * to 1 is what put a phantom unit into the BOQ.
 */
const quantitySchema = z.number().int().positive().max(10_000);

const autoSizeSchema = z.object({
  autoSize: z.literal(true),
  budgetLevel: budgetLevelSchema.default('mid-range'),
  preferredBrand: z.string().trim().min(1).max(200).optional(),
  preferredType: equipmentTypeSchema.optional(),
});

const manualSelectionSchema = z.object({
  autoSize: z.literal(false).optional(),
  roomId: z.string().trim().min(1).max(200),
  quantity: quantitySchema.default(1),

  model: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(200).optional(),
  type: equipmentTypeSchema.optional(),

  /**
   * Capacity and price are advisory. `resolveManualSelection` ignores them for
   * a known catalogue SKU and only honours them for a genuinely off-catalogue
   * item, so the schema bounds them without treating them as authoritative.
   */
  capacityBTU: z.number().finite().positive().max(100_000_000).optional(),
  capacityTR: z.number().finite().positive().max(10_000).optional(),
  capacityKW: z.number().finite().positive().max(100_000).optional(),
  eer: z.number().finite().positive().max(100).optional(),
  refrigerant: z.string().trim().min(1).max(50).optional(),
  unitPrice: z.number().finite().nonnegative().max(1_000_000_000).optional(),
  powerSupply: z.string().trim().max(100).default(''),
  custom: z.boolean().optional(),
});

export const createEquipmentSelectionSchema = z.union([
  autoSizeSchema,
  manualSelectionSchema,
]);

/** Narrowing helper so the handler branches on a type, not on a raw property. */
export function isAutoSizeRequest(
  body: z.infer<typeof createEquipmentSelectionSchema>,
): body is z.infer<typeof autoSizeSchema> {
  return body.autoSize === true;
}

export const updateEquipmentSelectionSchema = z
  .object({
    quantity: quantitySchema.optional(),
    userQuantityOverride: quantitySchema.nullable().optional(),
    userUnitPriceOverride: z.number().finite().nonnegative().max(1_000_000_000).nullable().optional(),
    overrideReason: z.string().max(2000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type CreateEquipmentSelectionBody = z.infer<typeof createEquipmentSelectionSchema>;
export type UpdateEquipmentSelectionBody = z.infer<typeof updateEquipmentSelectionSchema>;
