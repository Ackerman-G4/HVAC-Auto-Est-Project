'use client';

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Eye, Layers, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Room {
  id: string;
  name: string;
  spaceType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface FloorPlanMultiViewProps {
  rooms: Room[];
  scale: number; // pixels per meter
  ceilingHeight?: number; // meters, default 3.0
  onClose: () => void;
  visible: boolean;
}

const DEFAULT_CEILING = 3.0;
const FONT = 'Inter, system-ui, -apple-system, sans-serif';

// ─── Elevation rendering helpers ────────────────────────────────────────────

/**
 * Compute the bounding box of all rooms in METER coordinates.
 */
function getBounds(rooms: Room[], scale: number) {
  if (rooms.length === 0) return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    const rx = r.x / scale;
    const ry = r.y / scale;
    const rw = r.width / scale;
    const rh = r.height / scale;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx + rw);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry + rh);
  });
  return { minX, maxX, minY, maxY };
}

/**
 * Calculate a uniform pixel scale to fit a metric range into canvas dimensions,
 * with padding.
 */
function fitScale(
  rangeW: number,
  rangeH: number,
  canvasW: number,
  canvasH: number,
  padding = 40,
) {
  const usableW = canvasW - padding * 2;
  const usableH = canvasH - padding * 2;
  return Math.min(usableW / rangeW, usableH / rangeH);
}

// ─── Render each view ──────────────────────────────────────────────────────

