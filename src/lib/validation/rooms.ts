import { z } from 'zod';

/**
 * Request shapes for the rooms endpoints.
 *
 * These replace `body.<field> || <fallback>` defaulting inside the handlers.
 * That idiom is not equivalent to a default: `||` fires on every falsy value,
 * so a legitimately-supplied `0` is silently overwritten. Two of the fields it
 * guarded are loads that feed the cooling calculation —
 * `lightingDensity: 0` became 15 W/m² and `equipmentLoad: 0` became 10 W/m²,
 * inflating the load, the equipment sizing and the BOQ total for any room a
 * user genuinely modelled as unlit or unoccupied by equipment.
 *
 * `.default()` fires only when the key is absent or `undefined`, which is the
 * behaviour the handlers were reaching for.
 */

/** Mirrors `SpaceType` in src/types/project.ts. */
export const spaceTypeSchema = z.enum([
  'office', 'open_office', 'private_office', 'conference', 'lobby', 'retail',
  'restaurant', 'kitchen', 'hotel_room', 'server_room', 'corridor', 'restroom',
  'storage', 'residential', 'classroom', 'hospital_ward', 'operating_room',
  'gym', 'theater', 'warehouse', 'parking', 'mechanical', 'utility',
]);

export const windowOrientationSchema = z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'HORIZONTAL']);

/**
 * A polygon vertex. Kept permissive on bounds — the handler runs
 * `derivePolygonMetrics`, which owns the geometric validity rules (self
 * intersection, minimum vertex count) that a schema cannot express.
 */
const polygonPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const polygonSchema = z.array(polygonPointSchema).max(2000);

/**
 * Physical bounds, not arbitrary limits.
 *
 * Ceiling height is capped at 30m (taller than any plausible conditioned
 * space) and floored above zero because a zero-height room has no volume and
 * would divide to Infinity downstream. Area and perimeter are non-negative;
 * zero is allowed because a room may be created before its polygon is drawn.
 */
const roomBodyShape = {
  name: z.string().trim().min(1).max(200).default('New Room'),
  spaceType: spaceTypeSchema.default('office'),

  floorNumber: z.number().int().min(-10).max(200).default(1),
  floorName: z.string().trim().min(1).max(200).optional(),

  area: z.number().finite().nonnegative().max(1_000_000).optional(),
  perimeter: z.number().finite().nonnegative().max(1_000_000).optional(),
  polygon: polygonSchema.optional(),

  ceilingHeight: z.number().finite().positive().max(30).optional(),

  wallConstruction: z.string().trim().min(1).max(100).default('concrete_block_200mm'),
  windowType: z.string().trim().min(1).max(100).default('single_clear_6mm'),
  windowArea: z.number().finite().nonnegative().max(100_000).default(0),
  windowOrientation: windowOrientationSchema.default('N'),

  occupantCount: z.number().int().nonnegative().max(100_000).default(0),
  /** W/m². A supplied 0 must survive — see the module note. */
  lightingDensity: z.number().finite().nonnegative().max(1000).default(15),
  /** W/m². A supplied 0 must survive — see the module note. */
  equipmentLoad: z.number().finite().nonnegative().max(10_000).default(10),
  hasRoofExposure: z.boolean().default(false),
  notes: z.string().max(5000).default(''),

  /**
   * Dual-control overrides. `null` clears an override, which is distinct from
   * omitting the key, so nullable and optional are both meaningful here.
   */
  userTrOverride: z.number().finite().nonnegative().max(100_000).nullable().optional(),
  userBtuOverride: z.number().finite().nonnegative().max(1_000_000_000).nullable().optional(),
  overrideReason: z.string().max(2000).default(''),
};

export const createRoomSchema = z.object(roomBodyShape);

/**
 * Update accepts the same fields, all optional — a PATCH must not reset
 * unmentioned fields to their creation defaults.
 */
export const updateRoomSchema = z
  .object({
    name: roomBodyShape.name.removeDefault().optional(),
    spaceType: spaceTypeSchema.optional(),
    area: roomBodyShape.area,
    perimeter: roomBodyShape.perimeter,
    polygon: polygonSchema.optional(),
    ceilingHeight: roomBodyShape.ceilingHeight,
    wallConstruction: roomBodyShape.wallConstruction.removeDefault().optional(),
    windowType: roomBodyShape.windowType.removeDefault().optional(),
    windowArea: roomBodyShape.windowArea.removeDefault().optional(),
    windowOrientation: windowOrientationSchema.optional(),
    occupantCount: roomBodyShape.occupantCount.removeDefault().optional(),
    lightingDensity: roomBodyShape.lightingDensity.removeDefault().optional(),
    equipmentLoad: roomBodyShape.equipmentLoad.removeDefault().optional(),
    hasRoofExposure: roomBodyShape.hasRoofExposure.removeDefault().optional(),
    notes: roomBodyShape.notes.removeDefault().optional(),
    userTrOverride: roomBodyShape.userTrOverride,
    userBtuOverride: roomBodyShape.userBtuOverride,
    overrideReason: roomBodyShape.overrideReason.removeDefault().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type CreateRoomBody = z.infer<typeof createRoomSchema>;
export type UpdateRoomBody = z.infer<typeof updateRoomSchema>;
