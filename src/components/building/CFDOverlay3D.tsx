'use client';

/**
 * CFDOverlay3D — Three.js overlay for CFD simulation data
 *
 * Renders:
 * - Instanced heatmap cells (temperature/pressure/humidity)
 * - Instanced velocity arrows (streamlines)
 * - GPU-instanced animated particles for airflow visualization
 * - Contour slice planes (horizontal XY, vertical XZ/YZ)
 * - Density-controlled velocity arrow fields
 * - RK4 streamline tubes (TileFlow)
 * - Volumetric temperature fog (TileFlow)
 * - Per-tile airflow overlay (TileFlow)
 * - Alert zone markers (TileFlow)
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { SimulationResult, ContourSliceConfig, StreamlineConfig, TileAirflowData, ThermalAlert } from '@/types/simulation';

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

  // Apply instance data (useEffect because it accesses refs)
  useEffect(() => {
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

  // Mutable particle state — stored in refs for useFrame mutations
  const stateRef = useRef<{ positions: Float32Array; velocities: Float32Array; lives: Float32Array } | null>(null);
  const tempMatrixRef = useRef(new THREE.Matrix4());
  const colorArrRef = useRef(new Float32Array(count * 3));

  // Initialize / reinitialize particle state when simulation changes
  useEffect(() => {
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

    stateRef.current = { positions, velocities, lives };
    colorArrRef.current = new Float32Array(count * 3);
  }, [result, count, config, res, centerX, centerY]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const state = stateRef.current;
    if (!mesh || !state) return;

    const { positions, velocities, lives } = state;
    const colorArr = colorArrRef.current;
    const tempMatrix = tempMatrixRef.current;
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

// ─── Contour Slice Plane ────────────────────────────────────────────

interface ContourSlicePlaneProps {
  result: SimulationResult;
  config: ContourSliceConfig;
}

const COLOR_MAPS: Record<string, (t: number) => THREE.Color> = {
  jet: (t) => valueToColor(t, 0, 1),
  viridis: (t) => {
    const r = Math.max(0, Math.min(1, 0.267 + t * (0.993 - 0.267)));
    const g = Math.max(0, Math.min(1, 0.004 + t * (0.906 - 0.004)));
    const b = Math.max(0, Math.min(1, 0.329 + t * (0.144 - 0.329)));
    return new THREE.Color(r, g, b);
  },
  coolwarm: (t) => {
    const r = t < 0.5 ? 0.23 + t * 1.54 : 1.0;
    const g = t < 0.5 ? 0.3 + t * 1.4 : 1.0 - (t - 0.5) * 2.0;
    const b = t < 0.5 ? 1.0 : 1.0 - (t - 0.5) * 1.54;
    return new THREE.Color(Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)));
  },
  inferno: (t) => {
    const r = Math.max(0, Math.min(1, t * 1.1 - 0.05));
    const g = Math.max(0, Math.min(1, t * 0.9 - 0.1));
    const b = Math.max(0, Math.min(1, 0.02 + t * 0.4 * (1 - t * 0.5)));
    return new THREE.Color(r, g, b);
  },
  plasma: (t) => {
    const r = Math.max(0, Math.min(1, 0.05 + t * 0.95));
    const g = Math.max(0, Math.min(1, t * t));
    const b = Math.max(0, Math.min(1, 0.53 - t * 0.47));
    return new THREE.Color(r, g, b);
  },
};

export function ContourSlicePlane({ result, config: sliceConfig }: ContourSlicePlaneProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { config: simConfig } = result;
  const res = simConfig.gridResolution;

  const { field, orientation, position, colorMap, opacity } = sliceConfig;

  // Determine slice dimensions based on orientation
  const { count, getData } = useMemo(() => {
    const getField = (x: number, y: number, z: number): number => {
      if (field === 'velocity') {
        const v = result.velocityField[x]?.[y]?.[z];
        return v ? Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) : 0;
      }
      const f = field === 'temperature' ? result.temperatureField
        : field === 'pressure' ? result.pressureField
        : field === 'humidity' ? result.humidityField
        : result.temperatureField;
      return f[x]?.[y]?.[z] ?? 0;
    };

    const sliceIdx = Math.max(0, Math.floor(position / res));

    switch (orientation) {
      case 'xy': {
        const k = Math.min(sliceIdx, simConfig.gridSizeZ - 1);
        return {
          cellsU: simConfig.gridSizeX,
          cellsV: simConfig.gridSizeY,
          count: simConfig.gridSizeX * simConfig.gridSizeY,
          getData: () => {
            const vals: { u: number; v: number; val: number }[] = [];
            for (let x = 0; x < simConfig.gridSizeX; x++)
              for (let y = 0; y < simConfig.gridSizeY; y++)
                vals.push({ u: x, v: y, val: getField(x, y, k) });
            return vals;
          },
        };
      }
      case 'xz': {
        const j = Math.min(sliceIdx, simConfig.gridSizeY - 1);
        return {
          cellsU: simConfig.gridSizeX,
          cellsV: simConfig.gridSizeZ,
          count: simConfig.gridSizeX * simConfig.gridSizeZ,
          getData: () => {
            const vals: { u: number; v: number; val: number }[] = [];
            for (let x = 0; x < simConfig.gridSizeX; x++)
              for (let z = 0; z < simConfig.gridSizeZ; z++)
                vals.push({ u: x, v: z, val: getField(x, j, z) });
            return vals;
          },
        };
      }
      case 'yz': {
        const i = Math.min(sliceIdx, simConfig.gridSizeX - 1);
        return {
          cellsU: simConfig.gridSizeY,
          cellsV: simConfig.gridSizeZ,
          count: simConfig.gridSizeY * simConfig.gridSizeZ,
          getData: () => {
            const vals: { u: number; v: number; val: number }[] = [];
            for (let y = 0; y < simConfig.gridSizeY; y++)
              for (let z = 0; z < simConfig.gridSizeZ; z++)
                vals.push({ u: y, v: z, val: getField(i, y, z) });
            return vals;
          },
        };
      }
    }
  }, [result, field, orientation, position, res, simConfig]);

  const { matrices, colors } = useMemo(() => {
    const data = getData();
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];

    let minVal = Infinity, maxVal = -Infinity;
    for (const d of data) {
      if (d.val < minVal) minVal = d.val;
      if (d.val > maxVal) maxVal = d.val;
    }
    if (!isFinite(minVal)) minVal = 0;
    if (!isFinite(maxVal)) maxVal = minVal + 1;

    const colorFn = COLOR_MAPS[colorMap] || COLOR_MAPS.jet;
    const centerX = (simConfig.gridSizeX * res) / 2;
    const centerY = (simConfig.gridSizeY * res) / 2;
    const sliceIdx = Math.floor(position / res);

    const matrix = new THREE.Matrix4();

    for (const d of data) {
      const ratio = (maxVal - minVal) > 0 ? (d.val - minVal) / (maxVal - minVal) : 0;

      let px: number, py: number, pz: number;
      let sx: number, sy: number, sz: number;

      switch (orientation) {
        case 'xy':
          px = d.u * res - centerX + res / 2;
          py = sliceIdx * res;
          pz = d.v * res - centerY + res / 2;
          sx = res * 0.95;
          sy = 0.02;
          sz = res * 0.95;
          break;
        case 'xz':
          px = d.u * res - centerX + res / 2;
          py = d.v * res;
          pz = sliceIdx * res - centerY + res / 2;
          sx = res * 0.95;
          sy = res * 0.95;
          sz = 0.02;
          break;
        case 'yz':
          px = sliceIdx * res - centerX + res / 2;
          py = d.v * res;
          pz = d.u * res - centerY + res / 2;
          sx = 0.02;
          sy = res * 0.95;
          sz = res * 0.95;
          break;
      }

      matrix.makeTranslation(px, py, pz);
      matrix.scale(new THREE.Vector3(sx, sy, sz));
      mats.push(matrix.clone());
      cols.push(colorFn(ratio));
    }

    return { matrices: mats, colors: cols };
  }, [getData, colorMap, orientation, position, res, simConfig]);

  useEffect(() => {
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
      <meshStandardMaterial transparent opacity={opacity} vertexColors toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// ─── Dense Velocity Arrows with Density Control ─────────────────────

interface DenseVelocityArrowsProps {
  result: SimulationResult;
  sliceZ: number;
  /** Fraction 0-1: 0 = sparse, 1 = every cell */
  density?: number;
  /** Arrow scale multiplier */
  scale?: number;
}

