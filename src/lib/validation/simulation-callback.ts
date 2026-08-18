import { z } from 'zod';

/**
 * The OpenFOAM solver callback body.
 *
 * This is the least trusted input in the system. It arrives server-to-server
 * from the cfd-solver Cloud Run Job, authenticated only by a shared header
 * secret — so anything holding that secret can post anything at all, and unlike
 * a user session there is no account behind it to reason about.
 *
 * It was previously handled with `(await request.json()) as CallbackBody`. That
 * is a cast, not a check: the interface is erased at compile time, so every
 * field arrived entirely unverified while looking typed at the call site.
 *
 * The grid dimensions are the dangerous part. They flow into `importFieldData`,
 * which allocates and walks arrays sized `nx × ny × nz`, so an unchecked
 * payload could name a grid large enough to exhaust memory before any
 * validation ran.
 */

/**
 * Per-axis cell count. The internal solver config bounds its grid at 120 per
 * axis; OpenFOAM meshes are legitimately finer, so this is deliberately looser
 * while still refusing an absurd value.
 */
const axisSchema = z.number().int().positive().max(2000);

/**
 * Total cells across the grid.
 *
 * A per-axis cap alone is not enough: 2000³ is eight billion cells, which is
 * inside the per-axis bound and would exhaust memory on allocation. Bounding
 * the product is what actually caps the work a single callback can request.
 *
 * 8M is roughly ten times the internal solver's own ceiling (120×120×60), so
 * it accommodates a genuinely finer OpenFOAM mesh while keeping the cost of
 * walking the payload bounded — the field arrays below are validated
 * element-by-element, and that only stays affordable if the cell count does.
 */
const MAX_TOTAL_CELLS = 8_000_000;

const dimensionsSchema = z
  .object({
    nx: axisSchema,
    ny: axisSchema,
    nz: axisSchema,
  })
  .refine((d) => d.nx * d.ny * d.nz <= MAX_TOTAL_CELLS, {
    message: `Grid exceeds the maximum of ${MAX_TOTAL_CELLS.toLocaleString()} cells.`,
  });

/**
 * Field arrays are validated element-by-element, not merely shape-checked.
 *
 * The importer's `validateDimensions` only compares lengths, so an array of the
 * right dimensions holding strings passes it — and `scalarRange` then compares
 * those strings with `<`, producing a garbage min/max with no error anywhere.
 * That figure is the engineering result the user goes on to defend, so it is
 * worth the walk.
 *
 * Values must also be finite: a `NaN` cell silently poisons every aggregate
 * computed from the field.
 *
 * This is affordable specifically because MAX_TOTAL_CELLS bounds the work, and
 * because a callback arrives once per solve — after minutes of CFD, not on a
 * hot request path.
 */
const cellSchema = z.number().finite();
const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

/** [x][y][z] — the layout `validateDimensions` expects. */
const scalarFieldSchema = z.array(z.array(z.array(cellSchema)));
const vectorFieldSchema = z.array(z.array(z.array(vec3Schema)));

const fieldDataSchema = z
  .object({
    temperature: scalarFieldSchema.optional(),
    velocity: vectorFieldSchema.optional(),
    pressure: scalarFieldSchema.optional(),
    humidity: scalarFieldSchema.optional(),
  })
  .refine(
    (d) =>
      d.temperature !== undefined ||
      d.velocity !== undefined ||
      d.pressure !== undefined ||
      d.humidity !== undefined,
    { message: 'Field data must contain at least one of temperature, velocity, pressure or humidity.' },
  );

export const openFoamCallbackSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('failed'),
    errorMessage: z.string().max(5000).optional(),
    /** Trimmed to the last 50 entries by the handler. */
    logTail: z.array(z.string().max(10_000)).max(5000).optional(),
    iteration: z.number().int().nonnegative().max(10_000_000).optional(),
    dimensions: dimensionsSchema.optional(),
  }),
  z.object({
    status: z.literal('completed'),
    /**
     * Required on a completed callback. The handler previously accepted the
     * absence and returned MISSING_FIELDS by hand; the schema states it.
     */
    data: fieldDataSchema,
    /** Optional — the handler falls back to the stored case mesh. */
    dimensions: dimensionsSchema.optional(),
    iteration: z.number().int().nonnegative().max(10_000_000).optional(),
    logTail: z.array(z.string().max(10_000)).max(5000).optional(),
    errorMessage: z.string().max(5000).optional(),
  }),
]);

export type OpenFoamCallbackBody = z.infer<typeof openFoamCallbackSchema>;
export { MAX_TOTAL_CELLS };
