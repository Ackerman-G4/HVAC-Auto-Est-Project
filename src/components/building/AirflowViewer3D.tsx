'use client';

import React, { useRef, useEffect } from 'react';
import type { SimulationResult, ServerRack, HVACUnit } from '@/types/simulation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Props {
  result: SimulationResult;
  racks: ServerRack[];
  hvacUnits: HVACUnit[];
  showHotspots?: boolean;
  showAirflow?: boolean;
  selectedSliceZ?: number;
  viewMode?: 'temperature' | 'velocity' | 'pressure';
}

type V3 = [number, number, number];
type V2 = [number, number];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* ------------------------------------------------------------------ */
/*  Color Mapping                                                      */
/* ------------------------------------------------------------------ */
function valueToRGB(value: number, minValue: number, maxValue: number): string {
  const range = maxValue - minValue || 1;
  const ratio = clamp((value - minValue) / range, 0, 1);

  // Blue → Cyan → Green → Yellow → Red
  let r: number, g: number, b: number;
  if (ratio < 0.25) {
    const f = ratio / 0.25;
    r = 0; g = Math.round(255 * f); b = 255;
  } else if (ratio < 0.5) {
    const f = (ratio - 0.25) / 0.25;
    r = 0; g = 255; b = Math.round(255 * (1 - f));
  } else if (ratio < 0.75) {
    const f = (ratio - 0.5) / 0.25;
    r = Math.round(255 * f); g = 255; b = 0;
  } else {
    const f = (ratio - 0.75) / 0.25;
    r = 255; g = Math.round(255 * (1 - f)); b = 0;
  }
  return `rgb(${r},${g},${b})`;
}

function toRgba(color: string, alpha: number): string {
  return color.replace('rgb', 'rgba').replace(')', `,${alpha})`);
}

