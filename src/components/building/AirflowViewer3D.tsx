'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { SimulationResult, Vec3, ServerRack, HVACUnit } from '@/types/simulation';

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

/* ------------------------------------------------------------------ */
/*  Color Mapping                                                      */
/* ------------------------------------------------------------------ */
function tempToRGB(t: number, minT: number, maxT: number): string {
  const range = maxT - minT || 1;
  const ratio = Math.max(0, Math.min(1, (t - minT) / range));

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

function velocityToRGB(vel: Vec3): string {
  const mag = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
  const ratio = Math.min(1, mag / 2); // Normalize to 0-2 m/s
  return tempToRGB(ratio, 0, 1);
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
        gx * gridResolution + Math.random() * gridResolution,
        gz * gridResolution,  // Z in grid → Y in 3D (vertical)
        gy * gridResolution + Math.random() * gridResolution,
      ],
      vel: [vel.x, vel.z, vel.y], // Remap to 3D coordinates
      life: Math.random() * 60,
      maxLife: 60 + Math.random() * 40,
      temp,
    });
  }

  return particles;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function AirflowViewer3D({
  result, racks, hvacUnits,
  showHotspots = true, showAirflow = true,
  selectedSliceZ = 1, viewMode = 'temperature',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const cam = useRef({ ry: -0.6, rx: 0.45, sc: 30, drag: false, mx: 0, my: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const [, bump] = useState(0);

  const config = result.config;
  const metrics = result.metrics;

  // Center offset
  const cx = (config.gridSizeX * config.gridResolution) / 2;
  const cy = (config.gridSizeZ * config.gridResolution) / 2;
  const cz = (config.gridSizeY * config.gridResolution) / 2;

  // Initialize particles
  useEffect(() => {
    if (showAirflow) {
      particlesRef.current = createParticles(result, 200);
    }
  }, [result, showAirflow]);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0;

    function resize() {
      const rect = wrap!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      const midX = w / 2, midY = h / 2;
      const { ry, rx, sc } = cam.current;

      // Background
      const grad = ctx!.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, h);

      // Grid floor
      ctx!.strokeStyle = 'rgba(100,116,139,0.15)';
      ctx!.lineWidth = 0.5;
      const floorY = 0;
      for (let i = 0; i <= config.gridSizeX; i++) {
        const x1 = i * config.gridResolution - cx;
        const p1 = project(rotX(rotY([x1, floorY, -cz], ry), rx), midX, midY, sc);
        const p2 = project(rotX(rotY([x1, floorY, config.gridSizeY * config.gridResolution - cz], ry), rx), midX, midY, sc);
        ctx!.beginPath();
        ctx!.moveTo(p1[0], p1[1]);
        ctx!.lineTo(p2[0], p2[1]);
        ctx!.stroke();
      }
      for (let j = 0; j <= config.gridSizeY; j++) {
        const z1 = j * config.gridResolution - cz;
        const p1 = project(rotX(rotY([-cx, floorY, z1], ry), rx), midX, midY, sc);
        const p2 = project(rotX(rotY([config.gridSizeX * config.gridResolution - cx, floorY, z1], ry), rx), midX, midY, sc);
        ctx!.beginPath();
        ctx!.moveTo(p1[0], p1[1]);
        ctx!.lineTo(p2[0], p2[1]);
        ctx!.stroke();
      }

      // Draw temperature cells for the selected slice
      const minT = metrics.minTemperature;
      const maxT = metrics.maxTemperature;

      for (let gx = 0; gx < config.gridSizeX; gx++) {
        for (let gy = 0; gy < config.gridSizeY; gy++) {
          const temp = result.temperatureField[gx]?.[gy]?.[selectedSliceZ] ?? config.ambientTempC;
          const vel = result.velocityField[gx]?.[gy]?.[selectedSliceZ];

          const worldX = gx * config.gridResolution - cx;
          const worldZ = gy * config.gridResolution - cz;
          const worldY = selectedSliceZ * config.gridResolution;
          const sz = config.gridResolution;

          // Cell corners
          const corners: V3[] = [
            [worldX, worldY, worldZ],
            [worldX + sz, worldY, worldZ],
            [worldX + sz, worldY, worldZ + sz],
            [worldX, worldY, worldZ + sz],
          ];

          const pts = corners.map(c => project(rotX(rotY(c, ry), rx), midX, midY, sc));

          let fillColor: string;
          if (viewMode === 'temperature') {
            fillColor = tempToRGB(temp, minT, maxT);
          } else if (viewMode === 'velocity' && vel) {
            fillColor = velocityToRGB(vel);
          } else {
            fillColor = 'rgba(100,116,139,0.1)';
          }

          ctx!.fillStyle = fillColor;
          ctx!.globalAlpha = 0.6;
          ctx!.beginPath();
          ctx!.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx!.lineTo(pts[i][0], pts[i][1]);
          ctx!.closePath();
          ctx!.fill();
          ctx!.globalAlpha = 1;

          // Draw velocity arrows
          if (showAirflow && vel && viewMode === 'velocity') {
            const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
            if (speed > 0.05) {
              const centerX = worldX + sz / 2;
              const centerZ = worldZ + sz / 2;
              const arrowLen = Math.min(sz * 0.8, speed * sz);
              const normX = vel.x / speed;
              const normZ = vel.y / speed; // grid Y → world Z

              const start = project(rotX(rotY([centerX, worldY, centerZ], ry), rx), midX, midY, sc);
              const end = project(rotX(rotY([centerX + normX * arrowLen, worldY, centerZ + normZ * arrowLen], ry), rx), midX, midY, sc);

              ctx!.strokeStyle = 'rgba(255,255,255,0.7)';
              ctx!.lineWidth = 1.5;
              ctx!.beginPath();
              ctx!.moveTo(start[0], start[1]);
              ctx!.lineTo(end[0], end[1]);
              ctx!.stroke();

              // Arrowhead
              const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
              ctx!.fillStyle = 'rgba(255,255,255,0.8)';
              ctx!.beginPath();
              ctx!.moveTo(end[0], end[1]);
              ctx!.lineTo(end[0] - 6 * Math.cos(angle - 0.4), end[1] - 6 * Math.sin(angle - 0.4));
              ctx!.lineTo(end[0] - 6 * Math.cos(angle + 0.4), end[1] - 6 * Math.sin(angle + 0.4));
              ctx!.closePath();
              ctx!.fill();
            }
          }
        }
      }

      // Draw racks as 3D boxes
      for (const rack of racks) {
        const rx1 = rack.position.x - cx;
        const ry1 = 0;
        const rz1 = rack.position.y - cz;
        const rw = rack.width;
        const rh = rack.height;
        const rd = rack.depth;

        // Top face
        const topPts = [
          [rx1, ry1 + rh, rz1],
          [rx1 + rw, ry1 + rh, rz1],
          [rx1 + rw, ry1 + rh, rz1 + rd],
          [rx1, ry1 + rh, rz1 + rd],
        ].map(p => project(rotX(rotY(p as V3, ry), rx), midX, midY, sc));

        ctx!.fillStyle = 'rgba(99,102,241,0.6)';
        ctx!.strokeStyle = 'rgba(99,102,241,0.9)';
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(topPts[0][0], topPts[0][1]);
        topPts.forEach(p => ctx!.lineTo(p[0], p[1]));
        ctx!.closePath();
        ctx!.fill();
        ctx!.stroke();

        // Front face
        const frontPts = [
          [rx1, ry1, rz1],
          [rx1 + rw, ry1, rz1],
          [rx1 + rw, ry1 + rh, rz1],
          [rx1, ry1 + rh, rz1],
        ].map(p => project(rotX(rotY(p as V3, ry), rx), midX, midY, sc));

        ctx!.fillStyle = 'rgba(79,70,229,0.5)';
        ctx!.beginPath();
        ctx!.moveTo(frontPts[0][0], frontPts[0][1]);
        frontPts.forEach(p => ctx!.lineTo(p[0], p[1]));
        ctx!.closePath();
        ctx!.fill();
        ctx!.stroke();

        // Right side face
        const sidePts = [
          [rx1 + rw, ry1, rz1],
          [rx1 + rw, ry1, rz1 + rd],
          [rx1 + rw, ry1 + rh, rz1 + rd],
          [rx1 + rw, ry1 + rh, rz1],
        ].map(p => project(rotX(rotY(p as V3, ry), rx), midX, midY, sc));

        ctx!.fillStyle = 'rgba(67,56,202,0.4)';
        ctx!.beginPath();
        ctx!.moveTo(sidePts[0][0], sidePts[0][1]);
        sidePts.forEach(p => ctx!.lineTo(p[0], p[1]));
        ctx!.closePath();
        ctx!.fill();
        ctx!.stroke();

        // Label
        const labelPos = project(rotX(rotY([rx1 + rw / 2, ry1 + rh + 0.3, rz1 + rd / 2], ry), rx), midX, midY, sc);
        ctx!.fillStyle = '#e0e7ff';
        ctx!.font = 'bold 10px system-ui';
        ctx!.textAlign = 'center';
        ctx!.fillText(rack.name, labelPos[0], labelPos[1]);
        ctx!.fillText(`${rack.powerKW}kW`, labelPos[0], labelPos[1] + 12);
      }

      // Draw HVAC units
      for (const unit of hvacUnits) {
        const ux = unit.position.x - cx;
        const uy = 0;
        const uz = unit.position.y - cz;
        const uw = unit.width;
        const uh = unit.height;
        const ud = unit.depth;

        const color = unit.status === 'failed' ? 'rgba(239,68,68,' : 'rgba(16,185,129,';

        const topPts = [
          [ux, uy + uh, uz],
          [ux + uw, uy + uh, uz],
          [ux + uw, uy + uh, uz + ud],
          [ux, uy + uh, uz + ud],
        ].map(p => project(rotX(rotY(p as V3, ry), rx), midX, midY, sc));

        ctx!.fillStyle = color + '0.6)';
        ctx!.strokeStyle = color + '0.9)';
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(topPts[0][0], topPts[0][1]);
        topPts.forEach(p => ctx!.lineTo(p[0], p[1]));
        ctx!.closePath();
        ctx!.fill();
        ctx!.stroke();

        const frontPts = [
          [ux, uy, uz],
          [ux + uw, uy, uz],
          [ux + uw, uy + uh, uz],
          [ux, uy + uh, uz],
        ].map(p => project(rotX(rotY(p as V3, ry), rx), midX, midY, sc));
        ctx!.fillStyle = color + '0.4)';
        ctx!.beginPath();
        ctx!.moveTo(frontPts[0][0], frontPts[0][1]);
        frontPts.forEach(p => ctx!.lineTo(p[0], p[1]));
        ctx!.closePath();
        ctx!.fill();
        ctx!.stroke();

        const labelPos = project(rotX(rotY([ux + uw / 2, uy + uh + 0.3, uz + ud / 2], ry), rx), midX, midY, sc);
        ctx!.fillStyle = '#d1fae5';
        ctx!.font = 'bold 10px system-ui';
        ctx!.textAlign = 'center';
        ctx!.fillText(unit.name, labelPos[0], labelPos[1]);
      }

      // Draw hotspots
      if (showHotspots) {
        for (const hs of metrics.hotspots) {
          const pos = project(
            rotX(rotY([hs.position.x - cx, hs.position.z, hs.position.y - cz], ry), rx),
            midX, midY, sc
          );

          const pulseSize = 8 + 3 * Math.sin(Date.now() / 300);
          const hsColor = hs.severity === 'emergency' ? 'rgba(239,68,68,'
            : hs.severity === 'critical' ? 'rgba(245,158,11,' : 'rgba(234,179,8,';

          // Glow
          ctx!.beginPath();
          ctx!.arc(pos[0], pos[1], pulseSize + 6, 0, Math.PI * 2);
          ctx!.fillStyle = hsColor + '0.2)';
          ctx!.fill();

          // Core
          ctx!.beginPath();
          ctx!.arc(pos[0], pos[1], pulseSize, 0, Math.PI * 2);
          ctx!.fillStyle = hsColor + '0.8)';
          ctx!.fill();

          ctx!.fillStyle = '#fff';
          ctx!.font = 'bold 9px system-ui';
          ctx!.textAlign = 'center';
          ctx!.fillText(`${hs.temperature.toFixed(0)}°`, pos[0], pos[1] - pulseSize - 4);
        }
      }

      // Draw particles (airflow streams)
      if (showAirflow && viewMode !== 'velocity') {
        const particles = particlesRef.current;
        for (const p of particles) {
          p.pos[0] += p.vel[0] * 0.02;
          p.pos[1] += p.vel[1] * 0.02;
          p.pos[2] += p.vel[2] * 0.02;
          p.life++;

          if (p.life > p.maxLife || p.pos[0] < -cx || p.pos[0] > cx * 2 ||
              p.pos[1] < -1 || p.pos[1] > config.gridSizeZ * config.gridResolution + 1 ||
              p.pos[2] < -cz || p.pos[2] > cz * 2) {
            // Respawn
            const gx = Math.floor(Math.random() * config.gridSizeX);
            const gy = Math.floor(Math.random() * config.gridSizeY);
            const gz = Math.floor(Math.random() * config.gridSizeZ);
            const vel = result.velocityField[gx]?.[gy]?.[gz] || { x: 0, y: 0, z: 0 };
            p.pos = [gx * config.gridResolution, gz * config.gridResolution, gy * config.gridResolution];
            p.vel = [vel.x, vel.z, vel.y];
            p.life = 0;
            p.temp = result.temperatureField[gx]?.[gy]?.[gz] || config.ambientTempC;
          }

          const alpha = Math.max(0, 1 - p.life / p.maxLife) * 0.7;
          const pPos = project(
            rotX(rotY([p.pos[0] - cx, p.pos[1], p.pos[2] - cz], ry), rx),
            midX, midY, sc
          );

          ctx!.beginPath();
          ctx!.arc(pPos[0], pPos[1], 2, 0, Math.PI * 2);
          ctx!.fillStyle = tempToRGB(p.temp, minT, maxT).replace('rgb', 'rgba').replace(')', `,${alpha})`);
          ctx!.fill();
        }
      }

      // HUD Info
      ctx!.fillStyle = 'rgba(255,255,255,0.8)';
      ctx!.font = 'bold 12px system-ui';
      ctx!.textAlign = 'left';
      ctx!.fillText(`Max: ${metrics.maxTemperature.toFixed(1)}°C  |  Avg: ${metrics.avgTemperature.toFixed(1)}°C  |  PUE: ${metrics.pue.toFixed(2)}  |  Hotspots: ${metrics.hotspots.length}`, 16, h - 16);

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    // Mouse interaction
    const handleMouseDown = (e: MouseEvent) => {
      cam.current.drag = true;
      cam.current.mx = e.clientX;
      cam.current.my = e.clientY;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!cam.current.drag) return;
      cam.current.ry += (e.clientX - cam.current.mx) * 0.005;
      cam.current.rx += (e.clientY - cam.current.my) * 0.005;
      cam.current.rx = Math.max(-1.5, Math.min(1.5, cam.current.rx));
      cam.current.mx = e.clientX;
      cam.current.my = e.clientY;
    };
    const handleMouseUp = () => { cam.current.drag = false; };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.sc = Math.max(5, Math.min(100, cam.current.sc - e.deltaY * 0.05));
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [result, racks, hvacUnits, showHotspots, showAirflow, selectedSliceZ, viewMode, config, metrics, cx, cz]);

  return (
    <div ref={wrapRef} className="relative w-full h-[500px] rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 text-xs text-white">
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
