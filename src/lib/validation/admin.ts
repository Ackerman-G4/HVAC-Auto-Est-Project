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

export function getAdminValidationError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid request payload';
}
