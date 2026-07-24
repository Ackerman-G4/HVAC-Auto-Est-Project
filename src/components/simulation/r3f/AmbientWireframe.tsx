'use client';

/**
 * AmbientWireframe (plan §Phase 2). A lightweight, ambient R3F scene for empty
 * states — a slowly rotating jade wireframe room with a supply diffuser ring and
 * a few drifting air points. Reuses the same renderer as the real viewer but
 * carries no data; it exists purely to make the zero state feel alive instead of
 * showing a dead grey cube. Rotation/drift pause under prefers-reduced-motion.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '@/lib/ui/motion';

const JADE = '#2bb89d';
const INK = '#5b8fc7';

function Room({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const points = useMemo(() => {
    // Deterministic scatter so SSR/CSR match and it doesn't flicker on re-render.
    const rng = mulberry32(0x51ed);
    return Array.from({ length: 14 }, () => ({
      base: new THREE.Vector3((rng() - 0.5) * 2.4, (rng() - 0.5) * 1.4, (rng() - 0.5) * 2.4),
      speed: 0.4 + rng() * 0.8,
      phase: rng() * Math.PI * 2,
    }));
  }, []);
  const dots = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = t * 0.18;
      group.current.rotation.x = Math.sin(t * 0.12) * 0.12;
    }
    if (dots.current) {
      dots.current.children.forEach((child, i) => {
        const p = points[i];
        child.position.y = p.base.y + Math.sin(t * p.speed + p.phase) * 0.35;
      });
    }
  });

  return (
    <group ref={group}>
      {/* Room shell */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(3, 1.9, 3)]} />
        <lineBasicMaterial color={JADE} transparent opacity={0.85} />
      </lineSegments>
      {/* Inner volume hint */}
      <mesh>
        <boxGeometry args={[3, 1.9, 3]} />
        <meshBasicMaterial color={JADE} transparent opacity={0.04} depthWrite={false} />
      </mesh>
      {/* Ceiling supply diffuser ring */}
      <mesh position={[0, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.03, 12, 40]} />
        <meshBasicMaterial color={INK} transparent opacity={0.7} />
      </mesh>
      {/* Drifting air points */}
      <group ref={dots}>
        {points.map((p, i) => (
          <mesh key={i} position={p.base.toArray()}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial color={i % 3 === 0 ? INK : JADE} transparent opacity={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Small deterministic PRNG (matches the jet-seeding test helper).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function AmbientWireframe({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div className={className} style={{ width: '100%', height: '100%' }} aria-hidden="true">
      <Canvas camera={{ position: [4.2, 2.6, 5], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.8} />
        <Room reduced={reduced} />
      </Canvas>
    </div>
  );
}
