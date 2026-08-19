import { z } from 'zod';

/**
 * Request shapes for the simulation case endpoints.
 *
 * The scalar room dimensions and the cell size are the safety-critical part.
 * `buildStructuredGrid` computes each axis as `Math.ceil(lengthM / cellSize)`,
 * so a zero cell size yields `Infinity` and then `new Array(Infinity)`. A zero
 * dimension collapses the grid to nothing. Neither was checked: the create
 * handler assigned `const geometry: GeometryInput = body.geometry` straight off
 * an unparsed body, which is an unchecked `any` wearing a type annotation.
 *
 * The nested collections are described in full rather than left as
 * `z.array(z.unknown())`. A first pass used the permissive form that
 * `simulation.ts` established, and the compiler rejected it: `unknown[]` does
 * not satisfy `WallSegment[]`, and `Record<string, unknown>` does not satisfy
 * `PhysicsSetup`. Casting past that would have reinstated exactly the hole this
 * file exists to close, so the shapes are spelled out.
 *
 * Array lengths are bounded as well, so a payload cannot turn into unbounded
 * meshing work.
 */

/** Metres. Strictly positive — a zero-extent room has no grid. */
const extentMSchema = z.number().finite().positive().max(1000);

/** Metres. Zero is valid: many rooms have no raised floor or plenum. */
const optionalExtentMSchema = z.number().finite().nonnegative().max(100);

/**
 * Metres per cell. Strictly positive because it is the divisor on every axis,
 * and bounded below so a very small value cannot request an enormous grid.
 */
const cellSizeSchema = z.number().finite().min(0.01).max(10);

const finite = z.number().finite();
const vec3Schema = z.object({ x: finite, y: finite, z: finite });
const point2Schema = z.object({ x: finite, y: finite });

/** Extents in metres. Positive: a zero-extent solid occupies no cells. */
const dimensionMSchema = z.number().finite().positive().max(1000);
/** Degrees. */
const orientationSchema = z.number().finite().min(-360).max(360);

const wallSegmentSchema = z.object({
  start: point2Schema,
  end: point2Schema,
  height: dimensionMSchema,
  thermalBC: z.enum(['adiabatic', 'fixed_temp', 'heat_flux']),
  fixedTempC: finite.min(-100).max(300).optional(),
  heatFluxWm2: finite.min(-100_000).max(100_000).optional(),
});

const hvacUnitSchema = z.object({
  id: z.string().trim().min(1).max(200),
  type: z.enum(['crac', 'crah', 'ahu', 'in_row', 'rear_door', 'vent_duct']),
  name: z.string().trim().min(1).max(200),
  position: vec3Schema,
  width: dimensionMSchema,
  depth: dimensionMSchema,
  height: dimensionMSchema,
  capacityKW: finite.nonnegative().max(100_000),
  capacityTR: finite.nonnegative().max(30_000),
  airflowCFM: finite.nonnegative().max(10_000_000),
  supplyTempC: finite.min(-50).max(100),
  returnTempC: finite.min(-50).max(100),
  orientation: orientationSchema,
  powerInputKW: finite.nonnegative().max(100_000),
  status: z.enum(['active', 'standby', 'failed']),
});

const serverRackSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  position: vec3Schema,
  width: dimensionMSchema,
  depth: dimensionMSchema,
  height: dimensionMSchema,
  powerDensity: z.enum(['low', 'medium', 'high', 'ultra']),
  powerKW: finite.nonnegative().max(10_000),
  airflowCFM: finite.nonnegative().max(1_000_000),
  orientation: orientationSchema,
  rackUnits: z.number().int().nonnegative().max(100),
  filledUnits: z.number().int().nonnegative().max(100),
});

const perforatedTileSchema = z.object({
  x: finite,
  y: finite,
  /** Fraction, not percent, despite the field name. */
  openArea: finite.min(0).max(1),
  tileSize: dimensionMSchema,
});

const roomObstructionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().max(200),
  position: vec3Schema,
  width: dimensionMSchema,
  depth: dimensionMSchema,
  height: dimensionMSchema,
  heatOutputW: finite.nonnegative().max(1_000_000),
});

