'use client';

/**
 * TemperatureVolume — volumetric temperature layer (plan §5.2).
 *
 * Robust instanced-voxel implementation: one semi-transparent box per sampled
 * cell, coloured by the plan's blue→jade→copper→red transfer function. Rendered
 * as a single InstancedMesh (one draw call). This is deliberately swappable for
 * a Data3DTexture raymarch later — the props (a ViewerModel) stay identical, so
 * only this file changes when the raymarch lands.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ViewerModel } from './viewer-model';
import { temperatureColor } from './viewer-model';

interface TemperatureVolumeProps {
  model: ViewerModel;
  opacity?: number;
}

export default function TemperatureVolume({ model, opacity = 0.14 }: TemperatureVolumeProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = model.temperatureVoxels.length;
  const voxelSize = Math.max(0.05, model.cellSize);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    for (let idx = 0; idx < count; idx++) {
      const voxel = model.temperatureVoxels[idx];
      dummy.position.set(voxel.position[0], voxel.position[1], voxel.position[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      const [r, g, b] = temperatureColor(voxel.t);
      color.setRGB(r, g, b);
      mesh.setColorAt(idx, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [model, count, dummy, color]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <boxGeometry args={[voxelSize, voxelSize, voxelSize]} />
      <meshBasicMaterial
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
