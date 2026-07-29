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
import React, { Suspense, useMemo, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { SimulationResult, ServerRack, HVACUnit, InspectedCellInfo, TileFlowViewConfig, TileAirflowData, ThermalAlert, Vec3 } from '@/types/simulation';
import { HeatmapSlice, VelocityArrows, AirflowParticles, Streamlines, TemperatureFog, TileAirflowOverlay, AlertZoneMarkers, ContourSlicePlane } from './CFDOverlay3D';
import { getDomainCenter, getDomainBBox, computeCameraFit } from '@/lib/simulation/scene-transform';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  result: SimulationResult;
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  roomBoundaries?: RoomBoundaryOverlay[];
  editableHVAC?: boolean;
  selectedHVACId?: string | null;
  onSelectHVAC?: (unitId: string | null) => void;
  onHVACDragPreview?: (unitId: string, proposedPosition: Vec3) => HVACDragPreviewResult;
  onHVACDragCommit?: (unitId: string, position: Vec3) => void;
  onHVACDragInvalid?: (unitId: string, reason: string) => void;
  showHotspots?: boolean;
  showAirflow?: boolean;
  selectedSliceZ?: number;
  viewMode?: 'temperature' | 'velocity' | 'pressure' | 'humidity';
  onInspect?: (cell: InspectedCellInfo | null) => void;
  // TileFlow overlays
  tileFlowView?: TileFlowViewConfig;
  streamlineSeedPoints?: Vec3[];
  tileAirflowData?: TileAirflowData[];
  alerts?: ThermalAlert[];
  /** Bumping this re-fits the camera to the domain (Reset view). */
  resetToken?: number;
}

export interface AirflowViewerHandle {
  captureSnapshot: () => string | null;
  resetView: () => void;
}

/**
 * Fits the orbit camera to the domain bounding box on mount and whenever the
 * domain size changes (or Reset view is pressed). Replaces the previous
 * hardcoded camera distance so small rooms and large floors both frame well.
 */