/* ------------------------------------------------------------------ */
/*  Geometry Helpers                                                   */
/* ------------------------------------------------------------------ */
function rotY(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotX(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function project(p: V3, cx: number, cy: number, sc: number): V2 {
  return [cx + p[0] * sc, cy - p[1] * sc];
}

/* ------------------------------------------------------------------ */
/*  Airflow Particle System                                            */
/* ------------------------------------------------------------------ */
interface Particle {
  pos: V3;
  vel: V3;
  life: number;
  maxLife: number;
  temp: number;
}

function createParticles(result: SimulationResult, count: number): Particle[] {
  const particles: Particle[] = [];
  const { gridSizeX, gridSizeY, gridSizeZ, gridResolution } = result.config;

  for (let i = 0; i < count; i++) {
    const gx = Math.floor(Math.random() * gridSizeX);
    const gy = Math.floor(Math.random() * gridSizeY);
    const gz = Math.floor(Math.random() * gridSizeZ);

    const vel = result.velocityField[gx]?.[gy]?.[gz] || { x: 0, y: 0, z: 0 };
    const temp = result.temperatureField[gx]?.[gy]?.[gz] || result.config.ambientTempC;
    const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);

    // Focus particles on areas with airflow
    if (speed < 0.01 && Math.random() > 0.3) {
      i--;
      continue;
    }
    particles.push({
      pos: [
        gx * gridResolution,
        gz * gridResolution + Math.random() * gridResolution,
        gy * gridResolution,
      ],
      vel: [vel.x, vel.z, vel.y],
      life: Math.random() * 60,
      maxLife: 60 + Math.random() * 40,
      temp: temp
    });
  }
  return particles;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function AirflowViewer3D(props: Props) {
  const {
    result,
    racks,
    hvacUnits,
    showHotspots = true,
    showAirflow = true,
    selectedSliceZ = 1,
    viewMode = 'temperature',
  } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const viewportRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const cam = useRef({ ry: -0.6, rx: 0.45, sc: 30, drag: false, mx: 0, my: 0 });
  const particlesRef = useRef<Particle[]>([]);

  const config = result.config;
  const metrics = result.metrics;

  // Center offset
  const cx = (config.gridSizeX * config.gridResolution) / 2;
  const cz = (config.gridSizeY * config.gridResolution) / 2;

  // Initialize particles
  useEffect(() => {
    if (showAirflow) {
      particlesRef.current = createParticles(result, 200);
    } else {
      particlesRef.current = [];
    }
  }, [result, showAirflow]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const canvasElement: HTMLCanvasElement = canvas;

    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    function resize() {
      const currentWrap = wrapRef.current;
      if (!currentWrap) return;

      const rect = currentWrap.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dpr = Math.min(window.devicePixelRatio, 2);
      viewportRef.current = { w, h, dpr };

      canvasElement.width = w * dpr;
      canvasElement.height = h * dpr;
      canvasElement.style.width = `${w}px`;
      canvasElement.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function projectWorld(point: V3, ry: number, rx: number, midX: number, midY: number, scale: number): V2 {
      return project(rotX(rotY(point, ry), rx), midX, midY, scale);
    }

    function draw(w: number, h: number) {
      const ry = cam.current.ry;
      const rx = cam.current.rx;
      const scale = cam.current.sc;
      const midX = w / 2;
      const midY = h / 2;
      const resolution = config.gridResolution;
      const centerX = (config.gridSizeX * resolution) / 2;
      const centerZ = (config.gridSizeY * resolution) / 2;
      const maxSlice = Math.max(0, config.gridSizeZ - 1);
      const sliceIndex = clamp(Math.round(selectedSliceZ), 0, maxSlice);
      const sliceHeight = sliceIndex * resolution;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      const floorCorners: V3[] = [
        [-centerX, 0, -centerZ],
        [centerX, 0, -centerZ],
        [centerX, 0, centerZ],
        [-centerX, 0, centerZ],
      ];
      const projectedFloor = floorCorners.map((point) => projectWorld(point, ry, rx, midX, midY, scale));
      ctx.beginPath();
      ctx.moveTo(projectedFloor[0][0], projectedFloor[0][1]);
      projectedFloor.forEach((point) => ctx.lineTo(point[0], point[1]));
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,41,59,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(71,85,105,0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (viewMode === 'temperature' || viewMode === 'pressure') {
        const scalarField = viewMode === 'temperature' ? result.temperatureField : result.pressureField;

        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;
        for (let gx = 0; gx < config.gridSizeX; gx++) {
          for (let gy = 0; gy < config.gridSizeY; gy++) {
            const value = scalarField[gx]?.[gy]?.[sliceIndex];
            if (typeof value === 'number' && Number.isFinite(value)) {
              minValue = Math.min(minValue, value);
              maxValue = Math.max(maxValue, value);
            }
          }
        }

        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
          minValue = viewMode === 'temperature' ? config.ambientTempC : 101325;
          maxValue = minValue + 1;
        }

        for (let gx = 0; gx < config.gridSizeX - 1; gx++) {
          for (let gy = 0; gy < config.gridSizeY - 1; gy++) {
            const value = scalarField[gx]?.[gy]?.[sliceIndex];
            if (typeof value !== 'number' || !Number.isFinite(value)) continue;

            const color = valueToRGB(value, minValue, maxValue);
            const corners: V3[] = [
              [gx * resolution - centerX, sliceHeight, gy * resolution - centerZ],
              [(gx + 1) * resolution - centerX, sliceHeight, gy * resolution - centerZ],
              [(gx + 1) * resolution - centerX, sliceHeight, (gy + 1) * resolution - centerZ],
              [gx * resolution - centerX, sliceHeight, (gy + 1) * resolution - centerZ],
            ];
            const projected = corners.map((point) => projectWorld(point, ry, rx, midX, midY, scale));

            ctx.beginPath();
            ctx.moveTo(projected[0][0], projected[0][1]);
            projected.forEach((point) => ctx.lineTo(point[0], point[1]));
            ctx.closePath();
            ctx.fillStyle = toRgba(color, 0.35);
            ctx.fill();
            ctx.strokeStyle = 'rgba(15,23,42,0.2)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      if (viewMode === 'velocity') {
        const maxVelocity = Math.max(metrics.maxVelocity, 0.1);
        for (let gx = 0; gx < config.gridSizeX; gx += 2) {
          for (let gy = 0; gy < config.gridSizeY; gy += 2) {
            const vel = result.velocityField[gx]?.[gy]?.[sliceIndex];
            if (!vel) continue;

            const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
            if (speed < 0.03) continue;

            const start: V3 = [
              (gx + 0.5) * resolution - centerX,
              sliceHeight,
              (gy + 0.5) * resolution - centerZ,
            ];
            const end: V3 = [
              start[0] + vel.x * 0.8,
              start[1],
              start[2] + vel.y * 0.8,
            ];

            const p0 = projectWorld(start, ry, rx, midX, midY, scale);
            const p1 = projectWorld(end, ry, rx, midX, midY, scale);
            const color = valueToRGB(speed, 0, maxVelocity);

            ctx.strokeStyle = toRgba(color, 0.9);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
            ctx.stroke();

            const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
            const head = 5;
            ctx.fillStyle = toRgba(color, 0.9);
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(
              p1[0] - head * Math.cos(angle - Math.PI / 6),
              p1[1] - head * Math.sin(angle - Math.PI / 6),
            );
            ctx.lineTo(
              p1[0] - head * Math.cos(angle + Math.PI / 6),
              p1[1] - head * Math.sin(angle + Math.PI / 6),
            );
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      for (const unit of hvacUnits) {
        const ux = unit.position.x - centerX;
        const uz = unit.position.y - centerZ;
        const uy = 0;
        const colorPrefix = unit.status === 'failed' ? 'rgba(239,68,68,' : 'rgba(16,185,129,';

        const top = [
          [ux, uy + unit.height, uz],
          [ux + unit.width, uy + unit.height, uz],
          [ux + unit.width, uy + unit.height, uz + unit.depth],
          [ux, uy + unit.height, uz + unit.depth],
        ].map((point) => projectWorld(point as V3, ry, rx, midX, midY, scale));

        ctx.beginPath();
        ctx.moveTo(top[0][0], top[0][1]);
        top.forEach((point) => ctx.lineTo(point[0], point[1]));
        ctx.closePath();
        ctx.fillStyle = `${colorPrefix}0.6)`;
        ctx.fill();
        ctx.strokeStyle = `${colorPrefix}0.9)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        const front = [
          [ux, uy, uz],
          [ux + unit.width, uy, uz],
          [ux + unit.width, uy + unit.height, uz],
          [ux, uy + unit.height, uz],
        ].map((point) => projectWorld(point as V3, ry, rx, midX, midY, scale));

        ctx.beginPath();
        ctx.moveTo(front[0][0], front[0][1]);
        front.forEach((point) => ctx.lineTo(point[0], point[1]));
        ctx.closePath();
        ctx.fillStyle = `${colorPrefix}0.42)`;
        ctx.fill();
        ctx.stroke();

        const labelPoint = projectWorld(
          [ux + unit.width / 2, uy + unit.height + 0.3, uz + unit.depth / 2],
          ry,
          rx,
          midX,
          midY,
          scale,
        );
        ctx.fillStyle = '#d1fae5';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(unit.name, labelPoint[0], labelPoint[1]);
      }

      for (const rack of racks) {
        const rx1 = rack.position.x - centerX;
        const rz1 = rack.position.y - centerZ;
        const ry1 = 0;

        const top = [
          [rx1, ry1 + rack.height, rz1],
          [rx1 + rack.width, ry1 + rack.height, rz1],
          [rx1 + rack.width, ry1 + rack.height, rz1 + rack.depth],
          [rx1, ry1 + rack.height, rz1 + rack.depth],
        ].map((point) => projectWorld(point as V3, ry, rx, midX, midY, scale));

        ctx.beginPath();
        ctx.moveTo(top[0][0], top[0][1]);
        top.forEach((point) => ctx.lineTo(point[0], point[1]));
        ctx.closePath();
        ctx.fillStyle = 'rgba(99,102,241,0.6)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(99,102,241,0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const front = [
          [rx1, ry1, rz1],
          [rx1 + rack.width, ry1, rz1],
          [rx1 + rack.width, ry1 + rack.height, rz1],
          [rx1, ry1 + rack.height, rz1],
        ].map((point) => projectWorld(point as V3, ry, rx, midX, midY, scale));

        ctx.beginPath();
        ctx.moveTo(front[0][0], front[0][1]);
        front.forEach((point) => ctx.lineTo(point[0], point[1]));
        ctx.closePath();
        ctx.fillStyle = 'rgba(79,70,229,0.48)';
        ctx.fill();
        ctx.stroke();

        const side = [
          [rx1 + rack.width, ry1, rz1],
          [rx1 + rack.width, ry1, rz1 + rack.depth],
          [rx1 + rack.width, ry1 + rack.height, rz1 + rack.depth],
          [rx1 + rack.width, ry1 + rack.height, rz1],
        ].map((point) => projectWorld(point as V3, ry, rx, midX, midY, scale));

        ctx.beginPath();
        ctx.moveTo(side[0][0], side[0][1]);
        side.forEach((point) => ctx.lineTo(point[0], point[1]));
        ctx.closePath();
        ctx.fillStyle = 'rgba(67,56,202,0.38)';
        ctx.fill();
        ctx.stroke();

        const labelPoint = projectWorld(
          [rx1 + rack.width / 2, ry1 + rack.height + 0.25, rz1 + rack.depth / 2],
          ry,
          rx,
          midX,
          midY,
          scale,
        );
        ctx.fillStyle = '#e0e7ff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(rack.name, labelPoint[0], labelPoint[1]);
        ctx.fillText(`${rack.powerKW}kW`, labelPoint[0], labelPoint[1] + 12);
      }

      if (showHotspots) {
        for (const hotspot of metrics.hotspots) {
          const point = projectWorld(
            [hotspot.position.x - centerX, hotspot.position.z, hotspot.position.y - centerZ],
            ry,
            rx,
            midX,
            midY,
            scale,
          );
          const pulse = 8 + 3 * Math.sin(Date.now() / 300);
          const colorPrefix = hotspot.severity === 'emergency'
            ? 'rgba(239,68,68,'
            : hotspot.severity === 'critical'
              ? 'rgba(245,158,11,'
              : 'rgba(234,179,8,';

          ctx.beginPath();
          ctx.arc(point[0], point[1], pulse + 6, 0, Math.PI * 2);
          ctx.fillStyle = `${colorPrefix}0.2)`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(point[0], point[1], pulse, 0, Math.PI * 2);
          ctx.fillStyle = `${colorPrefix}0.8)`;
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(`${hotspot.temperature.toFixed(0)}°`, point[0], point[1] - pulse - 4);
        }
      }

      if (showAirflow && viewMode !== 'velocity') {
        const particles = particlesRef.current;
        const maxX = config.gridSizeX * resolution;
        const maxY = config.gridSizeY * resolution;
        const maxZ = config.gridSizeZ * resolution;
        const minTemp = metrics.minTemperature ?? config.ambientTempC;
        const maxTemp = metrics.maxTemperature ?? config.ambientTempC + 10;

        for (const particle of particles) {
          const gx = clamp(Math.floor(particle.pos[0] / resolution), 0, config.gridSizeX - 1);
          const gy = clamp(Math.floor(particle.pos[2] / resolution), 0, config.gridSizeY - 1);
          const gz = clamp(Math.floor(particle.pos[1] / resolution), 0, config.gridSizeZ - 1);
          const velocity = result.velocityField[gx]?.[gy]?.[gz] || { x: 0, y: 0, z: 0 };

          particle.vel = [velocity.x, velocity.z, velocity.y];
          particle.pos[0] += particle.vel[0] * 0.02;
          particle.pos[1] += particle.vel[1] * 0.02;
          particle.pos[2] += particle.vel[2] * 0.02;
          particle.temp = result.temperatureField[gx]?.[gy]?.[gz] || config.ambientTempC;
          particle.life += 1;

          if (
            particle.life > particle.maxLife ||
            particle.pos[0] < 0 ||
            particle.pos[0] > maxX ||
            particle.pos[1] < 0 ||
            particle.pos[1] > maxZ ||
            particle.pos[2] < 0 ||
            particle.pos[2] > maxY
          ) {
            const nx = Math.floor(Math.random() * config.gridSizeX);
            const ny = Math.floor(Math.random() * config.gridSizeY);
            const nz = Math.floor(Math.random() * config.gridSizeZ);
            const nextVelocity = result.velocityField[nx]?.[ny]?.[nz] || { x: 0, y: 0, z: 0 };

            particle.pos = [
              nx * resolution,
              nz * resolution + Math.random() * resolution,
              ny * resolution,
            ];
            particle.vel = [nextVelocity.x, nextVelocity.z, nextVelocity.y];
            particle.temp = result.temperatureField[nx]?.[ny]?.[nz] || config.ambientTempC;
            particle.life = 0;
          }

          const projected = projectWorld(
            [particle.pos[0] - centerX, particle.pos[1], particle.pos[2] - centerZ],
            ry,
            rx,
            midX,
            midY,
            scale,
          );
          const alpha = Math.max(0, 1 - particle.life / particle.maxLife) * 0.7;
          const color = valueToRGB(particle.temp, minTemp, maxTemp);

          ctx.beginPath();
          ctx.arc(projected[0], projected[1], 2, 0, Math.PI * 2);
          ctx.fillStyle = toRgba(color, alpha);
          ctx.fill();
        }
      }

      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(
        `Mode: ${viewMode.toUpperCase()} | Slice Z: ${sliceIndex} (${sliceHeight.toFixed(1)}m) | Max: ${metrics.maxTemperature.toFixed(1)}°C | Avg: ${metrics.avgTemperature.toFixed(1)}°C | PUE: ${metrics.pue.toFixed(2)}`,
        16,
        h - 16,
      );
    }

    function animate() {
      const { w, h } = viewportRef.current;
      if (w > 0 && h > 0) {
        draw(w, h);
      }
      animRef.current = window.requestAnimationFrame(animate);
    }

    resize();
    animRef.current = window.requestAnimationFrame(animate);
    window.addEventListener('resize', resize);

    const handleMouseDown = (event: MouseEvent) => {
      cam.current.drag = true;
      cam.current.mx = event.clientX;
      cam.current.my = event.clientY;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!cam.current.drag) return;
      cam.current.ry += (event.clientX - cam.current.mx) * 0.005;
      cam.current.rx += (event.clientY - cam.current.my) * 0.005;
      cam.current.rx = clamp(cam.current.rx, -1.5, 1.5);
      cam.current.mx = event.clientX;
      cam.current.my = event.clientY;
    };

    const handleMouseUp = () => {
      cam.current.drag = false;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      cam.current.sc = clamp(cam.current.sc - event.deltaY * 0.05, 5, 100);
    };

    canvasElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvasElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      if (animRef.current !== null) {
        window.cancelAnimationFrame(animRef.current);
      }
      window.removeEventListener('resize', resize);
      canvasElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvasElement.removeEventListener('wheel', handleWheel);
    };
  }, [result, racks, hvacUnits, showHotspots, showAirflow, selectedSliceZ, viewMode, config, metrics, cx, cz]);

  return (
    <div ref={wrapRef} className="relative w-full h-[500px] rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 text-xs text-white">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-slate-300">
          {viewMode} mode · Slice {Math.round(selectedSliceZ)}
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-3 h-3 rounded-sm bg-indigo-500" /> Server Racks
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" /> HVAC Units
        </div>
        {showHotspots && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" /> Hotspots
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-slate-400">
        Drag to rotate • Scroll to zoom
      </div>
    </div>
  );
}
