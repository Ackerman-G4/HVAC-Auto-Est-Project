'use client';

/**
 * CFDOverlay3D — Three.js overlay for CFD simulation data
 *
 * Renders:
 * - Instanced heatmap cells (temperature/pressure/humidity)
 * - Instanced velocity arrows (streamlines)
 * - GPU-instanced animated particles for airflow visualization
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimulationResult } from '@/types/simulation';

// ─── Color Mapping ──────────────────────────────────────────────────

function valueToColor(value: number, min: number, max: number): THREE.Color {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  // Blue → Cyan → Green → Yellow → Red
  if (ratio < 0.25) return new THREE.Color(0, ratio / 0.25, 1);
  if (ratio < 0.5) return new THREE.Color(0, 1, 1 - (ratio - 0.25) / 0.25);
  if (ratio < 0.75) return new THREE.Color((ratio - 0.5) / 0.25, 1, 0);
  return new THREE.Color(1, 1 - (ratio - 0.75) / 0.25, 0);
}

// ─── Heatmap Slice ──────────────────────────────────────────────────

interface HeatmapProps {
  result: SimulationResult;
  sliceZ: number;
  viewMode: 'temperature' | 'velocity' | 'pressure' | 'humidity';
}

export function HeatmapSlice({ result, sliceZ, viewMode }: HeatmapProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { config } = result;
  const res = config.gridResolution;
  const count = config.gridSizeX * config.gridSizeY;

  const { matrices, colors } = useMemo(() => {
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];

    const field = viewMode === 'temperature' ? result.temperatureField
      : viewMode === 'pressure' ? result.pressureField
      : viewMode === 'humidity' ? result.humidityField
      : null;

    let minVal = Infinity, maxVal = -Infinity;

    if (viewMode === 'velocity') {
      for (let x = 0; x < config.gridSizeX; x++) {
        for (let y = 0; y < config.gridSizeY; y++) {
          const v = result.velocityField[x]?.[y]?.[sliceZ];
          if (v) {
            const speed = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
            minVal = Math.min(minVal, speed);
            maxVal = Math.max(maxVal, speed);
          }
        }
      }
    } else if (field) {
      for (let x = 0; x < config.gridSizeX; x++) {
        for (let y = 0; y < config.gridSizeY; y++) {
          const val = field[x]?.[y]?.[sliceZ];
          if (typeof val === 'number') {
            minVal = Math.min(minVal, val);
            maxVal = Math.max(maxVal, val);
          }
        }
      }
    }

    if (!isFinite(minVal)) minVal = 0;
    if (!isFinite(maxVal)) maxVal = minVal + 1;

    const centerX = (config.gridSizeX * res) / 2;
    const centerY = (config.gridSizeY * res) / 2;
    const matrix = new THREE.Matrix4();

    for (let x = 0; x < config.gridSizeX; x++) {
      for (let y = 0; y < config.gridSizeY; y++) {
        let value: number;
        if (viewMode === 'velocity') {
          const v = result.velocityField[x]?.[y]?.[sliceZ];
          value = v ? Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2) : 0;
        } else {
          value = field?.[x]?.[y]?.[sliceZ] ?? minVal;
        }

        matrix.makeTranslation(
          x * res - centerX + res / 2,
          sliceZ * res,
          y * res - centerY + res / 2,
        );
        matrix.scale(new THREE.Vector3(res * 0.95, 0.05, res * 0.95));
        mats.push(matrix.clone());
        cols.push(valueToColor(value, minVal, maxVal));
      }
    }

    return { matrices: mats, colors: cols };
  }, [result, sliceZ, viewMode, config, res]);

  // Apply instance data
  useMemo(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const colorAttr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      colorAttr[i * 3] = colors[i].r;
      colorAttr[i * 3 + 1] = colors[i].g;
      colorAttr[i * 3 + 2] = colors[i].b;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colorAttr, 3));
  }, [matrices, colors, count]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial transparent opacity={0.4} vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

// ─── Velocity Arrows ────────────────────────────────────────────────

interface ArrowsProps {
  result: SimulationResult;
  sliceZ: number;
}

export function VelocityArrows({ result, sliceZ }: ArrowsProps) {
  const { config } = result;
  const res = config.gridResolution;
  const step = Math.max(1, Math.floor(config.gridSizeX / 20)); // subsample for performance

  const arrows = useMemo(() => {
    const items: { pos: THREE.Vector3; dir: THREE.Vector3; speed: number }[] = [];
    const centerX = (config.gridSizeX * res) / 2;
    const centerY = (config.gridSizeY * res) / 2;
    const maxVel = Math.max(result.metrics.maxVelocity, 0.1);

    for (let x = 0; x < config.gridSizeX; x += step) {
      for (let y = 0; y < config.gridSizeY; y += step) {
        const vel = result.velocityField[x]?.[y]?.[sliceZ];
        if (!vel) continue;
        const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
        if (speed < 0.03) continue;

        items.push({
          pos: new THREE.Vector3(
            x * res - centerX + res / 2,
            sliceZ * res,
            y * res - centerY + res / 2,
          ),
          dir: new THREE.Vector3(vel.x, vel.z, vel.y).normalize(),
          speed: speed / maxVel,
        });
      }
    }
    return items;
  }, [result, sliceZ, config, res, step]);

  return (
    <group>
      {arrows.map((arrow, i) => {
        const color = valueToColor(arrow.speed, 0, 1);
        const length = 0.3 + arrow.speed * 0.7;
        return (
          <arrowHelper
            key={i}
            args={[arrow.dir, arrow.pos, length, color.getHex(), 0.15, 0.08]}
          />
        );
      })}
    </group>
  );
}

// ─── Animated Particles ─────────────────────────────────────────────

interface ParticlesProps {
  result: SimulationResult;
  count?: number;
}

export function AirflowParticles({ result, count = 500 }: ParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { config } = result;
  const res = config.gridResolution;
  const centerX = (config.gridSizeX * res) / 2;
  const centerY = (config.gridSizeY * res) / 2;

  // Initialize particle state
  const particleState = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lives = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const gx = Math.floor(Math.random() * config.gridSizeX);
      const gy = Math.floor(Math.random() * config.gridSizeY);
      const gz = Math.floor(Math.random() * config.gridSizeZ);
      const vel = result.velocityField[gx]?.[gy]?.[gz];

      positions[i * 3] = gx * res - centerX;
      positions[i * 3 + 1] = gz * res;
      positions[i * 3 + 2] = gy * res - centerY;
      velocities[i * 3] = vel?.x ?? 0;
      velocities[i * 3 + 1] = vel?.z ?? 0;
      velocities[i * 3 + 2] = vel?.y ?? 0;
      lives[i] = Math.random() * 100;
    }

    return { positions, velocities, lives };
  }, [result, count, config, res, centerX, centerY]);

  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const colorArr = useMemo(() => new Float32Array(count * 3), [count]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { positions, velocities, lives } = particleState;
    const maxX = config.gridSizeX * res;
    const maxY = config.gridSizeY * res;
    const maxZ = config.gridSizeZ * res;
    const dt = Math.min(delta, 0.05);

    for (let i = 0; i < count; i++) {
      positions[i * 3] += velocities[i * 3] * dt * 2;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt * 2;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt * 2;
      lives[i] += dt * 10;

      // Respawn out-of-bounds or old particles
      const wx = positions[i * 3] + centerX;
      const wy = positions[i * 3 + 2] + centerY;
      const wz = positions[i * 3 + 1];

      if (lives[i] > 100 || wx < 0 || wx > maxX || wy < 0 || wy > maxY || wz < 0 || wz > maxZ) {
        const gx = Math.floor(Math.random() * config.gridSizeX);
        const gy = Math.floor(Math.random() * config.gridSizeY);
        const gz = Math.floor(Math.random() * config.gridSizeZ);
        const vel = result.velocityField[gx]?.[gy]?.[gz];

        positions[i * 3] = gx * res - centerX;
        positions[i * 3 + 1] = gz * res;
        positions[i * 3 + 2] = gy * res - centerY;
        velocities[i * 3] = vel?.x ?? 0;
        velocities[i * 3 + 1] = vel?.z ?? 0;
        velocities[i * 3 + 2] = vel?.y ?? 0;
        lives[i] = 0;
      }

      // Update velocity from grid
      const gx = Math.floor(Math.max(0, Math.min(config.gridSizeX - 1, (positions[i * 3] + centerX) / res)));
      const gy = Math.floor(Math.max(0, Math.min(config.gridSizeY - 1, (positions[i * 3 + 2] + centerY) / res)));
      const gz = Math.floor(Math.max(0, Math.min(config.gridSizeZ - 1, positions[i * 3 + 1] / res)));
      const vel = result.velocityField[gx]?.[gy]?.[gz];
      if (vel) {
        velocities[i * 3] = vel.x;
        velocities[i * 3 + 1] = vel.z;
        velocities[i * 3 + 2] = vel.y;
      }

      // Temperature-based color
      const temp = result.temperatureField[gx]?.[gy]?.[gz] ?? config.ambientTempC;
      const color = valueToColor(temp, result.metrics.minTemperature, result.metrics.maxTemperature);
      colorArr[i * 3] = color.r;
      colorArr[i * 3 + 1] = color.g;
      colorArr[i * 3 + 2] = color.b;

      // Scale by alpha (life)
      const alpha = Math.max(0.1, 1 - lives[i] / 100);
      const size = 0.04 * alpha;
      tempMatrix.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      tempMatrix.scale(new THREE.Vector3(size, size, size));
      mesh.setMatrixAt(i, tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    const geo = mesh.geometry;
    if (!geo.getAttribute('color') || geo.getAttribute('color').count !== count) {
      geo.setAttribute('color', new THREE.InstancedBufferAttribute(colorArr, 3));
    } else {
      (geo.getAttribute('color') as THREE.InstancedBufferAttribute).set(colorArr);
      (geo.getAttribute('color') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial vertexColors transparent opacity={0.8} toneMapped={false} />
    </instancedMesh>
  );
}
