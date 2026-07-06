import { z } from 'zod';

const TEXT_MAX = 500;
const SHORT_TEXT_MAX = 120;
const ID_MAX = 200;

const trimmedString = z.string().trim();
const nonEmptyShortText = trimmedString.min(1).max(SHORT_TEXT_MAX);
const optionalText = trimmedString.max(TEXT_MAX).optional();

const materialCategorySchema = trimmedString.min(1).max(80);
const materialUnitSchema = trimmedString.min(1).max(24);
const nonNegativePriceSchema = z.number().finite().min(0).max(1_000_000_000);
const optionalNullableSupplierIdSchema = z
  .union([trimmedString.min(1).max(ID_MAX), z.null()])
  .optional();

const supplierCategoriesSchema = z.array(trimmedString.min(1).max(60)).max(50);

export const materialCreateSchema = z
  .object({
    category: materialCategorySchema,
    name: nonEmptyShortText,
    specification: optionalText,
    unit: materialUnitSchema,
    unitPricePHP: nonNegativePriceSchema,
    supplierId: optionalNullableSupplierIdSchema,
  })
  .strict();

export const materialUpdateSchema = materialCreateSchema.partial().strict();

export const supplierCreateSchema = z
  .object({
    name: nonEmptyShortText,
    type: trimmedString.min(1).max(80),
    website: trimmedString.max(300).optional(),
    location: trimmedString.max(200).optional(),
    contactInfo: optionalText,
    coverageArea: trimmedString.max(300).optional(),
    categories: supplierCategoriesSchema.optional(),
  })
  .strict();

export const supplierUpdateSchema = z
  .object({
    name: nonEmptyShortText.optional(),
    type: trimmedString.min(1).max(80).optional(),
    website: trimmedString.max(300).optional(),
    location: trimmedString.max(200).optional(),
    contactInfo: trimmedString.max(TEXT_MAX).optional(),
    coverageArea: trimmedString.max(300).optional(),
    categories: z.union([supplierCategoriesSchema, z.null()]).optional(),
  })
  .strict();

const settingsPlacementRuleSchema = z
  .object({
    id: z.number().int().min(1),
    spaceType: trimmedString.min(1).max(80),
    maxTR: z.number().finite().min(0).max(100),
    preferredUnit: trimmedString.min(1).max(80),
    wallMountHeight: z.number().finite().min(0).max(10),
    outdoorPlacement: trimmedString.min(1).max(80),
    notes: trimmedString.max(TEXT_MAX),
  })
  .strict();

export const settingsUpdateSchema = z
  .object({
    companyName: trimmedString.max(120).optional(),
    companyLogo: trimmedString.max(500).optional(),
    currency: trimmedString.max(12).optional(),
    defaultSafetyFactor: z.number().finite().min(0.5).max(3).optional(),
    defaultDiversityFactor: z.number().finite().min(0).max(2).optional(),
    defaultOutdoorDB: z.number().finite().min(-20).max(70).optional(),
    defaultOutdoorWB: z.number().finite().min(-20).max(70).optional(),
    defaultIndoorDB: z.number().finite().min(10).max(40).optional(),
    defaultIndoorRH: z.number().finite().min(0).max(100).optional(),
    laborRate: z.number().finite().min(0).max(10).optional(),
    overheadPercent: z.number().finite().min(0).max(200).optional(),
    contingencyPercent: z.number().finite().min(0).max(200).optional(),
    vatPercent: z.number().finite().min(0).max(200).optional(),
    placementRules: z.array(settingsPlacementRuleSchema).max(300).optional(),
  })
  .passthrough();

export function getCatalogValidationError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid request payload';
}
