'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface RoomData {
  id: string;
  name: string;
  spaceType: string;
  area: number;
  perimeter?: number;
  ceilingHeight: number;
  polygon?: string;
  coolingLoad?: { trValue: number; btuPerHour: number; totalLoad: number } | null;
}
interface FloorData { id: string; floorNumber: number; name: string; rooms: RoomData[] }
interface Props { floors: FloorData[]; buildingType: string; projectName: string }

type V3 = [number, number, number];
type V2 = [number, number];

/* ------------------------------------------------------------------ */
/*  Colour palettes                                                    */
/* ------------------------------------------------------------------ */
const PAL: Record<string, { top: string; front: string; side: string }> = {
  office:          { top: '#93c5fd', front: '#60a5fa', side: '#3b82f6' },
  conference_room: { top: '#c4b5fd', front: '#a78bfa', side: '#8b5cf6' },
  lobby:           { top: '#fde68a', front: '#fbbf24', side: '#f59e0b' },
  retail:          { top: '#f9a8d4', front: '#f472b6', side: '#ec4899' },
  restaurant:      { top: '#fdba74', front: '#fb923c', side: '#f97316' },
  kitchen:         { top: '#fca5a5', front: '#ef4444', side: '#dc2626' },
  server_room:     { top: '#a5b4fc', front: '#6366f1', side: '#4f46e5' },
  residential:     { top: '#6ee7b7', front: '#34d399', side: '#10b981' },
  classroom:       { top: '#7dd3fc', front: '#38bdf8', side: '#0ea5e9' },
  hospital_ward:   { top: '#fca5a5', front: '#f87171', side: '#ef4444' },
  gym:             { top: '#fde047', front: '#facc15', side: '#eab308' },
  theater:         { top: '#d8b4fe', front: '#c084fc', side: '#a855f7' },
  warehouse:       { top: '#cbd5e1', front: '#94a3b8', side: '#64748b' },
};
const DEF_PAL = { top: '#93c5fd', front: '#60a5fa', side: '#3b82f6' };
function spacePal(t: string) { return PAL[t] || DEF_PAL; }
function heatPal(tr: number) {
  const t = Math.min(tr / 10, 1);
  const r = Math.round(255 * t), g = Math.round(255 * (1 - t));
  return {
    top:   `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},130)`,
    front: `rgb(${r},${g},90)`,
    side:  `rgb(${Math.max(0, r - 35)},${Math.max(0, g - 35)},65)`,
  };
}

/** Darken any CSS colour string by a factor (0–1). Works with hex, rgb(), named. */
function darkenHex(col: string, factor: number): string {
  // Parse hex
  const hexMatch = col.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) {
    const r = Math.round(parseInt(hexMatch[1], 16) * factor);
    const g = Math.round(parseInt(hexMatch[2], 16) * factor);
    const b = Math.round(parseInt(hexMatch[3], 16) * factor);
    return `rgb(${r},${g},${b})`;
  }
  // Parse rgb(r,g,b)
  const rgbMatch = col.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    const r = Math.round(Number(rgbMatch[1]) * factor);
    const g = Math.round(Number(rgbMatch[2]) * factor);
    const b = Math.round(Number(rgbMatch[3]) * factor);
    return `rgb(${r},${g},${b})`;
  }
  return col;
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */
function roomDims(room: RoomData) {
  const area = Math.max(1, room.area || 1);
  const h = Math.max(2.4, room.ceilingHeight || 3);
  const p = room.perimeter && room.perimeter > 0 ? room.perimeter : undefined;
  if (p) {
    const s = p / 2, disc = s * s - 4 * area;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const l = (s + sq) / 2, w = (s - sq) / 2;
      if (l > 0 && w > 0) return { l: Math.max(0.8, l), w: Math.max(0.8, w), h };
    }
  }
  const side = Math.sqrt(area);
  return { l: Math.max(0.8, side), w: Math.max(0.8, side), h };
}

