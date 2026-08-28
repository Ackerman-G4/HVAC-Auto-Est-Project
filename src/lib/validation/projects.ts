import { z } from 'zod';

/**
 * Request shapes for the projects and floors endpoints.
 *
 * The bounds here are physical and commercial, not arbitrary. Design
 * conditions feed the cooling-load calculation directly, and the cost
 * multipliers feed the BOQ total, so a value that is merely a number is not
 * good enough — an outdoor dry bulb of 500°C parses fine and produces a
 * plausible-looking, entirely wrong load.
 *
 * CLAUDE.md §8.5: safety and diversity factors are dimensionless multipliers
 * and must be validated to a finite positive range. A diversity factor above 1
 * is physically valid only in documented cases, so it is permitted but bounded
 * rather than silently accepted at any magnitude.
 */

/** Dry/wet bulb in °C. Bounds cover terrestrial design conditions with margin. */
const temperatureCSchema = z.number().finite().min(-60).max(60);

/** Relative humidity, percent. */
const relativeHumiditySchema = z.number().finite().min(0).max(100);

/**
 * Dimensionless multiplier. Strictly positive: a zero safety factor collapses
 * the load to nothing, and a negative one inverts it.
 */
const safetyFactorSchema = z.number().finite().positive().max(5);

/**
 * Diversity factor. Above 1 is unusual but legitimate in documented cases
 * (simultaneous peak on a shared system), so it is bounded rather than capped
 * at 1.
 */
const diversityFactorSchema = z.number().finite().positive().max(2);

/** A percentage applied to a subtotal, e.g. overhead or contingency. */
const percentSchema = z.number().finite().min(0).max(100);

/** A cost multiplier, e.g. regional labour adjustment. */
const multiplierSchema = z.number().finite().positive().max(10);

export const projectStatusSchema = z.enum([
  'draft', 'active', 'completed', 'archived', 'deleted',
]);

const designConditions = {
  outdoorDB: temperatureCSchema.optional(),
  outdoorWB: temperatureCSchema.optional(),
  outdoorRH: relativeHumiditySchema.optional(),
  indoorDB: temperatureCSchema.optional(),
  indoorRH: relativeHumiditySchema.optional(),
  safetyFactor: safetyFactorSchema.optional(),
  diversityFactor: diversityFactorSchema.optional(),
};

const costParameters = {
  suggestedLaborMultiplier: multiplierSchema.optional(),
  laborMultiplierOverride: multiplierSchema.nullable().optional(),
  suggestedOverheadPercent: percentSchema.optional(),
  overheadPercentOverride: percentSchema.nullable().optional(),
  suggestedContingencyPercent: percentSchema.optional(),
  contingencyPercentOverride: percentSchema.nullable().optional(),
  suggestedVatRate: percentSchema.optional(),
  vatRateOverride: percentSchema.nullable().optional(),
};

const projectDescriptors = {
  name: z.string().trim().min(1).max(300),
  clientName: z.string().trim().max(300).optional(),
  buildingType: z.string().trim().min(1).max(100).optional(),
  location: z.string().trim().max(300).optional(),
  city: z.string().trim().min(1).max(200).optional(),
  totalFloorArea: z.number().finite().nonnegative().max(10_000_000).optional(),
  floorsAboveGrade: z.number().int().min(0).max(300).optional(),
  floorsBelowGrade: z.number().int().min(0).max(50).optional(),
  notes: z.string().max(10_000).optional(),
};

export const createProjectSchema = z.object({
  ...projectDescriptors,
  ...designConditions,
});

export const updateProjectSchema = z
  .object({
    ...projectDescriptors,
    name: projectDescriptors.name.optional(),
    ...designConditions,
    ...costParameters,
    status: projectStatusSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update.',
  });

// ── Floors ───────────────────────────────────────────────────

/**
 * Pixels per metre on the floor-plan image. Strictly positive because room
 * polygon coordinates are divided by it to reach metres — a zero scale yields
 * Infinity for every vertex.
 */
const floorScaleSchema = z.number().finite().positive().max(10_000);

/** Metres. Positive because a zero-height floor encloses no volume. */
const ceilingHeightSchema = z.number().finite().positive().max(30);

const floorShape = {
  floorNumber: z.number().int().min(-10).max(200).default(1),
  name: z.string().trim().min(1).max(200).optional(),
  ceilingHeight: ceilingHeightSchema.default(3.0),
  scale: floorScaleSchema.default(50),
  /** Data URL or storage path. `null` clears the image. */
  floorPlanImage: z.string().max(5_000_000).nullable().default(null),
};

export const createFloorSchema = z.object(floorShape);

export const updateFloorSchema = z
  .object({
    floorNumber: floorShape.floorNumber.removeDefault().optional(),
    name: floorShape.name,
    ceilingHeight: ceilingHeightSchema.optional(),
    scale: floorScaleSchema.optional(),
    floorPlanImage: z.string().max(5_000_000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type CreateProjectBody = z.infer<typeof createProjectSchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
export type CreateFloorBody = z.infer<typeof createFloorSchema>;
export type UpdateFloorBody = z.infer<typeof updateFloorSchema>;
