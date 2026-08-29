import { z } from 'zod';

/**
 * The simulation report history boundary.
 *
 * This route persists an engineering report verbatim into Firestore. It read
 * `await request.json()` — an `any` — and then rebuilt the record field by field
 * with defensive defaulting: `typeof body.projectName === 'string' && ... ? ... :
 * 'Simulation Project'`. Two things went wrong with that shape.
 *
 * First, a wrong type was indistinguishable from an absent field. A client
 * sending `maxTemperatureC: "31.4"` stored 0 and was told the write succeeded.
 *
 * Second, the report itself was admitted by `value as SimulationEngineeringReport`
 * — a cast, not a check. The interface was erased at compile time, so an
 * arbitrary object was written to the document under a name that claimed
 * structure it had never been shown to have.
 *
 * The schema below mirrors that interface so the claim is checked once, here.
 * Unknown keys inside the report are stripped rather than rejected: the report
 * is our own artefact and gains fields over time, and storing only what this
 * version understands is the safer half of that trade.
 */

const LABEL_MAX_LENGTH = 200;
const LIST_ITEM_MAX_LENGTH = 500;
const STRING_LIST_MAX_ITEMS = 200;
/** A floor plan with more rooms than this is not a floor plan. */
const ROOM_METRICS_MAX_ITEMS = 5000;

/**
 * Every persisted number is finite. `typeof NaN === 'number'` is true, so the
 * replaced `typeof body.pue === 'number'` check admitted NaN, which Firestore
 * stores and every later aggregate reading the column inherits.
 */
const finiteNumber = z.number().finite();

const label = z.string().max(LABEL_MAX_LENGTH);

const boundedStringList = z
  .array(z.string().max(LIST_ITEM_MAX_LENGTH))
  .max(STRING_LIST_MAX_ITEMS);

/**
 * A label the client may legitimately send blank, because it comes from
 * workspace state that was never named. Blank is not a client error here, so it
 * collapses to the documented sentinel. A non-string still fails — the replaced
 * code silently substituted the sentinel and reported success.
 */
function labelWithFallback(fallback: string) {
  return label.nullish().transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
  });
}

/** ISO 8601. The history list sorts on `Date.parse` of this field. */
const isoTimestamp = z.string().datetime({ offset: true });

export const simulationEngineeringReportSchema = z.object({
  meta: z.object({
    generatedAt: isoTimestamp,
    projectId: label,
    projectName: label,
    floorId: label,
    runtimeMode: label,
    mode: label,
    dimensionMode: label,
  }),
  equipment: z.object({
    rackCount: finiteNumber,
    hvacCount: finiteNumber,
    tileCount: finiteNumber,
    totalHeatKw: finiteNumber,
    totalCoolingKw: finiteNumber,
  }),
  simulation: z.object({
    hasResult: z.boolean(),
    iteration: finiteNumber,
    converged: z.boolean(),
    maxTemperatureC: finiteNumber,
    avgTemperatureC: finiteNumber,
    minTemperatureC: finiteNumber,
    maxVelocityMs: finiteNumber,
    pue: finiteNumber,
    hotspotCount: finiteNumber,
    continuityResidual: finiteNumber,
    momentumResidual: finiteNumber,
    energyResidual: finiteNumber,
  }),
  engineering: z.object({
    airflowBalanceM3s: finiteNumber,
    pressureImbalancePa: finiteNumber,
    ventilationEffectiveness: finiteNumber,
    deadZoneRatio: finiteNumber,
    airflowDistributionScore: finiteNumber,
    uniformityIndex: finiteNumber,
    roomMetrics: z
      .array(
        z.object({
          roomId: label,
          floorId: label,
          floorNumber: finiteNumber,
          avgTemperature: finiteNumber,
          meanVelocity: finiteNumber,
          stagnationRatio: finiteNumber,
          pressure: finiteNumber,
          inflowM3s: finiteNumber,
          outflowM3s: finiteNumber,
        }),
      )
      .max(ROOM_METRICS_MAX_ITEMS),
  }),
  compliance: z.object({
    available: z.boolean(),
    overallPass: z.boolean(),
    score: finiteNumber,
    thermalClass: label,
    failedChecks: boundedStringList,
  }),
  pue: z.object({
    available: z.boolean(),
    value: finiteNumber,
    rating: label,
    recommendations: boundedStringList,
  }),
  optimization: z.object({
    available: z.boolean(),
    improvementPercent: finiteNumber,
    iterations: finiteNumber,
    bestIteration: finiteNumber,
    suggestionCount: finiteNumber,
    topSuggestions: boundedStringList,
  }),
  failure: z.object({
    available: z.boolean(),
    scenario: label,
    timeToWarningSeconds: finiteNumber,
    timeToCriticalSeconds: finiteNumber,
    affectedRacks: finiteNumber,
  }),
});

export const createReportHistorySchema = z
  .object({
    format: z.enum(['pdf', 'csv', 'json']),
    source: z.enum(['viewer', 'workspace', 'engine']),
    projectId: labelWithFallback('unknown-project'),
    projectName: labelWithFallback('Simulation Project'),
    floorId: labelWithFallback('unknown-floor'),
    runtimeMode: labelWithFallback('worker'),
    converged: z.boolean().nullish().transform((value) => value === true),
    maxTemperatureC: finiteNumber.nullish().transform((value) => value ?? 0),
    pue: finiteNumber.nullish().transform((value) => value ?? 0),
    // A negative count is a client defect, not something to clamp away. The
    // replaced `Math.max(0, ...)` hid it.
    hotspotCount: finiteNumber
      .min(0)
      .nullish()
      .transform((value) => (value == null ? 0 : Math.trunc(value))),
    generatedAt: isoTimestamp.nullish().transform((value) => value ?? undefined),
    report: simulationEngineeringReportSchema
      .nullish()
      .transform((value) => value ?? undefined),
  })
  .strict();

/**
 * The body of a clear or backfill request. Both accept an empty object, which
 * means "every project owned by the caller", so `projectId` is optional — but a
 * present-and-wrong `projectId` is rejected rather than ignored.
 */
export const projectScopedRequestSchema = z
  .object({
    projectId: label.nullish().transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
  })
  .strict();

export type CreateReportHistoryRequest = z.infer<typeof createReportHistorySchema>;
export type ProjectScopedRequest = z.infer<typeof projectScopedRequestSchema>;
