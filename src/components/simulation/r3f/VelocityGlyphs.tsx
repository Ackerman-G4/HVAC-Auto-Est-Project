'use client';

/**
 * VelocityGlyphs — instanced cones oriented along the local velocity vector,
 * length ∝ |U| with a clamped scale (plan §5.2). One draw call for all glyphs.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ViewerModel } from './viewer-model';
import { temperatureColor } from './viewer-model';

interface VelocityGlyphsProps {
  model: ViewerModel;
  /** Show every Nth sample (density-stride control). */
  stride?: number;
  colorByTemperature?: boolean;
}

// Cone points +Y by default; align that to the sample direction.
const UP = new THREE.Vector3(0, 1, 0);

export default function VelocityGlyphs({ model, stride = 1, colorByTemperature = true }: VelocityGlyphsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const samples = useMemo(
    () => model.velocitySamples.filter((_, i) => i % Math.max(1, Math.floor(stride)) === 0 && model.velocitySamples[i].magnitude > 1e-4),
    [model, stride],
  );
  const count = samples.length;
  const glyphLen = Math.max(0.08, model.cellSize * 0.9);
  const vMax = model.velocityMax || 1;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const tRange = model.temperatureRange;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    for (let idx = 0; idx < count; idx++) {
      const s = samples[idx];
      dir.set(s.direction[0], s.direction[1], s.direction[2]);
      quat.setFromUnitVectors(UP, dir);
      const lenScale = 0.35 + 0.65 * Math.min(1, s.magnitude / vMax);
      dummy.position.set(s.position[0], s.position[1], s.position[2]);
      dummy.quaternion.copy(quat);
      dummy.scale.set(1, lenScale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      if (colorByTemperature) {
        const span = (tRange.max - tRange.min) || 1;
        const [r, g, b] = temperatureColor((s.temperature - tRange.min) / span);
        color.setRGB(r, g, b);
      } else {
        color.setRGB(0.85, 0.9, 0.95);
      }
      mesh.setColorAt(idx, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [samples, count, dummy, color, quat, dir, vMax, colorByTemperature, tRange.max, tRange.min]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <coneGeometry args={[glyphLen * 0.28, glyphLen, 8]} />
      <meshStandardMaterial toneMapped={false} metalness={0.1} roughness={0.6} />
    </instancedMesh>
  );
}
