/**
 * TEMPORARY debug utility for the CFD scene fix (WS1–WS6).
 * Dumps every scene object's world position + derived scene grounding so the
 * fix can be verified numerically (e.g. all floor-mounted items bboxMinY = 0).
 *
 * REMOVE before the final commit (WS7). Guarded to no-op in production.
 */
import type { ServerRack, HVACUnit, PerforatedTile } from '@/types/simulation';
import type { DomainConfig } from './scene-transform';
import { getDomainCenter } from './scene-transform';

interface SceneDumpInput {
  label?: string;
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  tiles: PerforatedTile[];
  config: DomainConfig;
  camera?: { position?: [number, number, number]; target?: [number, number, number] };
}

export function dumpSceneDebug(input: SceneDumpInput): void {
  if (process.env.NODE_ENV === 'production') return;
  if (typeof console === 'undefined') return;

  const { centerX, centerZ } = getDomainCenter(input.config);

  const rows = [
    ...input.racks.map((r) => ({
      id: r.id,
      type: 'rack',
      x: round(r.position.x),
      y: round(r.position.y),
      z: round(r.position.z),
      bboxMinY: round(r.position.z), // floor-mounted: scene-Y base = position.z
      w: r.width,
      d: r.depth,
      h: r.height,
    })),
    ...input.hvacUnits.map((u) => ({
      id: u.id,
      type: `hvac:${u.type}`,
      x: round(u.position.x),
      y: round(u.position.y),
      z: round(u.position.z),
      bboxMinY: round(u.position.z),
      w: u.width,
      d: u.depth,
      h: u.height,
    })),
    ...input.tiles.map((t, i) => ({
      id: `tile-${i}`,
      type: 'tile',
      x: round(t.x),
      y: round(t.y),
      z: 0,
      bboxMinY: 0,
      w: t.tileSize,
      d: t.tileSize,
      h: 0,
    })),
  ];

  console.groupCollapsed(`[scene-dump] ${input.label ?? ''} (${rows.length} objects)`);
  console.table(rows);
  console.table([
    {
      gridSizeX: input.config.gridSizeX,
      gridSizeY: input.config.gridSizeY,
      gridSizeZ: input.config.gridSizeZ,
      res: input.config.gridResolution,
      centerX: round(centerX),
      centerZ: round(centerZ),
    },
  ]);
  if (input.camera) {
    console.table([
      {
        camX: fmt(input.camera.position?.[0]),
        camY: fmt(input.camera.position?.[1]),
        camZ: fmt(input.camera.position?.[2]),
        tgtX: fmt(input.camera.target?.[0]),
        tgtY: fmt(input.camera.target?.[1]),
        tgtZ: fmt(input.camera.target?.[2]),
      },
    ]);
  }
  console.groupEnd();
}

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function fmt(n: number | undefined): number | string {
  return typeof n === 'number' ? round(n) : '—';
}