export function DenseVelocityArrows({ result, sliceZ, density = 0.3, scale = 1.0 }: DenseVelocityArrowsProps) {
  const { config } = result;
  const res = config.gridResolution;
  // Compute step from density: density=1 → step=1, density=0.1 → step~10
  const step = Math.max(1, Math.round(1 / Math.max(0.01, density)));

  const arrows = useMemo(() => {
    const items: { pos: THREE.Vector3; dir: THREE.Vector3; speed: number; color: THREE.Color }[] = [];
    const centerX = (config.gridSizeX * res) / 2;
    const centerY = (config.gridSizeY * res) / 2;
    const maxVel = Math.max(result.metrics.maxVelocity, 0.1);

    for (let x = 0; x < config.gridSizeX; x += step) {
      for (let y = 0; y < config.gridSizeY; y += step) {
        const vel = result.velocityField[x]?.[y]?.[sliceZ];
        if (!vel) continue;
        const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
        if (speed < 0.01) continue;

        const normSpeed = speed / maxVel;
        const temp = result.temperatureField[x]?.[y]?.[sliceZ] ?? config.ambientTempC;
        const color = valueToColor(temp, result.metrics.minTemperature, result.metrics.maxTemperature);

        items.push({
          pos: new THREE.Vector3(
            x * res - centerX + res / 2,
            sliceZ * res,
            y * res - centerY + res / 2,
          ),
          dir: new THREE.Vector3(vel.x, vel.z, vel.y).normalize(),
          speed: normSpeed,
          color,
        });
      }
    }
    return items;
  }, [result, sliceZ, step, config, res]);

  return (
    <group>
      {arrows.map((arrow, i) => {
        const length = (0.2 + arrow.speed * 0.8) * scale;
        return (
          <arrowHelper
            key={i}
            args={[arrow.dir, arrow.pos, length, arrow.color.getHex(), 0.12 * scale, 0.06 * scale]}
          />
        );
      })}
    </group>
  );
}

