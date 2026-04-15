'use client';

/**
 * AirflowViewer3D — Three.js-powered CFD visualization
 *
 * Uses React Three Fiber (@react-three/fiber) with:
 * - GPU-instanced heatmap cells for temperature/pressure/humidity
 * - Instanced arrow helpers for velocity vectors
 * - GPU-instanced animated particles for airflow visualization
 * - Orbit controls for camera interaction
 * - Equipment boxes (racks + HVAC units) with labels
 * - Pulsing hotspot indicators
 */
import React, { Suspense, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { SimulationResult, ServerRack, HVACUnit, InspectedCellInfo, TileFlowViewConfig, TileAirflowData, ThermalAlert } from '@/types/simulation';
import { useSimulationStore } from '@/stores/simulation-store';
import { HeatmapSlice, VelocityArrows, AirflowParticles, Streamlines, TemperatureFog, TileAirflowOverlay, AlertZoneMarkers } from './CFDOverlay3D';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  result: SimulationResult;
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  showHotspots?: boolean;
  showAirflow?: boolean;
  selectedSliceZ?: number;
  viewMode?: 'temperature' | 'velocity' | 'pressure' | 'humidity';
  onInspect?: (cell: InspectedCellInfo | null) => void;
  // TileFlow overlays
  tileFlowView?: TileFlowViewConfig;
  tileAirflowData?: TileAirflowData[];
  alerts?: ThermalAlert[];
}

export interface AirflowViewerHandle {
  captureSnapshot: () => string | null;
}

// ─── Equipment Meshes ───────────────────────────────────────────────

function RackMesh({ rack, centerX, centerZ }: { rack: ServerRack; centerX: number; centerZ: number }) {
  const x = rack.position.x - centerX + rack.width / 2;
  const z = rack.position.z - centerZ + rack.depth / 2;
  const y = rack.position.y + rack.height / 2;

  return (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[rack.width, rack.height, rack.depth]} />
        <meshStandardMaterial color="#6366f1" transparent opacity={0.6} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(rack.width, rack.height, rack.depth)]} />
        <lineBasicMaterial color="#818cf8" />
      </lineSegments>
      <Text
        position={[0, rack.height / 2 + 0.3, 0]}
        fontSize={0.25}
        color="#e0e7ff"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {rack.name}
      </Text>
      <Text
        position={[0, rack.height / 2 + 0.05, 0]}
        fontSize={0.18}
        color="#a5b4fc"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {`${rack.powerKW}kW`}
      </Text>
    </group>
  );
}

function HVACMesh({ unit, centerX, centerZ }: { unit: HVACUnit; centerX: number; centerZ: number }) {
  const x = unit.position.x - centerX + unit.width / 2;
  const z = unit.position.z - centerZ + unit.depth / 2;
  const y = unit.position.y + unit.height / 2;
  const color = unit.status === 'failed' ? '#ef4444' : '#10b981';

  return (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[unit.width, unit.height, unit.depth]} />
        <meshStandardMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(unit.width, unit.height, unit.depth)]} />
        <lineBasicMaterial color={unit.status === 'failed' ? '#fca5a5' : '#6ee7b7'} />
      </lineSegments>
      <Text
        position={[0, unit.height / 2 + 0.3, 0]}
        fontSize={0.22}
        color="#d1fae5"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {unit.name}
      </Text>
    </group>
  );
}

// ─── Hotspot Indicators ─────────────────────────────────────────────

