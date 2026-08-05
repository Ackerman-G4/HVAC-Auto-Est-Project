'use client';

/**
 * SimulationCanvas — the React Three Fiber viewer (plan §5).
 *
 * Strangler entry point: mounts alongside the legacy raw-Three.js viewer behind
 * a toggle. Each layer is a component taking the derived ViewerModel as props
 * and nothing else — solver-agnostic by construction (plan §5.1). The old viewer
 * is only retired once this reaches the parity checklist (geometry, temperature,
 * velocity, hotspots, camera, mobile touch).
 *
 * Advanced layers (particles, hotspots, section plane, comfort overlay — plan
 * §5.2/P5) are intentionally not yet wired; the composition below is the seam
 * they slot into.
 */

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useThemeColor } from '@/lib/ui/use-theme-color';
import type { SimulationResult } from '@/types/simulation';
import { deriveViewerModel } from './viewer-model';
import BuildingShell from './BuildingShell';
import TemperatureVolume from './TemperatureVolume';
import VelocityGlyphs from './VelocityGlyphs';

export interface SimulationCanvasProps {
  result: SimulationResult | null;
  showTemperature?: boolean;
  showVelocity?: boolean;
  glyphStride?: number;
  className?: string;
}

export default function SimulationCanvas({
  result,
  showTemperature = true,
  showVelocity = true,
  glyphStride = 1,
  className,
}: SimulationCanvasProps) {
  const model = useMemo(() => (result ? deriveViewerModel(result) : null), [result]);
  // Before the early return: this is a hook, and the scene must follow the
  // theme rather than staying near-black on a light page.
  const sceneBackground = useThemeColor('--canvas-bg', '#0b1013');

  if (!model) {
    return (
      <div className={className} style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
        <p className="text-xs text-muted-foreground">No result loaded — run a simulation to view the field.</p>
      </div>
    );
  }

  const [ex, ey, ez] = model.extents;
  const target: [number, number, number] = [ex / 2, ey / 2, ez / 2];
  const camDist = Math.max(ex, ey, ez) * 1.8 + 2;

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <Canvas
        camera={{ position: [ex / 2 + camDist, ey + camDist * 0.6, ez / 2 + camDist], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={[sceneBackground]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[ex, ey * 3 + 5, ez]} intensity={0.8} />
        <Suspense fallback={<Html center><span className="text-xs text-muted-foreground">Loading…</span></Html>}>
          <BuildingShell model={model} />
          {showTemperature && <TemperatureVolume model={model} />}
          {showVelocity && <VelocityGlyphs model={model} stride={glyphStride} />}
        </Suspense>
        <OrbitControls target={target} makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>
    </div>
  );
}