function renderTopView(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rooms: Room[],
  scale: number,
) {
  const bounds = getBounds(rooms, scale);
  const rangeW = bounds.maxX - bounds.minX || 1;
  const rangeH = bounds.maxY - bounds.minY || 1;
  const pad = 36;
  const pxScale = fitScale(rangeW, rangeH, w, h, pad);

  const offsetX = (w - rangeW * pxScale) / 2;
  const offsetY = (h - rangeH * pxScale) / 2;

  // Grid
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 0.5;
  const gridStep = 1; // 1m
  for (let gx = 0; gx <= rangeW; gx += gridStep) {
    const px = offsetX + gx * pxScale;
    ctx.beginPath();
    ctx.moveTo(px, pad / 2);
    ctx.lineTo(px, h - pad / 2);
    ctx.stroke();
  }
  for (let gy = 0; gy <= rangeH; gy += gridStep) {
    const py = offsetY + gy * pxScale;
    ctx.beginPath();
    ctx.moveTo(pad / 2, py);
    ctx.lineTo(w - pad / 2, py);
    ctx.stroke();
  }

  // Rooms
  rooms.forEach((room) => {
    const rx = (room.x / scale - bounds.minX) * pxScale + offsetX;
    const ry = (room.y / scale - bounds.minY) * pxScale + offsetY;
    const rw = (room.width / scale) * pxScale;
    const rh = (room.height / scale) * pxScale;

    ctx.fillStyle = room.color;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);

    // Wall hatch lines (diagonal) for architectural look
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    ctx.strokeStyle = 'rgba(31, 41, 55, 0.06)';
    ctx.lineWidth = 0.5;
    for (let d = -Math.max(rw, rh); d < Math.max(rw, rh) * 2; d += 8) {
      ctx.beginPath();
      ctx.moveTo(rx + d, ry);
      ctx.lineTo(rx + d + rh, ry + rh);
      ctx.stroke();
    }
    ctx.restore();

    // Label
    const fontSize = Math.max(9, Math.min(13, rw / 6));
    ctx.fillStyle = '#111827';
    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(room.name, rx + rw / 2, ry + rh / 2 - fontSize * 0.6);

    // Dimensions
    ctx.font = `400 ${Math.max(8, fontSize - 2)}px ${FONT}`;
    ctx.fillStyle = '#6B7280';
    const wM = (room.width / scale).toFixed(1);
    const hM = (room.height / scale).toFixed(1);
    ctx.fillText(`${wM} × ${hM} m`, rx + rw / 2, ry + rh / 2 + fontSize * 0.5);
  });

  // Dimension lines along top & left
  ctx.fillStyle = '#374151';
  ctx.font = `500 10px ${FONT}`;
  ctx.textAlign = 'center';
  const totalW = rangeW.toFixed(1);
  const totalH = rangeH.toFixed(1);

  // Top dimension line
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 1;
  const dimY = offsetY - 14;
  ctx.beginPath();
  ctx.moveTo(offsetX, dimY);
  ctx.lineTo(offsetX + rangeW * pxScale, dimY);
  ctx.stroke();
  // End ticks
  ctx.beginPath();
  ctx.moveTo(offsetX, dimY - 4);
  ctx.lineTo(offsetX, dimY + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(offsetX + rangeW * pxScale, dimY - 4);
  ctx.lineTo(offsetX + rangeW * pxScale, dimY + 4);
  ctx.stroke();
  ctx.fillStyle = '#2563EB';
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(`${totalW} m`, offsetX + (rangeW * pxScale) / 2, dimY - 6);

  // Left dimension line
  const dimX = offsetX - 14;
  ctx.beginPath();
  ctx.moveTo(dimX, offsetY);
  ctx.lineTo(dimX, offsetY + rangeH * pxScale);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(dimX - 4, offsetY);
  ctx.lineTo(dimX + 4, offsetY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(dimX - 4, offsetY + rangeH * pxScale);
  ctx.lineTo(dimX + 4, offsetY + rangeH * pxScale);
  ctx.stroke();
  ctx.save();
  ctx.translate(dimX - 6, offsetY + (rangeH * pxScale) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(`${totalH} m`, 0, 0);
  ctx.restore();
}

function renderFrontElevation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rooms: Room[],
  scale: number,
  ceilingH: number,
  label: string,
  facing: 'south' | 'north',
) {
  const bounds = getBounds(rooms, scale);
  const rangeW = bounds.maxX - bounds.minX || 1;
  const pad = 36;
  const pxScale = fitScale(rangeW, ceilingH, w, h, pad);

  const offsetX = (w - rangeW * pxScale) / 2;
  const groundY = h - pad;

  // Floor line
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad / 2, groundY);
  ctx.lineTo(w - pad / 2, groundY);
  ctx.stroke();

  // Ceiling line
  const ceilingY = groundY - ceilingH * pxScale;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad / 2, ceilingY);
  ctx.lineTo(w - pad / 2, ceilingY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Height label on right
  ctx.fillStyle = '#2563EB';
  ctx.font = `500 10px ${FONT}`;
  ctx.textAlign = 'left';
  const hLabelX = offsetX + rangeW * pxScale + 8;
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hLabelX, groundY);
  ctx.lineTo(hLabelX, ceilingY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hLabelX - 3, groundY);
  ctx.lineTo(hLabelX + 3, groundY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hLabelX - 3, ceilingY);
  ctx.lineTo(hLabelX + 3, ceilingY);
  ctx.stroke();
  ctx.save();
  ctx.translate(hLabelX + 12, (groundY + ceilingY) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(`${ceilingH.toFixed(1)} m`, 0, 0);
  ctx.restore();

  // Sort rooms by X for front/rear view
  const sorted = [...rooms].sort((a, b) => {
    const ax = facing === 'south' ? a.x : -(a.x + a.width);
    const bx = facing === 'south' ? b.x : -(b.x + b.width);
    return ax - bx;
  });

  sorted.forEach((room) => {
    let rx: number;
    if (facing === 'south') {
      rx = (room.x / scale - bounds.minX) * pxScale + offsetX;
    } else {
      // North view: mirrored
      rx = ((bounds.maxX - (room.x / scale + room.width / scale)) ) * pxScale + offsetX;
    }
    const rw = (room.width / scale) * pxScale;
    const rh = ceilingH * pxScale;
    const ry = groundY - rh;

    ctx.fillStyle = room.color;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);

    // Window-like detail (aesthetic)
    const windowY = groundY - 1.0 * pxScale;
    const windowTopY = groundY - 2.2 * pxScale;
    if (ceilingH > 2.5 && rw > 20) {
      // Window pane
      ctx.strokeStyle = '#9CA3AF';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(rx + rw * 0.15, windowTopY, rw * 0.7, windowY - windowTopY);
      // Cross divider
      const wxMid = rx + rw * 0.15 + (rw * 0.7) / 2;
      const wyMid = windowTopY + (windowY - windowTopY) / 2;
      ctx.beginPath();
      ctx.moveTo(wxMid, windowTopY);
      ctx.lineTo(wxMid, windowY);
      ctx.moveTo(rx + rw * 0.15, wyMid);
      ctx.lineTo(rx + rw * 0.15 + rw * 0.7, wyMid);
      ctx.stroke();
    }

    // Door indication (small rectangle at bottom)
    if (rw > 30) {
      const doorW = Math.min(rw * 0.2, 18);
      const doorH = Math.min(rh * 0.65, ceilingH * pxScale * 0.7);
      ctx.strokeStyle = '#6B7280';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(rx + rw * 0.5 - doorW / 2, groundY - doorH, doorW, doorH);
      // Door handle
      ctx.fillStyle = '#6B7280';
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5 + doorW / 2 - 3, groundY - doorH / 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    const fontSize = Math.max(8, Math.min(12, rw / 5));
    ctx.fillStyle = '#111827';
    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(room.name, rx + rw / 2, ry + rh * 0.25);

    // Width dimension below floor line
    ctx.fillStyle = '#374151';
    ctx.font = `400 ${Math.max(8, fontSize - 2)}px ${FONT}`;
    ctx.fillText(`${(room.width / scale).toFixed(1)} m`, rx + rw / 2, groundY + 14);
  });

  // Overall dimension line below
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 1;
  const dimLineY = groundY + 26;
  ctx.beginPath();
  ctx.moveTo(offsetX, dimLineY);
  ctx.lineTo(offsetX + rangeW * pxScale, dimLineY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(offsetX, dimLineY - 3);
  ctx.lineTo(offsetX, dimLineY + 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(offsetX + rangeW * pxScale, dimLineY - 3);
  ctx.lineTo(offsetX + rangeW * pxScale, dimLineY + 3);
  ctx.stroke();
  ctx.fillStyle = '#2563EB';
  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${rangeW.toFixed(1)} m`, offsetX + (rangeW * pxScale) / 2, dimLineY - 6);

  // Floor label
  ctx.fillStyle = '#9CA3AF';
  ctx.font = `500 9px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('FL ±0.00', pad / 2, groundY + 12);
  ctx.fillText(`CL +${ceilingH.toFixed(2)}`, pad / 2, ceilingY - 4);
}

function renderSideElevation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rooms: Room[],
  scale: number,
  ceilingH: number,
  label: string,
  facing: 'east' | 'west',
) {
  const bounds = getBounds(rooms, scale);
  const rangeD = bounds.maxY - bounds.minY || 1; // depth range
  const pad = 36;
  const pxScale = fitScale(rangeD, ceilingH, w, h, pad);

  const offsetX = (w - rangeD * pxScale) / 2;
  const groundY = h - pad;

  // Floor line
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad / 2, groundY);
  ctx.lineTo(w - pad / 2, groundY);
  ctx.stroke();

  // Ceiling line
  const ceilingY = groundY - ceilingH * pxScale;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad / 2, ceilingY);
  ctx.lineTo(w - pad / 2, ceilingY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Height label
  ctx.fillStyle = '#2563EB';
  ctx.font = `500 10px ${FONT}`;
  const hLabelX = offsetX + rangeD * pxScale + 8;
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hLabelX, groundY);
  ctx.lineTo(hLabelX, ceilingY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hLabelX - 3, groundY);
  ctx.lineTo(hLabelX + 3, groundY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hLabelX - 3, ceilingY);
  ctx.lineTo(hLabelX + 3, ceilingY);
  ctx.stroke();
  ctx.save();
  ctx.translate(hLabelX + 12, (groundY + ceilingY) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(`${ceilingH.toFixed(1)} m`, 0, 0);
  ctx.restore();

  const sorted = [...rooms].sort((a, b) => {
    const ay = facing === 'east' ? a.y : -(a.y + a.height);
    const by = facing === 'east' ? b.y : -(b.y + b.height);
    return ay - by;
  });

  sorted.forEach((room) => {
    let rx: number;
    if (facing === 'east') {
      rx = (room.y / scale - bounds.minY) * pxScale + offsetX;
    } else {
      // West view: mirrored depth
      rx = ((bounds.maxY - (room.y / scale + room.height / scale))) * pxScale + offsetX;
    }
    const rw = (room.height / scale) * pxScale; // depth becomes width in side view
    const rh = ceilingH * pxScale;
    const ry = groundY - rh;

    ctx.fillStyle = room.color;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);

    // Window detail
    if (ceilingH > 2.5 && rw > 20) {
      const windowY = groundY - 1.0 * pxScale;
      const windowTopY = groundY - 2.2 * pxScale;
      ctx.strokeStyle = '#9CA3AF';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(rx + rw * 0.15, windowTopY, rw * 0.7, windowY - windowTopY);
      // Cross divider
      const wxMid = rx + rw * 0.15 + (rw * 0.7) / 2;
      const wyMid = windowTopY + (windowY - windowTopY) / 2;
      ctx.beginPath();
      ctx.moveTo(wxMid, windowTopY);
      ctx.lineTo(wxMid, windowY);
      ctx.moveTo(rx + rw * 0.15, wyMid);
      ctx.lineTo(rx + rw * 0.15 + rw * 0.7, wyMid);
      ctx.stroke();
    }

    // Label
    const fontSize = Math.max(8, Math.min(12, rw / 5));
    ctx.fillStyle = '#111827';
    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(room.name, rx + rw / 2, ry + rh * 0.25);

    // Depth dimension below floor line
    ctx.fillStyle = '#374151';
    ctx.font = `400 ${Math.max(8, fontSize - 2)}px ${FONT}`;
    ctx.fillText(`${(room.height / scale).toFixed(1)} m`, rx + rw / 2, groundY + 14);
  });

  // Overall dimension line
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 1;
  const dimLineY = groundY + 26;
  ctx.beginPath();
  ctx.moveTo(offsetX, dimLineY);
  ctx.lineTo(offsetX + rangeD * pxScale, dimLineY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(offsetX, dimLineY - 3);
  ctx.lineTo(offsetX, dimLineY + 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(offsetX + rangeD * pxScale, dimLineY - 3);
  ctx.lineTo(offsetX + rangeD * pxScale, dimLineY + 3);
  ctx.stroke();
  ctx.fillStyle = '#2563EB';
  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${rangeD.toFixed(1)} m`, offsetX + (rangeD * pxScale) / 2, dimLineY - 6);

  // Floor & Ceiling labels
  ctx.fillStyle = '#9CA3AF';
  ctx.font = `500 9px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('FL ±0.00', pad / 2, groundY + 12);
  ctx.fillText(`CL +${ceilingH.toFixed(2)}`, pad / 2, ceilingY - 4);
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function FloorPlanMultiView({
  rooms,
  scale,
  ceilingHeight = DEFAULT_CEILING,
  onClose,
  visible,
}: FloorPlanMultiViewProps) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const rearRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);

  const renderAll = useCallback(() => {
    const drawOn = (
      ref: React.RefObject<HTMLCanvasElement | null>,
      fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    ) => {
      const c = ref.current;
      if (!c) return;
      const parent = c.parentElement;
      if (parent) {
        c.width = parent.clientWidth;
        c.height = parent.clientHeight;
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);

      // Background
      ctx.fillStyle = '#FAFBFC';
      ctx.fillRect(0, 0, c.width, c.height);

      fn(ctx, c.width, c.height);
    };

    drawOn(topRef, (ctx, w, h) => renderTopView(ctx, w, h, rooms, scale));
    drawOn(frontRef, (ctx, w, h) =>
      renderFrontElevation(ctx, w, h, rooms, scale, ceilingHeight, 'Front', 'south'),
    );
    drawOn(rearRef, (ctx, w, h) =>
      renderFrontElevation(ctx, w, h, rooms, scale, ceilingHeight, 'Rear', 'north'),
    );
    drawOn(leftRef, (ctx, w, h) =>
      renderSideElevation(ctx, w, h, rooms, scale, ceilingHeight, 'Left', 'west'),
    );
    drawOn(rightRef, (ctx, w, h) =>
      renderSideElevation(ctx, w, h, rooms, scale, ceilingHeight, 'Right', 'east'),
    );
  }, [rooms, scale, ceilingHeight]);

  useEffect(() => {
    if (!visible) return;
    // Slight delay so DOM has painted the canvases
    const t = setTimeout(renderAll, 60);
    return () => clearTimeout(t);
  }, [visible, renderAll]);

  useEffect(() => {
    if (!visible) return;
    const handleResize = () => renderAll();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [visible, renderAll]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative bg-[#F8F9FA] rounded-xl shadow-2xl w-[96vw] h-[93vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center">
                  <Box className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-[13px] tracking-tight text-foreground">
                    Architectural Multi-View
                  </h3>
                  <p className="text-[10px] text-muted-foreground tracking-wide">
                    {rooms.length} room{rooms.length !== 1 ? 's' : ''} &middot; {ceilingHeight.toFixed(1)}m ceiling &middot; 1m = {scale}px
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* ── Views Grid ─────────────────────────────────────────────── */}
            <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-px bg-[#DEE2E6] overflow-hidden">
              {/* Top-left: Left Side Elevation */}
              <ViewPanel label="Left Elevation" subtitle="West" accentColor={false}>
                <canvas ref={leftRef} className="absolute inset-0 w-full h-full" />
              </ViewPanel>

              {/* Top-center: Top View (Plan) — primary view */}
              <ViewPanel label="Top View" subtitle="Plan" accentColor={true}>
                <canvas ref={topRef} className="absolute inset-0 w-full h-full" />
              </ViewPanel>

              {/* Top-right: Right Side Elevation */}
              <ViewPanel label="Right Elevation" subtitle="East" accentColor={false}>
                <canvas ref={rightRef} className="absolute inset-0 w-full h-full" />
              </ViewPanel>

              {/* Bottom-left: Front Elevation */}
              <ViewPanel label="Front Elevation" subtitle="South" accentColor={false}>
                <canvas ref={frontRef} className="absolute inset-0 w-full h-full" />
              </ViewPanel>

              {/* Bottom-center: Rear Elevation */}
              <ViewPanel label="Rear Elevation" subtitle="North" accentColor={false}>
                <canvas ref={rearRef} className="absolute inset-0 w-full h-full" />
              </ViewPanel>

              {/* Bottom-right: Legend / Info */}
              <div className="bg-white flex flex-col">
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                    Room Legend
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto px-2.5 py-2">
                  {/* Room list */}
                  <div className="space-y-px">
                    {rooms.map((room) => {
                      const wM = (room.width / scale).toFixed(1);
                      const dM = (room.height / scale).toFixed(1);
                      const aM = ((room.width / scale) * (room.height / scale)).toFixed(1);
                      return (
                        <div
                          key={room.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F3F4F6] transition-colors"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-[3px] border border-black/10 flex-shrink-0"
                            style={{ backgroundColor: room.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[11px] text-foreground truncate leading-tight">
                              {room.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              {room.spaceType} &middot; {wM}&times;{dM}m &middot; {aM} m&sup2;
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary stats */}
                  <div className="mt-3 pt-2.5 border-t border-[#E5E7EB] space-y-1 text-[10px] text-muted-foreground">
                    {[
                      ['Rooms', rooms.length.toString()],
                      [
                        'Floor area',
                        `${rooms.reduce((s, r) => s + (r.width / scale) * (r.height / scale), 0).toFixed(1)} m\u00B2`,
                      ],
                      ['Ceiling', `${ceilingHeight.toFixed(1)} m`],
                      [
                        'Volume',
                        `${(rooms.reduce((s, r) => s + (r.width / scale) * (r.height / scale), 0) * ceilingHeight).toFixed(1)} m\u00B3`,
                      ],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between">
                        <span>{label}</span>
                        <span className="font-semibold text-foreground tabular-nums">{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* View legend */}
                  <div className="mt-3 pt-2.5 border-t border-[#E5E7EB] text-[10px] text-muted-foreground space-y-1">
                    <p className="font-semibold text-muted-foreground text-[9px] uppercase tracking-[0.06em] mb-1">Drawing Legend</p>
                    <div className="flex items-center gap-2">
                      <div className="w-5 border-t-2 border-[#6B7280]" />
                      <span>Floor line (FL &plusmn;0.00)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 border-t border-dashed border-[#9CA3AF]" />
                      <span>Ceiling line</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 border-t border-[#2563EB]" />
                      <span>Dimension lines</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-2.5 border border-[#9CA3AF] rounded-[2px]" />
                      <span>Window</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-3 border border-[#6B7280] rounded-[1px]" />
                      <span>Door</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-white text-[10px] text-muted-foreground">
              <span className="tracking-wide">
                Top (Plan) + Front &middot; Rear &middot; Left &middot; Right Elevations &mdash; All dimensions in meters
              </span>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Reusable View Panel ───────────────────────────────────────────────────

function ViewPanel({
  label,
  subtitle,
  accentColor,
  children,
}: {
  label: string;
  subtitle: string;
  accentColor: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#E5E7EB] bg-[#F9FAFB]">
        <Eye className={`w-3 h-3 ${accentColor ? 'text-accent' : 'text-muted-foreground'}`} />
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.08em] ${
            accentColor ? 'text-accent' : 'text-muted-foreground'
          }`}
        >
          {label}
        </span>
        <span className="text-[9px] text-muted-foreground">({subtitle})</span>
      </div>
      <div className="flex-1 relative">{children}</div>
    </div>
  );
}
