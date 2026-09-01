import { z } from 'zod';

/**
 * Request shape for the simulation layout autosave.
 *
 * The handler destructured five fields off an unparsed body and hand-checked
 * three of them: `floorId` for being a non-empty string, `hvacPlacements` and
 * `tilePlacements` for being arrays. Nothing checked what was *inside* those
 * arrays, and they are written straight to Firestore by `serializeHVAC` /
 * `serializeTile`, which read `h.position.x` without asking whether `position`
 * exists — a placement missing it throws inside the store rather than being
 * rejected at the boundary.
 *
 * This endpoint is the viewer's debounced autosave, so it fires on every drag.
 * A malformed payload here corrupts the persisted layout for a floor.
 */

const finite = z.number().finite();
const vec3Schema = z.object({ x: finite, y: finite, z: finite });

const hvacPlacementSchema = z.object({
  id: z.string().trim().min(1).max(200),
  type: z.enum(['crac', 'crah', 'ahu', 'in_row', 'rear_door', 'vent_duct']),
  label: z.string().trim().max(200),
  position: vec3Schema,
  orientation: finite.min(-360).max(360),
  capacityKW: finite.nonnegative().max(100_000),
  airflowCFM: finite.nonnegative().max(10_000_000),
});

const tilePlacementSchema = z.object({
  id: z.string().trim().min(1).max(200),
  x: finite,
  y: finite,
  /** Fraction, not percent. */
  openArea: finite.min(0).max(1),
  tileSize: finite.positive().max(10),
});

/**
 * An inter-room airflow connection the user has overridden.
 *
 * `type` is deliberately a free string: the stored type is
 * `AirConnectionType | string`, so the model already accepts values outside the
 * known set and narrowing it here would reject layouts the app itself writes.
 */
const connectionOverrideSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  fromRoomId: z.string().trim().min(1).max(200),
  toRoomId: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(100),
  /** Square metres. Zero is valid — a sealed connection. */
  openingAreaM2: finite.nonnegative().max(100_000),
  resistance: finite.nonnegative().max(1_000_000),
  enabled: z.boolean().optional(),
});

export const saveSimulationLayoutSchema = z.object({
  floorId: z.string().trim().min(1).max(200),
  hvacPlacements: z.array(hvacPlacementSchema).max(5000),
  tilePlacements: z.array(tilePlacementSchema).max(50_000),
  /**
   * Pixels per metre. Strictly positive: the viewer divides plan coordinates by
   * it, so a zero scale sends every placement to Infinity. The handler
   * previously accepted any number and fell back to 50 for a non-number, which
   * let a zero through.
   */
  canvasScale: finite.positive().max(10_000).default(50),
  connectionOverrides: z.array(connectionOverrideSchema).max(5000).optional(),
});

export type SaveSimulationLayoutBody = z.infer<typeof saveSimulationLayoutSchema>;
