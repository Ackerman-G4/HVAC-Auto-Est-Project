'use client';

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type {
  BuildingGeometryInput,
  BuildingVisualizationPayload,
} from '@/types/simulation';

export type BuildingOverlayMode = 'temperature' | 'velocity' | 'flow';

interface Props {
  building: BuildingGeometryInput;
  visualization: BuildingVisualizationPayload | null;
  overlayMode: BuildingOverlayMode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function temperatureColor(value: number, min: number, max: number): string {
  const ratio = clamp((value - min) / (max - min || 1), 0, 1);
  const hue = (1 - ratio) * 220;
  return `hsl(${hue} 90% 55%)`;
}

function velocityColor(value: number, max: number): string {
  const ratio = clamp(value / Math.max(max, 0.001), 0, 1);
  const hue = (1 - ratio) * 120;
  return `hsl(${hue} 90% 52%)`;
}

function connectionColor(flowRateM3s: number): string {
  if (flowRateM3s > 0) return '#38bdf8';
  if (flowRateM3s < 0) return '#f97316';
  return '#94a3b8';
}

export default function BuildingSimulationViewer3D({ building, visualization, overlayMode }: Props) {
  const center = useMemo(() => {
    if (building.rooms.length === 0) return { x: 0, y: 0, z: 0 };

    const minX = Math.min(...building.rooms.map((room) => room.origin.x));
    const maxX = Math.max(...building.rooms.map((room) => room.origin.x + room.dimensions.width));
    const minY = Math.min(...building.rooms.map((room) => room.origin.y));
    const maxY = Math.max(...building.rooms.map((room) => room.origin.y + room.dimensions.height));
    const minZ = Math.min(...building.rooms.map((room) => room.origin.z));
    const maxZ = Math.max(...building.rooms.map((room) => room.origin.z + room.dimensions.length));

    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    };
  }, [building.rooms]);

  const roomOverlayById = useMemo(() => {
    const map = new Map<string, BuildingVisualizationPayload['rooms'][number]>();
    for (const room of visualization?.rooms ?? []) {
      map.set(room.roomId, room);
    }
    return map;
  }, [visualization]);

  const maxConnectionFlow = useMemo(() => {
    return (visualization?.connections ?? []).reduce((max, connection) => (
      Math.max(max, Math.abs(connection.flowRateM3s))
    ), 0);
  }, [visualization]);

  const temperatureRange = visualization?.temperatureRange ?? { min: 20, max: 35 };
  const velocityRange = visualization?.velocityRange ?? { min: 0, max: 1 };