function HotspotMarker({ position, temperature, severity }: {
  position: THREE.Vector3; temperature: number; severity: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = severity === 'emergency' ? '#ef4444' : severity === 'critical' ? '#f59e0b' : '#eab308';

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const scale = 0.15 + 0.05 * Math.sin(clock.elapsedTime * 3);
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
      {/* Glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.35, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <Text
        position={[0, 0.4, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {`${temperature.toFixed(0)}°C`}
      </Text>
    </group>
  );
}

// ─── Inspect Click Plane ────────────────────────────────────────────

function InspectPlane({ result, sliceZ, centerX, centerZ, onInspect }: {
  result: SimulationResult;
  sliceZ: number;
  centerX: number;
  centerZ: number;
  onInspect: (cell: InspectedCellInfo | null) => void;
}) {
  const { config, temperatureField, velocityField, pressureField, humidityField } = result;
  const planeW = config.gridSizeX * config.gridResolution;
  const planeH = config.gridSizeY * config.gridResolution;
  const y = sliceZ * config.gridResolution;

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const pt = e.point;
    const ix = Math.floor((pt.x + centerX) / config.gridResolution);
    const iz = Math.floor((pt.z + centerZ) / config.gridResolution);
    const iy = Math.min(Math.max(sliceZ, 0), config.gridSizeZ - 1);

    if (ix < 0 || ix >= config.gridSizeX || iz < 0 || iz >= config.gridSizeY) {
      onInspect(null);
      return;
    }

    const temp = temperatureField?.[ix]?.[iz]?.[iy] ?? 0;
    const vel = velocityField?.[ix]?.[iz]?.[iy] ?? { x: 0, y: 0, z: 0 };
    const pres = pressureField?.[ix]?.[iz]?.[iy] ?? 0;
    const hum = humidityField?.[ix]?.[iz]?.[iy] ?? 0;

    onInspect({
      position: { x: ix * config.gridResolution, y: iz * config.gridResolution, z: iy * config.gridResolution },
      temperature: temp,
      velocity: vel,
      pressure: pres,
      humidity: hum,
    });
  }, [result, sliceZ, centerX, centerZ, config, temperatureField, velocityField, pressureField, humidityField, onInspect]);

  return (
    <mesh position={[0, y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={handleClick}>
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Floor Grid ─────────────────────────────────────────────────────

function FloorGrid({ sizeX, sizeY, resolution }: { sizeX: number; sizeY: number; resolution: number }) {
  return (
    <gridHelper
      args={[Math.max(sizeX, sizeY) * resolution, Math.max(sizeX, sizeY), '#1e293b', '#1e293b']}
      position={[0, 0, 0]}
    />
  );
}

// ─── Scene ──────────────────────────────────────────────────────────

function Scene(props: Props) {
  const {
    result, racks, hvacUnits,
    showHotspots = true, showAirflow = true,
    selectedSliceZ = 1, viewMode = 'temperature',
    onInspect,
    tileFlowView, tileAirflowData, alerts,
  } = props;

  const { config, metrics } = result;
  const centerX = (config.gridSizeX * config.gridResolution) / 2;
  const centerZ = (config.gridSizeY * config.gridResolution) / 2;

  const handleInspect = useCallback((cell: InspectedCellInfo | null) => {
    onInspect?.(cell);
  }, [onInspect]);

  const hotspotPositions = useMemo(() =>
    metrics.hotspots.map(h => ({
      position: new THREE.Vector3(
        h.position.x - centerX,
        h.position.z,
        h.position.y - centerZ,
      ),
      temperature: h.temperature,
      severity: h.severity,
    })),
    [metrics.hotspots, centerX, centerZ],
  );

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.6} />
      <pointLight position={[0, 8, 0]} intensity={0.3} />

      <FloorGrid sizeX={config.gridSizeX} sizeY={config.gridSizeY} resolution={config.gridResolution} />

      {/* Heatmap overlay */}
      {(viewMode === 'temperature' || viewMode === 'pressure' || viewMode === 'humidity') && (
        <HeatmapSlice result={result} sliceZ={selectedSliceZ} viewMode={viewMode} />
      )}

      {/* Velocity arrows */}
      {viewMode === 'velocity' && (
        <VelocityArrows result={result} sliceZ={selectedSliceZ} />
      )}

      {/* Animated particles */}
      {showAirflow && (
        <AirflowParticles result={result} count={config.mode === 'fast' ? 200 : config.mode === 'engineering' ? 800 : 400} />
      )}

      {/* Equipment */}
      {racks.map(rack => (
        <RackMesh key={rack.id} rack={rack} centerX={centerX} centerZ={centerZ} />
      ))}
      {hvacUnits.map(unit => (
        <HVACMesh key={unit.id} unit={unit} centerX={centerX} centerZ={centerZ} />
      ))}

      {/* Hotspots */}
      {showHotspots && hotspotPositions.map((hs, i) => (
        <HotspotMarker key={i} position={hs.position} temperature={hs.temperature} severity={hs.severity} />
      ))}

      {/* Inspect click plane */}
      <InspectPlane
        result={result}
        sliceZ={selectedSliceZ}
        centerX={centerX}
        centerZ={centerZ}
        onInspect={handleInspect}
      />

      {/* TileFlow: Streamlines */}
      {tileFlowView?.showStreamlines && (
        <Streamlines result={result} config={tileFlowView.streamlineConfig} sliceZ={selectedSliceZ} />
      )}

      {/* TileFlow: Volumetric fog */}
      {tileFlowView?.showFog && (
        <TemperatureFog result={result} opacity={tileFlowView.fogOpacity} />
      )}

      {/* TileFlow: Tile airflow overlay */}
      {tileFlowView?.showTileOverlay && tileAirflowData && tileAirflowData.length > 0 && (
        <TileAirflowOverlay
          tileData={tileAirflowData}
          gridResolution={config.gridResolution}
          gridSizeX={config.gridSizeX}
          gridSizeY={config.gridSizeY}
        />
      )}

      {/* TileFlow: Alert zone markers */}
      {tileFlowView?.showAlerts && alerts && alerts.length > 0 && (
        <AlertZoneMarkers alerts={alerts} gridResolution={config.gridResolution} />
      )}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2}
        minDistance={2}
        maxDistance={50}
      />
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

const AirflowViewer3D = forwardRef<AirflowViewerHandle, Props>(function AirflowViewer3D(props, ref) {
  const { result, viewMode = 'temperature', selectedSliceZ = 1 } = props;
  const { metrics, config } = result;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    captureSnapshot: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    },
  }), []);

  return (
    <div className="relative w-full h-125 rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      <Canvas
        ref={canvasRef}
        camera={{ position: [8, 6, 8], fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
        style={{ background: '#0f172a' }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>

      {/* Legend overlay */}
      <div className="absolute top-4 left-4 bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 text-xs text-white pointer-events-none">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-slate-300">
          {viewMode} mode · Slice {Math.round(selectedSliceZ)} · {config.mode ?? 'balanced'}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-sm bg-indigo-500" /> Server Racks
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" /> HVAC Units
        </div>
        {props.showHotspots !== false && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" /> Hotspots
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between bg-slate-800/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-slate-300 pointer-events-none">
        <span>Max: {metrics.maxTemperature.toFixed(1)}°C | Avg: {metrics.avgTemperature.toFixed(1)}°C | PUE: {metrics.pue.toFixed(2)}</span>
        <span>CFL dt: {result.effectiveTimeStep?.toFixed(4) ?? '—'}s | Iter: {result.iteration}</span>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-slate-400 pointer-events-none">
        Drag to orbit • Scroll to zoom • Right-drag to pan
      </div>
    </div>
  );
});

export default AirflowViewer3D;
