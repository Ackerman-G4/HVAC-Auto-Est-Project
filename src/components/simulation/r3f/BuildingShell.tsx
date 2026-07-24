'use client';

/**
 * BuildingShell — the room envelope (plan §5.2). Core version: a translucent
 * box + wireframe of the room extents. The extruded-per-room wall-thickness
 * treatment is a later enhancement; this establishes spatial context and the
 * ground plane the other layers sit in.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { ViewerModel } from './viewer-model';

export default function BuildingShell({ model }: { model: ViewerModel }) {
  const [ex, ey, ez] = model.extents;
  const center = useMemo<[number, number, number]>(() => [ex / 2, ey / 2, ez / 2], [ex, ey, ez]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(ex, ey, ez)), [ex, ey, ez]);

  return (
    <group>
      {/* Room envelope */}
      <mesh position={center}>
        <boxGeometry args={[ex, ey, ez]} />
        <meshStandardMaterial
          color="#8fa3b0"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments position={center}>
        <primitive object={edges} attach="geometry" />
        <lineBasicMaterial color="#5b6b78" transparent opacity={0.6} />
      </lineSegments>
      {/* Floor grid */}
      <gridHelper args={[Math.max(ex, ez), Math.max(2, Math.round(Math.max(ex, ez)))]} position={[ex / 2, 0.001, ez / 2]} />
    </group>
  );
}
