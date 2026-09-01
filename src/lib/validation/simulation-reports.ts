import { z } from 'zod';

/**
 * Request shapes for the simulation report history endpoints.
 *
 * The handler guarded every field with `typeof x === 'number'`, which is true
 * for `NaN` and `Infinity`. So a report recorded with a diverged solve stored
 * `maxTemperatureC: NaN` and `pue: NaN`, and the history view rendered them as
 * the literal text "NaN" beside real figures. `hotspotCount` was worse:
 * `Math.max(0, Math.trunc(NaN))` is `NaN`, so the clamp that looks like it
 * bounds the value passes it straight through.
 *
 * `.finite()` is the whole point of this file — every numeric field here is a
 * figure someone reads off a report.
 */

export const reportFormatSchema = z.enum(['pdf', 'csv', 'json']);
export const reportSourceSchema = z.enum(['viewer', 'workspace', 'engine']);

/**
 * Sentinels the handler already understands for a report not tied to a stored
 * project. Kept as literals so the ownership check keeps recognising them.
 */
const UNSCOPED_PROJECT_IDS = ['unknown-project', 'workspace'] as const;

const projectIdSchema = z.string().trim().min(1).max(200);

export const createReportHistorySchema = z.object({
  format: reportFormatSchema,
  source: reportSourceSchema,

  projectId: projectIdSchema.default('unknown-project'),
  projectName: z.string().trim().min(1).max(300).default('Simulation Project'),
  floorId: z.string().trim().min(1).max(200).default('unknown-floor'),
  runtimeMode: z.string().trim().min(1).max(50).default('worker'),

  converged: z.boolean().default(false),

  /** Celsius. Finite — a diverged solve otherwise stored NaN. */
  maxTemperatureC: z.number().finite().min(-100).max(500).default(0),
  /**
   * Power Usage Effectiveness. Physically at least 1 — a facility cannot use
   * less total power than its IT load — so a value below it is a broken
   * calculation rather than an efficient datacentre. Zero is permitted only as
   * the "not computed" default the handler already used.
   */
  pue: z.union([z.literal(0), z.number().finite().min(1).max(100)]).default(0),
  hotspotCount: z.number().int().nonnegative().max(1_000_000).default(0),

  /** Opaque to this layer; the report renderer owns its shape. */
  report: z.record(z.string(), z.unknown()).optional(),

  /** ISO 8601. Validated as a real timestamp, not merely as a string. */
  generatedAt: z.iso.datetime({ offset: true }).optional(),
});

/** DELETE and the backfill route both take an optional project scope. */
export const reportHistoryScopeSchema = z.object({
  projectId: projectIdSchema.optional(),
});

/** True when the id is a sentinel rather than a stored project. */
export function isUnscopedProjectId(projectId: string): boolean {
  return (UNSCOPED_PROJECT_IDS as readonly string[]).includes(projectId);
}

export type CreateReportHistoryBody = z.infer<typeof createReportHistorySchema>;
export type ReportHistoryScopeBody = z.infer<typeof reportHistoryScopeSchema>;