export const geometryInputSchema = z.object({
  roomId: z.string().trim().min(1).max(200),
  lengthM: extentMSchema,
  widthM: extentMSchema,
  heightM: extentMSchema,
  raisedFloorHeightM: optionalExtentMSchema.default(0),
  ceilingPlenumHeightM: optionalExtentMSchema.default(0),
  walls: z.array(wallSegmentSchema).max(5000).default([]),
  hvacUnits: z.array(hvacUnitSchema).max(5000).default([]),
  racks: z.array(serverRackSchema).max(5000).default([]),
  tiles: z.array(perforatedTileSchema).max(50_000).default([]),
  obstructions: z.array(roomObstructionSchema).max(5000).default([]),
});

const physicsSchema = z.object({
  flowType: z.literal('incompressible'),
  buoyancy: z.boolean(),
  turbulenceModel: z.enum(['laminar', 'k-epsilon', 'k-omega-sst', 'realizable-k-epsilon']),
  radiationModel: z.enum(['none', 'p1', 'discrete-ordinates']),
  humidityTransport: z.boolean(),
  referenceTemperatureC: finite.min(-100).max(300),
  referencePressurePa: finite.positive().max(10_000_000),
  gravity: vec3Schema,
  /** All strictly positive: each is a denominator or a scaling factor in the
   *  transport equations, and a zero collapses or diverges the solve. */
  fluid: z.object({
    density: finite.positive().max(10_000),
    viscosity: finite.positive().max(1000),
    specificHeat: finite.positive().max(100_000),
    thermalConductivity: finite.positive().max(10_000),
    thermalExpansionCoeff: finite.positive().max(1),
    prandtlNumber: finite.positive().max(1000),
  }),
});

const solverSchema = z.object({
  algorithm: z.enum(['SIMPLE', 'SIMPLEC', 'PISO']),
  maxIterations: z.number().int().positive().max(1_000_000),
  /** Residual threshold. Positive — zero never converges. */
  convergenceTarget: finite.positive().max(1),
  relaxation: z.object({
    pressure: finite.positive().max(1),
    velocity: finite.positive().max(1),
    temperature: finite.positive().max(1),
    turbulence: finite.positive().max(1),
  }),
  /** Seconds. Positive — a zero step advances nothing. */
  timeStepS: finite.positive().max(3600),
  maxCFL: finite.positive().max(1000),
  adaptiveTimeStep: z.boolean(),
});

const runSourceSchema = z.enum(['internal', 'openfoam', 'simflow']);
const simulationScopeSchema = z.enum(['room', 'building']);

export const createSimulationCaseSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    description: z.string().max(5000).default(''),
    simulationScope: simulationScopeSchema.default('room'),
    runSource: runSourceSchema.default('internal'),
    cellSize: cellSizeSchema.optional(),
    /**
     * Required for a room-scope case. A building-scope case derives its
     * geometry from the project instead, so the refinement below enforces the
     * dependency rather than making the field unconditionally required.
     */
    geometry: geometryInputSchema.optional(),
    physics: physicsSchema.optional(),
    solver: solverSchema.optional(),
  })
  .refine((body) => body.simulationScope === 'building' || body.geometry !== undefined, {
    message: 'A room-scope case requires geometry.',
    path: ['geometry'],
  });

export const updateSimulationCaseSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(5000).optional(),
    cellSize: cellSizeSchema.optional(),
    geometry: geometryInputSchema.optional(),
    physics: physicsSchema.optional(),
    solver: solverSchema.optional(),
    rebuildGeometry: z.boolean().optional(),
    rebuildBuildingGeometryFromProject: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update.',
  });

/** POST .../run — selects which solver executes the case. */
export const startRunSchema = z.object({
  source: runSourceSchema.optional(),
});

/** POST .../runs — the Engineering-tier dispatch route. */
export const startEngineeringRunSchema = z.object({
  solverBackend: z.enum(['preview', 'engineering']).optional(),
});

/** POST .../import — results produced outside this system. */
export const importResultsSchema = z.object({
  fields: z.record(z.string(), z.unknown()),
  source: runSourceSchema.default('openfoam'),
});

export type CreateSimulationCaseBody = z.infer<typeof createSimulationCaseSchema>;
export type UpdateSimulationCaseBody = z.infer<typeof updateSimulationCaseSchema>;