// ─── Streamlines (RK4 through velocity field) ──────────────────────

interface StreamlinesProps {
  result: SimulationResult;
  config: StreamlineConfig;
  sliceZ: number;
}

export function Streamlines({ result, config: slCfg, sliceZ }: StreamlinesProps) {
  const { config: simCfg } = result;
  const res = simCfg.gridResolution;
  const centerX = (simCfg.gridSizeX * res) / 2;
  const centerY = (simCfg.gridSizeY * res) / 2;

  const sampleVelocity = (x: number, y: number, z: number): THREE.Vector3 => {
    const gx = Math.floor(Math.max(0, Math.min(simCfg.gridSizeX - 1, x / res)));
    const gy = Math.floor(Math.max(0, Math.min(simCfg.gridSizeY - 1, y / res)));
    const gz = Math.floor(Math.max(0, Math.min(simCfg.gridSizeZ - 1, z / res)));
    const vel = result.velocityField[gx]?.[gy]?.[gz];
    return vel ? new THREE.Vector3(vel.x, vel.z, vel.y) : new THREE.Vector3();
  };

  const sampleScalar = (x: number, y: number, z: number): number => {
    const gx = Math.floor(Math.max(0, Math.min(simCfg.gridSizeX - 1, x / res)));
    const gy = Math.floor(Math.max(0, Math.min(simCfg.gridSizeY - 1, y / res)));
    const gz = Math.floor(Math.max(0, Math.min(simCfg.gridSizeZ - 1, z / res)));
    if (slCfg.colorBy === 'temperature') {
      return result.temperatureField[gx]?.[gy]?.[gz] ?? simCfg.ambientTempC;
    }
    const vel = result.velocityField[gx]?.[gy]?.[gz];
    return vel ? Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2) : 0;
  };

  const lines = useMemo(() => {
    const maxW = simCfg.gridSizeX * res;
    const maxH = simCfg.gridSizeY * res;
    const maxD = simCfg.gridSizeZ * res;
    const seedCount = Math.min(slCfg.seedCount, 50);
    const out: { points: THREE.Vector3[]; values: number[] }[] = [];

    for (let s = 0; s < seedCount; s++) {
      // Seed evenly across the grid at the selected slice height
      const sx = ((s % Math.ceil(Math.sqrt(seedCount))) / Math.ceil(Math.sqrt(seedCount))) * maxW;
      const sy = (Math.floor(s / Math.ceil(Math.sqrt(seedCount))) / Math.ceil(Math.sqrt(seedCount))) * maxH;
      const sz = sliceZ * res;

      const pts: THREE.Vector3[] = [];
      const vals: number[] = [];
      let px = sx, py = sy, pz = sz;

      for (let step = 0; step < slCfg.maxSteps; step++) {
        pts.push(new THREE.Vector3(px - centerX, pz, py - centerY));
        vals.push(sampleScalar(px, py, pz));

        // RK4 integration
        const k1 = sampleVelocity(px, py, pz).multiplyScalar(slCfg.stepSize);
        const k2 = sampleVelocity(px + k1.x * 0.5, py + k1.z * 0.5, pz + k1.y * 0.5).multiplyScalar(slCfg.stepSize);
        const k3 = sampleVelocity(px + k2.x * 0.5, py + k2.z * 0.5, pz + k2.y * 0.5).multiplyScalar(slCfg.stepSize);
        const k4 = sampleVelocity(px + k3.x, py + k3.z, pz + k3.y).multiplyScalar(slCfg.stepSize);

        const dx = (k1.x + 2 * k2.x + 2 * k3.x + k4.x) / 6;
        const dy = (k1.z + 2 * k2.z + 2 * k3.z + k4.z) / 6;
        const dz = (k1.y + 2 * k2.y + 2 * k3.y + k4.y) / 6;

        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-6) break;

        px += dx; py += dy; pz += dz;
        if (px < 0 || px > maxW || py < 0 || py > maxH || pz < 0 || pz > maxD) break;
      }

      if (pts.length >= 3) out.push({ points: pts, values: vals });
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, slCfg.seedCount, slCfg.maxSteps, slCfg.stepSize, slCfg.colorBy, sliceZ]);

  const scalarRange = useMemo(() => {
    if (slCfg.colorBy === 'temperature') {
      return { min: result.metrics.minTemperature, max: result.metrics.maxTemperature };
    }
    return { min: 0, max: Math.max(result.metrics.maxVelocity, 0.1) };
  }, [result.metrics, slCfg.colorBy]);

  return (
    <group>
      {lines.map((line, i) => {
        if (line.points.length < 2) return null;
        const curve = new THREE.CatmullRomCurve3(line.points, false, 'centripetal', 0.5);
        const tubeGeo = new THREE.TubeGeometry(curve, Math.min(line.points.length, 64), slCfg.tubeRadius, 6, false);
        // Average color along the streamline
        const avgVal = line.values.reduce((a, b) => a + b, 0) / line.values.length;
        const color = valueToColor(avgVal, scalarRange.min, scalarRange.max);
        return (
          <mesh key={i} geometry={tubeGeo}>
            <meshStandardMaterial color={color} transparent opacity={0.7} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Volumetric Temperature Fog ─────────────────────────────────────

interface TemperatureFogProps {
  result: SimulationResult;
  opacity?: number;
}

export function TemperatureFog({ result, opacity = 0.35 }: TemperatureFogProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { config } = result;
  const res = config.gridResolution;
  const step = 2; // subsample every 2nd cell
  const countX = Math.ceil(config.gridSizeX / step);
  const countY = Math.ceil(config.gridSizeY / step);
  const countZ = Math.ceil(config.gridSizeZ / step);
  const count = countX * countY * countZ;

  const { matrices, colors, opacities } = useMemo(() => {
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const ops: number[] = [];
    const centerX = (config.gridSizeX * res) / 2;
    const centerY = (config.gridSizeY * res) / 2;
    const minT = result.metrics.minTemperature;
    const maxT = result.metrics.maxTemperature;
    const ambient = config.ambientTempC;
    const range = Math.max(maxT - ambient, 1);
    const matrix = new THREE.Matrix4();

    for (let x = 0; x < config.gridSizeX; x += step) {
      for (let y = 0; y < config.gridSizeY; y += step) {
        for (let z = 0; z < config.gridSizeZ; z += step) {
          const temp = result.temperatureField[x]?.[y]?.[z] ?? ambient;
          const deviation = Math.abs(temp - ambient) / range;
          matrix.makeTranslation(
            x * res - centerX + res / 2,
            z * res,
            y * res - centerY + res / 2,
          );
          const cellScale = res * step * 0.9;
          matrix.scale(new THREE.Vector3(cellScale, cellScale, cellScale));
          mats.push(matrix.clone());
          cols.push(valueToColor(temp, minT, maxT));
          ops.push(Math.min(1, deviation * 0.8) * opacity);
        }
      }
    }

    return { matrices: mats, colors: cols, opacities: ops };
  }, [result, config, res, opacity]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const colorAttr = new Float32Array(count * 3);
    for (let i = 0; i < Math.min(count, matrices.length); i++) {
      mesh.setMatrixAt(i, matrices[i]);
      colorAttr[i * 3] = colors[i].r * opacities[i];
      colorAttr[i * 3 + 1] = colors[i].g * opacities[i];
      colorAttr[i * 3 + 2] = colors[i].b * opacities[i];
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colorAttr, 3));
  }, [matrices, colors, opacities, count]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.5, 8, 8]} />
      <meshBasicMaterial vertexColors transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

// ─── Per-Tile Airflow Overlay ───────────────────────────────────────

interface TileAirflowOverlayProps {
  tileData: TileAirflowData[];
  gridResolution: number;
  gridSizeX: number;
  gridSizeY: number;
}

function efficiencyColor(eff: number): THREE.Color {
  if (eff >= 1.0) return new THREE.Color(0.1, 0.85, 0.2);  // green
  if (eff >= 0.7) return new THREE.Color(0.95, 0.85, 0.1);  // yellow
  if (eff >= 0.4) return new THREE.Color(0.95, 0.55, 0.1);  // orange
  return new THREE.Color(0.95, 0.15, 0.1);  // red
}

export function TileAirflowOverlay({ tileData, gridResolution: res, gridSizeX, gridSizeY }: TileAirflowOverlayProps) {
  const groupRef = useRef<THREE.Group>(null);
  const clockRef = useRef(0);
  const centerX = (gridSizeX * res) / 2;
  const centerY = (gridSizeY * res) / 2;

  const tiles = useMemo(() =>
    tileData.map(tile => {
      const color = efficiencyColor(tile.efficiency);
      const worldX = tile.x * res - centerX + res / 2;
      const worldZ = tile.y * res - centerY + res / 2;
      return { ...tile, color, worldX, worldZ, inefficient: tile.efficiency < 0.7 };
    }),
  [tileData, res, centerX, centerY]);

  useFrame((_, delta) => {
    clockRef.current += delta;
    const group = groupRef.current;
    if (!group) return;
    const pulse = 0.5 + 0.5 * Math.sin(clockRef.current * 3);
    group.children.forEach((child, i) => {
      if (tiles[i]?.inefficient && child instanceof THREE.Mesh) {
        (child.material as THREE.MeshBasicMaterial).opacity = 0.3 + pulse * 0.4;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {tiles.map((tile, i) => (
        <group key={tile.tileId}>
          {/* Tile floor plane */}
          <mesh position={[tile.worldX, 0.02, tile.worldZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[res * 0.9, res * 0.9]} />
            <meshBasicMaterial
              color={tile.color}
              transparent
              opacity={tile.inefficient ? 0.5 : 0.35}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {/* Upward arrow proportional to CFM */}
          <arrowHelper
            args={[
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3(tile.worldX, 0.05, tile.worldZ),
              Math.min(2, Math.max(0.2, tile.actualCFM / 300)),
              tile.color.getHex(),
              0.1, 0.05,
            ]}
          />
        </group>
      ))}
    </group>
  );
}

// ─── Alert Zone Markers ─────────────────────────────────────────────

interface AlertZoneMarkersProps {
  alerts: ThermalAlert[];
  gridResolution: number;
}

const SEVERITY_COLORS: Record<string, number> = {
  info: 0x3b82f6,
  warning: 0xeab308,
  critical: 0xf97316,
  emergency: 0xef4444,
};

export function AlertZoneMarkers({ alerts, gridResolution: res }: AlertZoneMarkersProps) {
  const groupRef = useRef<THREE.Group>(null);
  const clockRef = useRef(0);

  useFrame((_, delta) => {
    clockRef.current += delta;
    const group = groupRef.current;
    if (!group) return;
    const pulse = 0.5 + 0.5 * Math.sin(clockRef.current * 4);
    let childIdx = 0;
    for (const alert of alerts) {
      const child = group.children[childIdx];
      if (child instanceof THREE.LineSegments) {
        const isCritical = alert.severity === 'critical' || alert.severity === 'emergency';
        (child.material as THREE.LineBasicMaterial).opacity = isCritical ? 0.4 + pulse * 0.6 : 0.7;
      }
      childIdx++;
    }
  });

  return (
    <group ref={groupRef}>
      {alerts.map((alert) => {
        const color = SEVERITY_COLORS[alert.severity] ?? 0xffffff;
        const size = res * 1.5;
        return (
          <group key={alert.id} position={[alert.position.x, alert.position.z ?? res, alert.position.y]}>
            {/* Wireframe box */}
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(size, size, size)]} />
              <lineBasicMaterial color={color} transparent opacity={0.7} />
            </lineSegments>
            {/* Label */}
            <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
              <div style={{
                background: 'rgba(15,23,42,0.85)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 600,
                color: `#${color.toString(16).padStart(6, '0')}`,
                whiteSpace: 'nowrap',
                border: `1px solid #${color.toString(16).padStart(6, '0')}40`,
              }}>
                {alert.type === 'overheating' ? '🔥' : '💨'} {alert.value.toFixed(1)}{alert.unit}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