function AutoFitCamera({
  config,
  resetToken,
}: {
  config: { gridSizeX: number; gridSizeY: number; gridSizeZ: number; gridResolution: number };
  resetToken?: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    target: THREE.Vector3;
    minDistance: number;
    maxDistance: number;
    update: () => void;
  } | null;

  // Re-fit only when the domain size (or a reset request) changes.
  const fitSignature = `${config.gridSizeX}|${config.gridSizeY}|${config.gridSizeZ}|${config.gridResolution}|${resetToken ?? 0}`;

  React.useEffect(() => {
    const fit = computeCameraFit(getDomainBBox(config));
    // R3F requires imperative mutation of the camera/controls objects.
    camera.position.set(fit.position[0], fit.position[1], fit.position[2]);
    if (controls) {
      controls.target.set(fit.target[0], fit.target[1], fit.target[2]);
      // react-hooks/immutability flags assigning to a hook-returned value, but
      // OrbitControls only exposes these as mutable properties — there is no
      // setter API to move the modification into.
      // eslint-disable-next-line react-hooks/immutability
      controls.minDistance = fit.minDistance;
      // eslint-disable-next-line react-hooks/immutability
      controls.maxDistance = fit.maxDistance;
      controls.update();
    } else {
      camera.lookAt(fit.target[0], fit.target[1], fit.target[2]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignature, camera, controls]);

  return null;
}

export interface RoomBoundaryOverlay {
  id: string;
  name: string;
  points: Array<{ x: number; y: number }>;
  centroid?: { x: number; y: number };
}

export interface HVACDragPreviewResult {
  position: Vec3;
  valid: boolean;
  reason?: string;
}

// ─── Equipment Meshes ───────────────────────────────────────────────

function RackMesh({ rack, centerX, centerZ }: { rack: ServerRack; centerX: number; centerZ: number }) {
  // Solver uses x/y as floor-plane coordinates and z as elevation.
  const x = rack.position.x - centerX + rack.width / 2;
  const z = rack.position.y - centerZ + rack.depth / 2;
  const y = rack.position.z + rack.height / 2;

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

function HVACMesh({
  unit,
  centerX,
  centerZ,
  isSelected = false,
  isDragging = false,
  isInvalid = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  unit: HVACUnit;
  centerX: number;
  centerZ: number;
  isSelected?: boolean;
  isDragging?: boolean;
  isInvalid?: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  // Solver uses x/y as floor-plane coordinates and z as elevation.
  const x = unit.position.x - centerX + unit.width / 2;
  const z = unit.position.y - centerZ + unit.depth / 2;
  const y = unit.position.z + unit.height / 2;
  const baseColor = unit.status === 'failed' ? '#ef4444' : '#10b981';
  const color = isInvalid
    ? '#ef4444'
    : isDragging
      ? '#f59e0b'
      : isSelected
        ? '#22d3ee'
        : baseColor;
  const edgeColor = isInvalid
    ? '#fecaca'
    : isDragging
      ? '#fde68a'
      : isSelected
        ? '#67e8f9'
        : unit.status === 'failed'
          ? '#fca5a5'
          : '#6ee7b7';

  return (
    <group position={[x, y, z]}>
      <mesh onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <boxGeometry args={[unit.width, unit.height, unit.depth]} />
        <meshStandardMaterial color={color} transparent opacity={isDragging ? 0.78 : 0.55} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(unit.width, unit.height, unit.depth)]} />
        <lineBasicMaterial color={edgeColor} />
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
  }, [sliceZ, centerX, centerZ, config, temperatureField, velocityField, pressureField, humidityField, onInspect]);

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
    roomBoundaries = [],
    editableHVAC = false,
    selectedHVACId = null,
    onSelectHVAC,
    onHVACDragPreview,
    onHVACDragCommit,
    onHVACDragInvalid,
    showHotspots = true, showAirflow = true,
    selectedSliceZ = 1, viewMode = 'temperature',
    onInspect,
    tileFlowView, streamlineSeedPoints, tileAirflowData, alerts,
  } = props;

  const { config, metrics } = result;
  const { centerX, centerZ } = getDomainCenter(config);
  const sliceIdx = Math.min(Math.max(0, Math.round(selectedSliceZ)), config.gridSizeZ - 1);

  const handleInspect = useCallback((cell: InspectedCellInfo | null) => {
    onInspect?.(cell);
  }, [onInspect]);

  const [dragState, setDragState] = useState<{
    unitId: string;
    preview: Vec3;
    valid: boolean;
    reason?: string;
  } | null>(null);

  const dragUnit = useMemo(() => {
    if (!dragState) return null;
    return hvacUnits.find((unit) => unit.id === dragState.unitId) ?? null;
  }, [dragState, hvacUnits]);
  const dragProjectionPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const roomOutlines = useMemo(() => roomBoundaries
    .map((room) => {
      if (!room.points || room.points.length < 3) {
        return null;
      }

      const linePoints: [number, number, number][] = room.points.map((point) => [
        point.x - centerX,
        0.03,
        point.y - centerZ,
      ]);
      linePoints.push(linePoints[0]);

      const centroid = room.centroid
        ? room.centroid
        : room.points.reduce((acc, point) => ({
          x: acc.x + point.x,
          y: acc.y + point.y,
        }), { x: 0, y: 0 });
      const centroidDivisor = room.points.length || 1;

      return {
        id: room.id,
        name: room.name,
        linePoints,
        centroid: {
          x: room.centroid ? centroid.x : centroid.x / centroidDivisor,
          y: room.centroid ? centroid.y : centroid.y / centroidDivisor,
        },
      };
    })
    .filter((room): room is {
      id: string;
      name: string;
      linePoints: [number, number, number][];
      centroid: { x: number; y: number };
    } => Boolean(room)), [roomBoundaries, centerX, centerZ]);

  const domainSpanM = Math.max(config.gridSizeX, config.gridSizeY) * config.gridResolution;
  const dragPlaneSize = Math.max(20, domainSpanM * 2.2);

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

  const handleHVACPointerDown = useCallback((unitId: string, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelectHVAC?.(unitId);
    if (!editableHVAC) {
      return;
    }

    const unit = hvacUnits.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    setDragState({
      unitId,
      preview: { ...unit.position },
      valid: true,
    });
  }, [editableHVAC, hvacUnits, onSelectHVAC]);

  const handleDragPointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!dragState) {
      return;
    }

    event.stopPropagation();
    const activeUnit = hvacUnits.find((item) => item.id === dragState.unitId);
    if (!activeUnit) {
      return;
    }

    const projected = new THREE.Vector3();
    if (!event.ray.intersectPlane(dragProjectionPlane, projected)) {
      return;
    }

    const proposed: Vec3 = {
      x: projected.x + centerX,
      y: projected.z + centerZ,
      z: activeUnit.position.z,
    };

    const feedback = onHVACDragPreview
      ? onHVACDragPreview(dragState.unitId, proposed)
      : { position: proposed, valid: true };

    setDragState((current) => {
      if (!current || current.unitId !== dragState.unitId) {
        return current;
      }
      return {
        ...current,
        preview: feedback.position,
        valid: feedback.valid,
        reason: feedback.reason,
      };
    });
  }, [dragState, hvacUnits, centerX, centerZ, onHVACDragPreview, dragProjectionPlane]);

  const clearDragState = useCallback(() => {
    setDragState(null);
  }, []);

  const handleDragPointerUp = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!dragState) {
      return;
    }

    event.stopPropagation();
    if (dragState.valid) {
      onHVACDragCommit?.(dragState.unitId, dragState.preview);
    } else {
      onHVACDragInvalid?.(dragState.unitId, dragState.reason ?? 'Invalid placement');
    }
    clearDragState();
  }, [dragState, onHVACDragCommit, onHVACDragInvalid, clearDragState]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.6} />
      <pointLight position={[0, 8, 0]} intensity={0.3} />

      <FloorGrid sizeX={config.gridSizeX} sizeY={config.gridSizeY} resolution={config.gridResolution} />

      {/* Actual room outlines from floorplan polygons */}
      {roomOutlines.map((room) => (
        <group key={room.id}>
          <Line
            points={room.linePoints}
            color="#e2e8f0"
            transparent
            opacity={0.82}
            lineWidth={1}
          />
          <Text
            position={[room.centroid.x - centerX, 0.08, room.centroid.y - centerZ]}
            fontSize={0.2}
            color="#cbd5e1"
            anchorX="center"
            anchorY="bottom"
            font={undefined}
          >
            {room.name}
          </Text>
        </group>
      ))}

      {/* Heatmap overlay */}
      {(viewMode === 'temperature' || viewMode === 'pressure' || viewMode === 'humidity') && (
        <HeatmapSlice result={result} sliceZ={selectedSliceZ} viewMode={viewMode} />
      )}

      {/* Velocity arrows + a visible slice plane so the slice control has
          on-screen feedback in velocity mode (previously nothing rendered). */}
      {viewMode === 'velocity' && (
        <>
          <VelocityArrows result={result} sliceZ={selectedSliceZ} />
          <ContourSlicePlane
            result={result}
            config={{
              id: 'velocity-slice',
              field: 'velocity',
              orientation: 'xy',
              position: sliceIdx * config.gridResolution,
              levels: 12,
              colorMap: 'viridis',
              opacity: 0.35,
              showLines: false,
            }}
          />
        </>
      )}

      {/* Animated particles */}
      {showAirflow && (
        <AirflowParticles result={result} count={config.mode === 'fast' ? 200 : config.mode === 'engineering' ? 800 : 400} />
      )}

      {/* Equipment */}
      {racks.map(rack => (
        <RackMesh key={rack.id} rack={rack} centerX={centerX} centerZ={centerZ} />
      ))}
      {hvacUnits.map((unit) => {
        const isDragging = dragState?.unitId === unit.id;
        const renderedUnit = isDragging && dragState
          ? { ...unit, position: dragState.preview }
          : unit;

        return (
          <HVACMesh
            key={unit.id}
            unit={renderedUnit}
            centerX={centerX}
            centerZ={centerZ}
            isSelected={selectedHVACId === unit.id}
            isDragging={isDragging}
            isInvalid={Boolean(isDragging && dragState && !dragState.valid)}
            onPointerDown={(event) => handleHVACPointerDown(unit.id, event)}
            onPointerMove={dragState ? handleDragPointerMove : undefined}
            onPointerUp={dragState ? handleDragPointerUp : undefined}
          />
        );
      })}

      {/* Drag projection plane (x-z in scene, x-y in solver) */}
      {editableHVAC && dragState && (
        <mesh
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
        >
          <planeGeometry args={[dragPlaneSize, dragPlaneSize]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {dragState && dragUnit && !dragState.valid && (
        <Text
          position={[
            dragState.preview.x - centerX + dragUnit.width / 2,
            dragUnit.position.z + dragUnit.height + 0.35,
            dragState.preview.y - centerZ + dragUnit.depth / 2,
          ]}
          fontSize={0.16}
          color="#fca5a5"
          anchorX="center"
          anchorY="bottom"
          font={undefined}
        >
          {(dragState.reason ?? 'Invalid placement').slice(0, 84)}
        </Text>
      )}

      {/* Hotspots */}
      {showHotspots && hotspotPositions.map((hs, i) => (
        <HotspotMarker key={i} position={hs.position} temperature={hs.temperature} severity={hs.severity} />
      ))}

      {/* Inspect click plane */}
      {!dragState && (
        <InspectPlane
          result={result}
          sliceZ={selectedSliceZ}
          centerX={centerX}
          centerZ={centerZ}
          onInspect={handleInspect}
        />
      )}

      {/* TileFlow: Streamlines */}
      {tileFlowView?.showStreamlines && (
        <Streamlines
          result={result}
          config={tileFlowView.streamlineConfig}
          sliceZ={selectedSliceZ}
          seedPoints={streamlineSeedPoints}
        />
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

      <AutoFitCamera config={config} resetToken={props.resetToken} />
      <OrbitControls
        makeDefault
        enabled={!dragState}
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

const AirflowViewer3D = forwardRef<AirflowViewerHandle, Props>(function AirflowViewer3D(props, ref) {
  const { result, viewMode = 'temperature', selectedSliceZ = 1 } = props;
  const { metrics, config } = result;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resetToken, setResetToken] = useState(0);
  const initialFit = computeCameraFit(getDomainBBox(config));

  useImperativeHandle(ref, () => ({
    captureSnapshot: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    },
    resetView: () => setResetToken((t) => t + 1),
  }), []);

  return (
    <div className="relative w-full h-125 rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      <Canvas
        ref={canvasRef}
        camera={{ position: initialFit.position, fov: 50, near: 0.1, far: 600 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
        style={{ background: '#0f172a' }}
      >
        <Suspense fallback={null}>
          <Scene {...props} resetToken={resetToken} />
        </Suspense>
      </Canvas>

      {/* Reset view — re-fit the camera to the domain */}
      <button
        type="button"
        onClick={() => setResetToken((t) => t + 1)}
        className="absolute top-4 right-4 rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-slate-700/90"
        title="Reset camera view"
      >
        Reset view
      </button>

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
        {!!props.roomBoundaries?.length && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-[2px] bg-slate-200" /> Room Boundaries
          </div>
        )}
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
