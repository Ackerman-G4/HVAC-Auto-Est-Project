/**
 * Single source of truth for CFD domain ↔ 3D-scene coordinate math.
 *
 * Canonical world convention (matches the solver and the renderer comment in
 * AirflowViewer3D): `position.x` = floor horizontal (m), `position.y` = floor
 * depth (m), `position.z` = elevation (m). The R3F scene is Y-up, so world
 * (x, y, z) maps to scene (x, z, y), re-centered so the domain centre sits at
 * the scene origin.
 *
 * Every component that draws domain-space geometry MUST derive its centre via
 * `getDomainCenter` rather than recomputing `(gridSize * res) / 2` inline.
 */
import type { Vec3 } from '@/types/simulation';

export interface DomainConfig {
  gridSizeX: number;
  gridSizeY: number;
  gridSizeZ: number;
  gridResolution: number;
}

/**
 * Centre offsets that translate corner-origin domain metres so the domain
 * centre lands at the scene origin. `centerX` shifts world-x (scene X),
 * `centerZ` shifts world-y/floor-depth (scene Z).
 */
export function getDomainCenter(
  config: Pick<DomainConfig, 'gridSizeX' | 'gridSizeY' | 'gridResolution'>,
): { centerX: number; centerZ: number } {
  return {
    centerX: (config.gridSizeX * config.gridResolution) / 2,
    centerZ: (config.gridSizeY * config.gridResolution) / 2,
  };
}

/**
 * World-space (metres, floor = x/y, elevation = z) → R3F scene tuple [x, y, z]
 * (Y-up), centred on the domain.
 */
export function worldToScene(
  p: Vec3,
  config: Pick<DomainConfig, 'gridSizeX' | 'gridSizeY' | 'gridResolution'>,
): [number, number, number] {
  const { centerX, centerZ } = getDomainCenter(config);
  return [p.x - centerX, p.z, p.y - centerZ];
}

/**
 * Axis-aligned bounding box of the whole simulation domain in scene space.
 * Floor spans ±centre on X/Z; elevation spans 0..gridSizeZ*res on Y.
 */
export function getDomainBBox(config: DomainConfig): { min: Vec3; max: Vec3 } {
  const { centerX, centerZ } = getDomainCenter(config);
  const height = config.gridSizeZ * config.gridResolution;
  return {
    min: { x: -centerX, y: 0, z: -centerZ },
    max: { x: centerX, y: height, z: centerZ },
  };
}