  return (
    <div className="relative h-[30rem] w-full overflow-hidden rounded-lg border border-border bg-slate-950">
      <Canvas camera={{ position: [18, 14, 18], fov: 45, near: 0.1, far: 300 }}>
        <ambientLight intensity={0.45} />
        <directionalLight position={[18, 22, 12]} intensity={0.75} />
        <pointLight position={[-14, 12, -10]} intensity={0.2} />

        <gridHelper args={[160, 80, '#1e293b', '#0f172a']} position={[0, -0.01, 0]} />

        {building.rooms.map((room) => {
          const roomCenterX = room.origin.x + room.dimensions.width / 2;
          const roomCenterY = room.origin.y + room.dimensions.height / 2;
          const roomCenterZ = room.origin.z + room.dimensions.length / 2;

          const position: [number, number, number] = [
            roomCenterX - center.x,
            roomCenterY - center.y,
            roomCenterZ - center.z,
          ];

          const overlay = roomOverlayById.get(room.id);
          const tempColor = overlay
            ? temperatureColor(overlay.avgTemperature, temperatureRange.min, temperatureRange.max)
            : '#334155';

          return (
            <group key={room.id}>
              <mesh position={position}>
                <boxGeometry args={[room.dimensions.width, room.dimensions.height, room.dimensions.length]} />
                <meshStandardMaterial
                  color={overlayMode === 'temperature' ? tempColor : '#1e293b'}
                  transparent
                  opacity={overlayMode === 'temperature' ? 0.48 : 0.2}
                />
              </mesh>

              <lineSegments position={position}>
                <edgesGeometry args={[new THREE.BoxGeometry(room.dimensions.width, room.dimensions.height, room.dimensions.length)]} />
                <lineBasicMaterial color={overlayMode === 'temperature' ? '#f8fafc' : '#94a3b8'} opacity={0.8} transparent />
              </lineSegments>

              <Text
                position={[
                  position[0],
                  position[1] + room.dimensions.height / 2 + 0.3,
                  position[2],
                ]}
                fontSize={0.24}
                color="#e2e8f0"
                anchorX="center"
                anchorY="bottom"
                font={undefined}
              >
                {room.name}
              </Text>

              {overlayMode !== 'flow' && overlay?.samples.slice(0, 180).map((sample, idx) => {
                const dir = new THREE.Vector3(sample.velocity.u, 0, sample.velocity.v);
                if (dir.lengthSq() < 1e-8) return null;

                const normalized = dir.normalize();
                const samplePos = new THREE.Vector3(
                  sample.position.x - center.x,
                  sample.position.y - center.y,
                  sample.position.z - center.z,
                );
                const length = overlayMode === 'velocity'
                  ? 0.18 + clamp(sample.velocityMagnitude / Math.max(velocityRange.max, 0.001), 0, 1) * 0.7
                  : 0.15 + clamp(sample.velocityMagnitude / Math.max(velocityRange.max, 0.001), 0, 1) * 0.45;
                const color = overlayMode === 'temperature'
                  ? temperatureColor(sample.temperature, temperatureRange.min, temperatureRange.max)
                  : velocityColor(sample.velocityMagnitude, velocityRange.max);

                return (
                  <arrowHelper
                    key={`${room.id}-${idx}`}
                    args={[normalized, samplePos, length, new THREE.Color(color).getHex(), 0.08, 0.05]}
                  />
                );
              })}
            </group>
          );
        })}

        {(overlayMode === 'flow' || overlayMode === 'temperature') && (visualization?.connections ?? []).map((connection) => {
          const from: [number, number, number] = [
            connection.fromPoint.x - center.x,
            connection.fromPoint.y - center.y,
            connection.fromPoint.z - center.z,
          ];
          const to: [number, number, number] = [
            connection.toPoint.x - center.x,
            connection.toPoint.y - center.y,
            connection.toPoint.z - center.z,
          ];

          const magnitude = Math.abs(connection.flowRateM3s);
          const ratio = maxConnectionFlow > 0 ? magnitude / maxConnectionFlow : 0;
          const color = connectionColor(connection.flowRateM3s);

          const midpoint: [number, number, number] = [
            (from[0] + to[0]) / 2,
            (from[1] + to[1]) / 2,
            (from[2] + to[2]) / 2,
          ];

          return (
            <group key={connection.id}>
              <Line
                points={[from, to]}
                color={color}
                transparent
                opacity={overlayMode === 'flow' ? 0.95 : 0.45}
                lineWidth={1 + ratio * 1.6}
              />
              {overlayMode === 'flow' && (
                <mesh position={midpoint}>
                  <sphereGeometry args={[0.05 + ratio * 0.12, 12, 12]} />
                  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
                </mesh>
              )}
            </group>
          );
        })}

        <OrbitControls makeDefault enableDamping dampingFactor={0.1} maxDistance={120} minDistance={4} />
      </Canvas>

      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/15 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-100 backdrop-blur-sm">
        <p className="font-semibold uppercase tracking-wide">Building CFD View</p>
        <p className="text-slate-300">
          Mode: {overlayMode} · Rooms: {building.rooms.length} · Links: {visualization?.connections.length ?? building.connections.length}
        </p>
        <p className="text-slate-400">
          Temp {temperatureRange.min.toFixed(1)}-{temperatureRange.max.toFixed(1)}C · Vel max {velocityRange.max.toFixed(2)} m/s
        </p>
      </div>
    </div>
  );
}