function rY(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rX(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function proj(p: V3, cx: number, cy: number, sc: number): V2 {
  return [cx + p[0] * sc, cy - p[1] * sc];
}
function signedArea(pts: V2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a / 2;
}
function pointInPoly(x: number, y: number, pts: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ */
/*  Layout: pack rooms per floor                                       */
/* ------------------------------------------------------------------ */
interface RoomBox {
  room: RoomData; floorNum: number;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  lengthM: number; widthM: number; heightM: number;
}

function layoutFloor(rooms: RoomData[], floorY: number, floorNum: number): RoomBox[] {
  if (!rooms.length) return [];

  // Check if any rooms have polygon data — if so, use real positions
  const hasPolygon = rooms.some(r => {
    if (!r.polygon) return false;
    try {
      const p = JSON.parse(r.polygon);
      return p && typeof p === 'object' && !Array.isArray(p) && p.width > 0;
    } catch { return false; }
  });

  if (hasPolygon) {
    // Use persisted pixel positions, converting to meters via stored scale
    const boxes: RoomBox[] = [];
    for (const r of rooms) {
      let poly: { x: number; y: number; width: number; height: number; scale?: number } | null = null;
      try {
        const p = JSON.parse(r.polygon || '[]');
        if (p && typeof p === 'object' && !Array.isArray(p) && p.width > 0) poly = p;
      } catch { /* no-op */ }

      const dims = roomDims(r);
      if (poly) {
        const pxScale = poly.scale || 50;
        const lM = poly.width / pxScale;
        const wM = poly.height / pxScale;
        const xM = poly.x / pxScale;
        const zM = poly.y / pxScale;
        boxes.push({
          room: r, floorNum,
          x: xM, y: floorY, z: zM,
          w: lM, h: dims.h, d: wM,
          lengthM: lM, widthM: wM, heightM: dims.h,
        });
      } else {
        // Fallback for rooms without polygon on this floor
        boxes.push({
          room: r, floorNum,
          x: 0, y: floorY, z: 0,
          w: dims.l, h: dims.h, d: dims.w,
          lengthM: dims.l, widthM: dims.w, heightM: dims.h,
        });
      }
    }
    return boxes;
  }

  // Fallback: bin-packing layout (no polygon data)
  const items = rooms.map(r => ({ room: r, ...roomDims(r) }))
    .sort((a, b) => b.l * b.w - a.l * a.w);
  const totalArea = rooms.reduce((s, r) => s + Math.max(1, r.area || 1), 0);
  const rowW = Math.max(8, Math.sqrt(totalArea) * 1.4);
  const gap = 0.25;
  const boxes: RoomBox[] = [];
  let cx = 0, cz = 0, rd = 0;
  for (const it of items) {
    if (cx > 0 && cx + it.l > rowW) { cx = 0; cz += rd + gap; rd = 0; }
    boxes.push({
      room: it.room, floorNum,
      x: cx, y: floorY, z: cz,
      w: it.l, h: it.h, d: it.w,
      lengthM: it.l, widthM: it.w, heightM: it.h,
    });
    cx += it.l + gap;
    rd = Math.max(rd, it.w);
  }
  return boxes;
}

/* ------------------------------------------------------------------ */
/*  Face type for painter's algorithm                                  */
/* ------------------------------------------------------------------ */
interface Face {
  pts: V2[];
  fill: string;
  depth: number;
  roomId: string;
  label?: string;
  dimLabel?: string;
  isSlab: boolean;
  isWall: boolean;
}

/* ------------------------------------------------------------------ */
/*  Per-floor geometry data                                            */
/* ------------------------------------------------------------------ */
interface FloorGeo {
  floorNumber: number;
  floorName: string;
  boxes: RoomBox[];
  slab: RoomBox;
  label: { text: string; pos: V3 };
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function BuildingViewer3D({ floors, buildingType, projectName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const cam = useRef({ ry: -0.55, rx: 0.42, sc: 22, drag: false, mx: 0, my: 0 });
  const facesSnap = useRef<Face[]>([]);

  const [selectedRoom, setSelectedRoom] = useState<RoomData | null>(null);
  const [colorMode, setColorMode] = useState<'space' | 'heat'>('space');
  const [viewFloor, setViewFloor] = useState<'all' | number>('all');
  const [, bump] = useState(0);

  const applyCameraPreset = useCallback((preset: 'iso' | 'top' | 'front') => {
    if (preset === 'top') {
      cam.current.rx = 1.08;
      cam.current.ry = -0.35;
    } else if (preset === 'front') {
      cam.current.rx = 0.08;
      cam.current.ry = -0.55;
    } else {
      cam.current.rx = viewFloor === 'all' ? 0.42 : 0.65;
      cam.current.ry = viewFloor === 'all' ? -0.55 : -0.45;
    }
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => bump((n) => n + 1));
  }, [viewFloor]);

  const sorted = useMemo(() => [...floors].sort((a, b) => a.floorNumber - b.floorNumber), [floors]);
  const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);

  /* ---------- build geometry for ALL floors ---------- */
  const allFloorGeos = useMemo(() => {
    const slabH = 0.25;
    const geos: FloorGeo[] = [];
    let curY = 0;
    const dummyRoom: RoomData = { id: '', name: '', spaceType: '', area: 0, ceilingHeight: 0 };

    for (const fl of sorted) {
      const fb = layoutFloor(fl.rooms, curY, fl.floorNumber);
      if (fb.length) {
        const mnX = Math.min(...fb.map(b => b.x)) - 0.6;
        const mnZ = Math.min(...fb.map(b => b.z)) - 0.6;
        const mxX = Math.max(...fb.map(b => b.x + b.w)) + 0.6;
        const mxZ = Math.max(...fb.map(b => b.z + b.d)) + 0.6;
        geos.push({
          floorNumber: fl.floorNumber,
          floorName: fl.name,
          boxes: fb,
          slab: {
            room: { ...dummyRoom, id: `slab-${fl.id}` },
            floorNum: fl.floorNumber,
            x: mnX, y: curY - slabH, z: mnZ,
            w: mxX - mnX, h: slabH, d: mxZ - mnZ,
            lengthM: mxX - mnX, widthM: mxZ - mnZ, heightM: slabH,
          },
          label: { text: fl.name, pos: [(mnX + mxX) / 2, curY + (fb[0]?.h || 3) / 2, mnZ - 1.8] },
        });
      }
      const maxH = fb.reduce((m, b) => Math.max(m, b.h), 3);
      curY += maxH + slabH;
    }
    return geos;
  }, [sorted]);

  /* ---------- filtered geometry based on viewFloor ---------- */
  const { visibleBoxes, visibleSlabs, visibleLabels, center } = useMemo(() => {
    let geos = allFloorGeos;
    if (viewFloor !== 'all') {
      geos = allFloorGeos.filter(g => g.floorNumber === viewFloor);
    }

    let boxes = geos.flatMap(g => g.boxes);
    const slabs = geos.map(g => g.slab);
    const labels = geos.map(g => g.label);

    // For single-floor view, shift everything down to y=0 so it's centered
    if (viewFloor !== 'all' && boxes.length > 0) {
      const minY = Math.min(...boxes.map(b => b.y), ...slabs.map(b => b.y));
      boxes = boxes.map(b => ({ ...b, y: b.y - minY }));
      slabs.forEach(s => { s.y -= minY; });
      labels.forEach(l => { l.pos = [l.pos[0], l.pos[1] - minY, l.pos[2]]; });
    }

    const all = [...boxes, ...slabs];
    const ctrX = all.length ? all.reduce((s, b) => s + b.x + b.w / 2, 0) / all.length : 0;
    const ctrY = all.length ? all.reduce((s, b) => s + b.y + b.h / 2, 0) / all.length : 0;
    const ctrZ = all.length ? all.reduce((s, b) => s + b.z + b.d / 2, 0) / all.length : 0;

    return {
      visibleBoxes: boxes,
      visibleSlabs: slabs,
      visibleLabels: labels,
      center: [ctrX, ctrY, ctrZ] as V3,
    };
  }, [allFloorGeos, viewFloor]);

  /* compute auto-fit scale based on actual canvas size */
  const computeAutoScale = useCallback(() => {
    const all = [...visibleBoxes, ...visibleSlabs];
    if (!all.length) return 22;
    const spanX = Math.max(...all.map(b => b.x + b.w)) - Math.min(...all.map(b => b.x));
    const spanZ = Math.max(...all.map(b => b.z + b.d)) - Math.min(...all.map(b => b.z));
    const spanY = (Math.max(...all.map(b => b.y + b.h)) - Math.min(...all.map(b => b.y))) * 1.2;
    const span = Math.max(spanX, spanZ, spanY, 1);
    // Use actual canvas container width if available
    const el = wrapRef.current;
    const canvasW = el ? el.clientWidth : 700;
    const canvasH = el ? el.clientHeight : 660;
    const fitDim = Math.min(canvasW, canvasH) * 0.55; // fill ~55% of the smaller dimension
    return Math.max(10, fitDim / span);
  }, [visibleBoxes, visibleSlabs]);

  /* auto-fit scale on view change */
  useEffect(() => {
    if (!visibleBoxes.length) return;
    cam.current.sc = computeAutoScale();
    // Single-floor view: look more top-down for better layout visibility
    if (viewFloor !== 'all') {
      cam.current.rx = 0.65;
      cam.current.ry = -0.45;
    } else {
      cam.current.rx = 0.42;
      cam.current.ry = -0.55;
    }
  }, [visibleBoxes, visibleSlabs, viewFloor, computeAutoScale]);

  /* ---------- draw ---------- */
  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const rect = cvs.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    const W = rect.width, H = rect.height;
    if (cvs.width !== Math.round(W * dpr) || cvs.height !== Math.round(H * dpr)) {
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      cvs.style.width = W + 'px';
      cvs.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c1322');
    bg.addColorStop(1, '#1a2436');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const { ry: camRY, rx: camRX, sc } = cam.current;
    const cxP = W / 2, cyP = H * 0.52;
    const xf = (p: V3): V3 => rX(rY([p[0] - center[0], p[1] - center[1], p[2] - center[2]], camRY), camRX);
    const pj = (p: V3): V2 => proj(p, cxP, cyP, sc);

    // Ground grid
    const gridSize = 40;
    const gridStep = 2;
    ctx.strokeStyle = 'rgba(100,116,139,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = -gridSize; i <= gridSize; i += gridStep) {
      const a = pj(xf([i, -0.3, -gridSize]));
      const b = pj(xf([i, -0.3, gridSize]));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const c = pj(xf([-gridSize, -0.3, i]));
      const d = pj(xf([gridSize, -0.3, i]));
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
    }

    const faces: Face[] = [];

    const addBox = (bx: RoomBox, pal: { top: string; front: string; side: string }, label?: string, dimLabel?: string) => {
      const { x, y, z, w, h, d, room } = bx;
      const corners: V3[] = [
        [x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z],
        [x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d],
      ];
      const transformed = corners.map(xf);
      const projected = corners.map(c2 => pj(xf(c2)));
      const isSlab = room.id.startsWith('slab-');
      const defs: { idx: number[]; col: string; lbl?: string; dim?: string; wall: boolean }[] = [
        { idx: [0, 1, 2, 3], col: pal.front, wall: true },
        { idx: [5, 4, 7, 6], col: pal.front, wall: true },
        { idx: [4, 0, 3, 7], col: pal.side, wall: true },
        { idx: [1, 5, 6, 2], col: pal.side, wall: true },
        { idx: [3, 2, 6, 7], col: pal.top, lbl: label, dim: dimLabel, wall: false },
        { idx: [4, 5, 1, 0], col: '#1e293b', wall: false },
      ];
      for (const fd of defs) {
        const pts = fd.idx.map(i => projected[i]) as V2[];
        // Check face orientation — if facing away, darken colour instead of hiding
        const sa = signedArea(pts);
        const isFront = sa < 0;
        // Use farthest vertex depth for better painter's sort
        const maxZ = Math.max(...fd.idx.map(i => transformed[i][2]));
        // Always draw — never cull. Darken back-faces slightly for depth cue
        let col = fd.col;
        if (!isFront) {
          // back-face: darken the colour so it still looks solid
          col = darkenHex(fd.col, 0.65);
        }
        faces.push({
          pts, fill: col, depth: maxZ, roomId: room.id,
          label: isFront ? fd.lbl : undefined,
          dimLabel: isFront ? fd.dim : undefined,
          isSlab, isWall: fd.wall && !isSlab,
        });
      }
    };

    // slabs
    for (const sl of visibleSlabs) addBox(sl, { top: '#475569', front: '#334155', side: '#3f4f63' });

    // rooms
    for (const bx of visibleBoxes) {
      const pal = colorMode === 'heat' && bx.room.coolingLoad
        ? heatPal(bx.room.coolingLoad.trValue)
        : spacePal(bx.room.spaceType);
      const dim = `${bx.lengthM.toFixed(1)} × ${bx.widthM.toFixed(1)} × ${bx.heightM.toFixed(1)} m`;
      addBox(bx, pal, bx.room.name, dim);
    }

    // painter's sort — farthest faces first (highest depth = farthest from camera)
    faces.sort((a, b) => b.depth - a.depth);

    // draw faces
    for (const f of faces) {
      ctx.beginPath();
      ctx.moveTo(f.pts[0][0], f.pts[0][1]);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = f.fill;
      ctx.fill();
      ctx.strokeStyle = f.isSlab ? 'rgba(30,41,59,0.6)' : 'rgba(15,23,42,0.95)';
      ctx.lineWidth = f.isSlab ? 0.8 : 1.35;
      ctx.stroke();

      // windows on walls
      if (f.isWall) {
        const dx1 = f.pts[1][0] - f.pts[0][0], dy1 = f.pts[1][1] - f.pts[0][1];
        const dx2 = f.pts[3][0] - f.pts[0][0], dy2 = f.pts[3][1] - f.pts[0][1];
        const faceW = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const faceH = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (faceW > 30 && faceH > 22) {
          const numWin = Math.min(4, Math.max(1, Math.floor(faceW / 28)));
          const winW = 0.16, winH = 0.35;
          const spacing = 1 / (numWin + 1);
          for (let wi = 0; wi < numWin; wi++) {
            const u = spacing * (wi + 1);
            const v1 = 0.25, v2 = v1 + winH;
            const u1 = u - winW / 2, u2 = u + winW / 2;
            const wc: V2[] = [
              [f.pts[0][0] + dx1 * u1 + dx2 * v1, f.pts[0][1] + dy1 * u1 + dy2 * v1],
              [f.pts[0][0] + dx1 * u2 + dx2 * v1, f.pts[0][1] + dy1 * u2 + dy2 * v1],
              [f.pts[0][0] + dx1 * u2 + dx2 * v2, f.pts[0][1] + dy1 * u2 + dy2 * v2],
              [f.pts[0][0] + dx1 * u1 + dx2 * v2, f.pts[0][1] + dy1 * u1 + dy2 * v2],
            ];
            ctx.beginPath();
            ctx.moveTo(wc[0][0], wc[0][1]);
            for (let ci = 1; ci < 4; ci++) ctx.lineTo(wc[ci][0], wc[ci][1]);
            ctx.closePath();
            ctx.fillStyle = 'rgba(170,215,255,0.22)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(130,185,235,0.35)';
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // label on top face
      if (f.label) {
        const lx = f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length;
        const ly = f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length;
        const dx = f.pts[1][0] - f.pts[0][0], dy = f.pts[1][1] - f.pts[0][1];
        const fw = Math.sqrt(dx * dx + dy * dy);
        if (fw > 20) {
          const fs = Math.min(13, Math.max(8, fw / 5.8));
          ctx.fillStyle = '#0f172a';
          ctx.font = `700 ${fs}px system-ui,sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const maxC = Math.floor(fw / (fs * 0.5));
          const txt = f.label.length > maxC ? f.label.slice(0, maxC - 1) + '\u2026' : f.label;

          const textW = Math.min(fw * 0.92, ctx.measureText(txt).width + 10);
          const boxH = f.dimLabel && fw > 28 ? fs * 2.2 : fs * 1.25;
          ctx.fillStyle = 'rgba(241,245,249,0.78)';
          ctx.beginPath();
          ctx.roundRect(lx - textW / 2, ly - boxH / 2 - 1, textW, boxH, 4);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.fillText(txt, lx, ly - (f.dimLabel ? fs * 0.5 : 0));
          if (f.dimLabel && fw > 28) {
            const fs2 = Math.max(5.5, fs - 1.5);
            ctx.fillStyle = '#334155';
            ctx.font = `500 ${fs2}px system-ui,sans-serif`;
            ctx.fillText(f.dimLabel, lx, ly + fs * 0.55);
          }
        }
      }
    }

    // floor labels
    for (const fl of visibleLabels) {
      const tp = pj(xf(fl.pos));
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '700 13px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fl.text, tp[0], tp[1]);
    }

    // current view label (top-center)
    const viewLabel = viewFloor === 'all'
      ? 'All Floors'
      : `Floor ${viewFloor} — ${allFloorGeos.find(g => g.floorNumber === viewFloor)?.floorName || ''}`;
    ctx.fillStyle = 'rgba(203,213,225,0.7)';
    ctx.font = '600 14px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(viewLabel, W / 2, 14);

    // axes indicator
    const axLen = 25;
    const axOrig: V2 = [45, H - 35];
    const drawAx = (dir: V3, color: string, lbl: string) => {
      const nx = dir[0] * axLen, ny = -dir[1] * axLen;
      ctx.beginPath();
      ctx.moveTo(axOrig[0], axOrig[1]);
      ctx.lineTo(axOrig[0] + nx, axOrig[1] + ny);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 9px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lbl, axOrig[0] + nx * 1.35, axOrig[1] + ny * 1.35);
    };
    drawAx(rX(rY([1, 0, 0] as V3, camRY), camRX), '#ef4444', 'L');
    drawAx(rX(rY([0, 1, 0] as V3, camRY), camRX), '#22c55e', 'H');
    drawAx(rX(rY([0, 0, 1] as V3, camRY), camRX), '#3b82f6', 'W');

    facesSnap.current = faces;
  }, [visibleBoxes, visibleSlabs, center, visibleLabels, colorMode, viewFloor, allFloorGeos]);

  useEffect(() => { draw(); }, [draw]);

  /* ---------- mouse interaction ---------- */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    let wasDrag = false;

    const onDown = (e: MouseEvent) => {
      cam.current.drag = true;
      wasDrag = false;
      cam.current.mx = e.clientX;
      cam.current.my = e.clientY;
    };
    const onMove = (e: MouseEvent) => {
      if (!cam.current.drag) return;
      const dx = e.clientX - cam.current.mx, dy = e.clientY - cam.current.my;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) wasDrag = true;
      cam.current.ry += dx * 0.006;
      cam.current.rx += dy * 0.004;
      cam.current.rx = Math.max(-1.2, Math.min(1.2, cam.current.rx));
      cam.current.mx = e.clientX;
      cam.current.my = e.clientY;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(draw);
    };
    const onUp = () => { cam.current.drag = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.sc *= e.deltaY > 0 ? 0.93 : 1.07;
      cam.current.sc = Math.max(4, Math.min(500, cam.current.sc));
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(draw);
    };
    const onClick = (e: MouseEvent) => {
      if (wasDrag) return;
      const r = cvs.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const reversed = [...facesSnap.current].reverse();
      for (const f of reversed) {
        if (f.isSlab) continue;
        if (pointInPoly(mx, my, f.pts)) {
          const allR = floors.flatMap(fl => fl.rooms);
          setSelectedRoom(allR.find(rm => rm.id === f.roomId) || null);
          bump(n => n + 1);
          return;
        }
      }
    };

    let touchMoved = false;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        cam.current.drag = true;
        cam.current.mx = e.touches[0].clientX;
        cam.current.my = e.touches[0].clientY;
        touchMoved = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      touchMoved = true;
      if (!cam.current.drag || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - cam.current.mx;
      const dy = e.touches[0].clientY - cam.current.my;
      cam.current.ry += dx * 0.006;
      cam.current.rx += dy * 0.004;
      cam.current.rx = Math.max(-1.2, Math.min(1.2, cam.current.rx));
      cam.current.mx = e.touches[0].clientX;
      cam.current.my = e.touches[0].clientY;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(draw);
    };
    const onTouchEnd = (e: TouchEvent) => {
      cam.current.drag = false;
      if (!touchMoved && e.changedTouches.length === 1) {
        const r = cvs.getBoundingClientRect();
        const mx = e.changedTouches[0].clientX - r.left;
        const my = e.changedTouches[0].clientY - r.top;
        const reversed = [...facesSnap.current].reverse();
        for (const f of reversed) {
          if (f.isSlab) continue;
          if (pointInPoly(mx, my, f.pts)) {
            const allR = floors.flatMap(fl => fl.rooms);
            setSelectedRoom(allR.find(rm => rm.id === f.roomId) || null);
            bump(n => n + 1);
            return;
          }
        }
      }
    };

    cvs.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cvs.addEventListener('wheel', onWheel, { passive: false });
    cvs.addEventListener('click', onClick);
    cvs.addEventListener('touchstart', onTouchStart, { passive: true });
    cvs.addEventListener('touchmove', onTouchMove, { passive: false });
    cvs.addEventListener('touchend', onTouchEnd);
    return () => {
      cvs.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cvs.removeEventListener('wheel', onWheel);
      cvs.removeEventListener('click', onClick);
      cvs.removeEventListener('touchstart', onTouchStart);
      cvs.removeEventListener('touchmove', onTouchMove);
      cvs.removeEventListener('touchend', onTouchEnd);
    };
  }, [draw, floors]);

  /* resize */
  useEffect(() => {
    const obs = new ResizeObserver(() => draw());
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [draw]);

  /* empty */
  if (totalRooms === 0) {
    return (
      <div className="flex items-center justify-center h-[520px] border border-border rounded-xl bg-secondary/30">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-semibold mb-1">No rooms to visualise</p>
          <p className="text-sm">Add rooms first, then open 3D View.</p>
        </div>
      </div>
    );
  }

  const selDims = selectedRoom ? roomDims(selectedRoom) : null;

  const resetView = () => {
    applyCameraPreset('iso');
    cam.current.sc = computeAutoScale();
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  };

  /* ordinal helper */
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  /* ---------- render ---------- */
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* header */}
      <div className="flex flex-col gap-0 border-b border-border bg-secondary/30">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <h3 className="text-sm font-semibold">{projectName} — 3D Building View</h3>
            <p className="text-xs text-muted-foreground capitalize">
              {buildingType} · {sorted.length} floor{sorted.length !== 1 ? 's' : ''} · {totalRooms} room{totalRooms !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetView}
              className="px-3 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border">
              Reset View
            </button>
            <button
              onClick={() => {
                cam.current.sc = Math.min(500, cam.current.sc * 1.25);
                cancelAnimationFrame(raf.current);
                raf.current = requestAnimationFrame(draw);
              }}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => {
                cam.current.sc = Math.max(4, cam.current.sc * 0.8);
                cancelAnimationFrame(raf.current);
                raf.current = requestAnimationFrame(draw);
              }}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border"
              aria-label="Zoom out"
            >
              -
            </button>
            <button
              onClick={() => applyCameraPreset('top')}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border"
            >
              Top
            </button>
            <button
              onClick={() => applyCameraPreset('front')}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border"
            >
              Front
            </button>
            <button
              onClick={() => applyCameraPreset('iso')}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border"
            >
              Iso
            </button>
            <button onClick={() => setColorMode(m => m === 'space' ? 'heat' : 'space')}
              className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-white">
              {colorMode === 'space' ? 'Heat Map' : 'Space Colors'}
            </button>
          </div>
        </div>

        {/* floor selector tabs */}
        <div className="flex items-center gap-0 px-3 overflow-x-auto">
          <button
            onClick={() => setViewFloor('all')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              viewFloor === 'all'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            All Floors
          </button>
          {sorted.map(fl => (
            <button
              key={fl.id}
              onClick={() => setViewFloor(fl.floorNumber)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                viewFloor === fl.floorNumber
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {ordinal(fl.floorNumber)} Floor
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
        {/* 3D canvas */}
        <div ref={wrapRef} className="relative min-h-[660px] bg-slate-950 cursor-grab active:cursor-grabbing select-none">
          <canvas ref={canvasRef} className="absolute inset-0" />
          <div className="absolute bottom-3 left-3 pointer-events-none text-[11px] text-slate-500 leading-relaxed">
            <p>Drag to rotate · Scroll or +/- to zoom</p>
            <p>Click a room for details</p>
          </div>
        </div>

        {/* sidebar */}
        <div className="border-l border-border p-4 bg-secondary/10 overflow-auto max-h-[620px]">
          <h4 className="text-sm font-semibold mb-2">Room Details</h4>
          {selectedRoom && selDims ? (
            <div className="space-y-1.5 text-sm">
              <p><span className="text-muted-foreground">Name:</span> {selectedRoom.name}</p>
              <p><span className="text-muted-foreground">Type:</span> {selectedRoom.spaceType.replace(/_/g, ' ')}</p>
              <div className="border-t border-border pt-2 mt-2" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dimensions</p>
              <p><span className="text-muted-foreground">Length:</span> {selDims.l.toFixed(2)} m <span className="text-muted-foreground">({(selDims.l * 3.28084).toFixed(2)} ft)</span></p>
              <p><span className="text-muted-foreground">Width:</span> {selDims.w.toFixed(2)} m <span className="text-muted-foreground">({(selDims.w * 3.28084).toFixed(2)} ft)</span></p>
              <p><span className="text-muted-foreground">Height:</span> {selDims.h.toFixed(2)} m <span className="text-muted-foreground">({(selDims.h * 3.28084).toFixed(2)} ft)</span></p>
              <p><span className="text-muted-foreground">Floor Area:</span> {selectedRoom.area.toFixed(2)} m²</p>
              {selectedRoom.coolingLoad && (
                <>
                  <div className="border-t border-border pt-2 mt-2" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cooling Load</p>
                  <p><span className="text-muted-foreground">TR:</span> {selectedRoom.coolingLoad.trValue.toFixed(2)}</p>
                  <p><span className="text-muted-foreground">BTU/h:</span> {selectedRoom.coolingLoad.btuPerHour.toLocaleString()}</p>
                  <p><span className="text-muted-foreground">Load:</span> {selectedRoom.coolingLoad.totalLoad.toLocaleString()} W</p>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click a room to view details.</p>
          )}

          <div className="mt-5">
            <h4 className="text-sm font-semibold mb-2">Legend</h4>
            {colorMode === 'space' ? (
              <div className="space-y-1.5 max-h-[200px] overflow-auto pr-1">
                {Object.entries(PAL).map(([key, { front }]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: front }} />
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground space-y-2">
                <div className="h-3 rounded" style={{ background: 'linear-gradient(to right, rgb(0,255,130), rgb(128,128,90), rgb(255,0,65))' }} />
                <div className="flex justify-between"><span>Low (0 TR)</span><span>High (10+ TR)</span></div>
              </div>
            )}
          </div>

          {/* room list for current view */}
          <div className="mt-5">
            <h4 className="text-sm font-semibold mb-2">
              {viewFloor === 'all' ? 'All Rooms' : `${ordinal(viewFloor as number)} Floor Rooms`}
            </h4>
            <div className="space-y-1 max-h-[180px] overflow-auto pr-1">
              {visibleBoxes.map(bx => (
                <button
                  key={bx.room.id}
                  onClick={() => { setSelectedRoom(bx.room); bump(n => n + 1); }}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                    selectedRoom?.id === bx.room.id
                      ? 'bg-accent/20 text-accent-foreground'
                      : 'hover:bg-secondary/60 text-muted-foreground'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: spacePal(bx.room.spaceType).front }} />
                  <span className="truncate">{bx.room.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-[10px]">{bx.lengthM.toFixed(1)}×{bx.widthM.toFixed(1)}×{bx.heightM.toFixed(1)}m</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
