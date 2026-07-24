'use client';

import { useEffect, useState, useRef, useCallback, useMemo, use } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Printer,
  Download,
  Layers,
  Building2,
  Ruler,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import { authFetch } from '@/lib/api-client';
import {
  getPolygonBounds,
  parseRoomPolygon,
  type RoomPolygonPoint,
} from '@/lib/utils/room-polygon';

interface RoomData {
  id: string;
  name: string;
  spaceType: string;
  area: number;
  ceilingHeight: number;
  polygon?: unknown;
  coolingLoad: {
    totalLoad: number;
    sensibleLoad: number;
    latentLoad: number;
  } | null;
}

interface FloorData {
  id: string;
  floorNumber: number;
  name: string;
  scale?: number;
  rooms: RoomData[];
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface LayoutRoomBase extends RoomData {
  colorIdx: number;
  cx: number;
  cy: number;
  minDim: number;
}

interface BoxLayoutRoom extends LayoutRoomBase {
  mode: 'box';
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PolygonLayoutRoom extends LayoutRoomBase {
  mode: 'polygon';
  points: CanvasPoint[];
}

type LayoutRoom = BoxLayoutRoom | PolygonLayoutRoom;

const ROOM_COLORS = [
  'rgba(37, 99, 235, 0.20)',
  'rgba(22, 163, 74, 0.20)',
  'rgba(234, 179, 8, 0.20)',
  'rgba(239, 68, 68, 0.20)',
  'rgba(168, 85, 247, 0.20)',
  'rgba(14, 165, 233, 0.20)',
  'rgba(249, 115, 22, 0.20)',
  'rgba(236, 72, 153, 0.20)',
  'rgba(20, 184, 166, 0.20)',
  'rgba(245, 158, 11, 0.20)',
];

const ROOM_BORDER_COLORS = [
  '#2563EB',
  '#16A34A',
  '#CA8A04',
  '#DC2626',
  '#9333EA',
  '#0EA5E9',
  '#EA580C',
  '#DB2777',
  '#0D9488',
  '#D97706',
];

const ROOM_SWATCH_CLASSES = [
  'bg-[rgba(37,99,235,0.2)] border-[#2563EB]',
  'bg-[rgba(22,163,74,0.2)] border-[#16A34A]',
  'bg-[rgba(234,179,8,0.2)] border-[#CA8A04]',
  'bg-[rgba(239,68,68,0.2)] border-[#DC2626]',
  'bg-[rgba(168,85,247,0.2)] border-[#9333EA]',
  'bg-[rgba(14,165,233,0.2)] border-[#0EA5E9]',
  'bg-[rgba(249,115,22,0.2)] border-[#EA580C]',
  'bg-[rgba(236,72,153,0.2)] border-[#DB2777]',
  'bg-[rgba(20,184,166,0.2)] border-[#0D9488]',
  'bg-[rgba(245,158,11,0.2)] border-[#D97706]',
];

const SPACE_TYPE_LABELS: Record<string, string> = {
  office: 'Office',
  conference_room: 'Conference Room',
  lobby: 'Lobby',
  retail: 'Retail',
  restaurant: 'Restaurant',
  kitchen: 'Kitchen',
  server_room: 'Server Room',
  residential: 'Residential',
  classroom: 'Classroom',
  hospital_ward: 'Hospital Ward',
  gym: 'Gym',
  theater: 'Theater',
  warehouse: 'Warehouse',
};

function polygonCentroid(points: RoomPolygonPoint[]): { x: number; y: number } {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    const cross = points[i].x * next.y - next.x * points[i].y;
    signedArea += cross;
    cx += (points[i].x + next.x) * cross;
    cy += (points[i].y + next.y) * cross;
  }

  signedArea /= 2;
  if (Math.abs(signedArea) < 1e-9) {
    const avgX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const avgY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return { x: avgX, y: avgY };
  }

  return {
    x: cx / (6 * signedArea),
    y: cy / (6 * signedArea),
  };
}

function tracePolygonPath(ctx: CanvasRenderingContext2D, points: CanvasPoint[]): void {
  if (points.length === 0) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

export default function FloorPlanPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [floors, setFloors] = useState<FloorData[]>([]);
  const [activeFloor, setActiveFloor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showLoads, setShowLoads] = useState(true);

  // Fetch project and room data
  useEffect(() => {
    Promise.all([
      authFetch(`/api/projects/${id}`).then(r => r.json()),
      authFetch(`/api/projects/${id}/rooms`).then(r => r.json()),
    ])
      .then(([project, roomData]) => {
        setProjectName(project.name || 'Unnamed Project');
        setFloors(roomData.floors || []);
        setLoading(false);
      })
      .catch(() => {
        showToast('error', 'Failed to load floor plan data');
        setLoading(false);
      });
  }, [id]);

  const currentFloor = floors[activeFloor];
  const rooms = useMemo(() => currentFloor?.rooms || [], [currentFloor]);

  // Calculate room layout positions either from saved polygon geometry or area-based fallback boxes.
  const generateLayout = useCallback((roomList: RoomData[], floorScale: number, canvasW: number, canvasH: number): LayoutRoom[] => {
    if (roomList.length === 0) return [];

    const polygonCandidates = roomList.map((room, index) => {
      const parsed = parseRoomPolygon(room.polygon);
      if (!parsed) {
        return null;
      }

      const rawBounds = getPolygonBounds(parsed.points);
      if (!rawBounds) {
        return null;
      }

      const autoScale = (rawBounds.width > 120 || rawBounds.height > 120) && floorScale > 0
        ? floorScale
        : 1;
      const scale = parsed.scale && parsed.scale > 0 ? parsed.scale : autoScale;
      const pointsMeters = parsed.points.map((point) => ({
        x: point.x / scale,
        y: point.y / scale,
      }));

      const meterBounds = getPolygonBounds(pointsMeters);
      if (!meterBounds || meterBounds.width <= 0 || meterBounds.height <= 0) {
        return null;
      }

      return {
        room,
        index,
        pointsMeters,
        meterBounds,
        centroid: polygonCentroid(pointsMeters),
      };
    });

    const validPolygonRooms = polygonCandidates.filter((value): value is NonNullable<typeof value> => Boolean(value));

    if (validPolygonRooms.length === roomList.length && validPolygonRooms.length > 0) {
      const minX = Math.min(...validPolygonRooms.map((room) => room.meterBounds.minX));
      const minY = Math.min(...validPolygonRooms.map((room) => room.meterBounds.minY));
      const maxX = Math.max(...validPolygonRooms.map((room) => room.meterBounds.maxX));
      const maxY = Math.max(...validPolygonRooms.map((room) => room.meterBounds.maxY));

      const padding = 60;
      const usableW = Math.max(1, canvasW - padding * 2);
      const usableH = Math.max(1, canvasH - padding * 2);
      const rangeX = Math.max(0.1, maxX - minX);
      const rangeY = Math.max(0.1, maxY - minY);

      const fitScale = Math.min(usableW / rangeX, usableH / rangeY);
      const extraX = (usableW - rangeX * fitScale) / 2;
      const extraY = (usableH - rangeY * fitScale) / 2;

      const toCanvas = (point: { x: number; y: number }): CanvasPoint => ({
        x: padding + extraX + (point.x - minX) * fitScale,
        y: padding + extraY + (point.y - minY) * fitScale,
      });

      return validPolygonRooms.map((polyRoom) => {
        const points = polyRoom.pointsMeters.map(toCanvas);
        const bounds = getPolygonBounds(points);
        const center = toCanvas(polyRoom.centroid);
        return {
          ...polyRoom.room,
          mode: 'polygon',
          points,
          colorIdx: polyRoom.index % ROOM_COLORS.length,
          cx: center.x,
          cy: center.y,
          minDim: Math.max(16, Math.min(bounds?.width ?? 40, bounds?.height ?? 40)),
        };
      });
    }

    const padding = 60;
    const gap = 8;
    const usableW = canvasW - padding * 2;
    const usableH = canvasH - padding * 2;

    // Calculate proportional sizes based on room area
    const totalArea = roomList.reduce((s, r) => s + r.area, 0);
    const avgArea = totalArea > 0 ? totalArea / roomList.length : 1;

    // Simple grid layout with proportional sizing
    const cols = Math.ceil(Math.sqrt(roomList.length * (usableW / usableH)));
    const rows = Math.ceil(roomList.length / cols);
    const cellW = (usableW - (cols - 1) * gap) / cols;
    const cellH = (usableH - (rows - 1) * gap) / rows;

    return roomList.map((room, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sizeRatio = Math.max(0.6, Math.min(1.4, room.area / avgArea));
      const w = cellW * Math.min(sizeRatio, 1);
      const h = cellH * Math.min(sizeRatio, 1);
      const x = padding + col * (cellW + gap) + (cellW - w) / 2;
      const y = padding + row * (cellH + gap) + (cellH - h) / 2;

      return {
        ...room,
        mode: 'box',
        x,
        y,
        w,
        h,
        colorIdx: i % ROOM_COLORS.length,
        cx: x + w / 2,
        cy: y + h / 2,
        minDim: Math.max(16, Math.min(w, h)),
      };
    });
  }, []);

  // Render floor plan on canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = '#FAFBFC';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 0.5;
    const gridSize = 40 * zoom;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (rooms.length === 0) {
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No rooms defined for this floor', w / 2, h / 2);
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText('Draw rooms in the Floor Plan Editor', w / 2, h / 2 + 24);
      return;
    }

    const layout = generateLayout(rooms, currentFloor?.scale || 50, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);

    // Room shadows
    layout.forEach((room) => {
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = ROOM_COLORS[room.colorIdx];
      if (room.mode === 'box') {
        ctx.fillRect(room.x, room.y, room.w, room.h);
      } else {
        tracePolygonPath(ctx, room.points);
        ctx.fill();
      }
      ctx.shadowColor = 'transparent';
    });

    // Room fills and borders
    layout.forEach((room) => {
      // Fill
      ctx.fillStyle = ROOM_COLORS[room.colorIdx];
      if (room.mode === 'box') {
        ctx.fillRect(room.x, room.y, room.w, room.h);
      } else {
        tracePolygonPath(ctx, room.points);
        ctx.fill();
      }

      // Border
      ctx.strokeStyle = ROOM_BORDER_COLORS[room.colorIdx];
      ctx.lineWidth = 1.5;
      if (room.mode === 'box') {
        ctx.strokeRect(room.x, room.y, room.w, room.h);
      } else {
        tracePolygonPath(ctx, room.points);
        ctx.stroke();
      }

      // Hatching for visual texture
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.strokeStyle = ROOM_BORDER_COLORS[room.colorIdx];
      ctx.lineWidth = 0.5;
      const spacing = 12;
      if (room.mode === 'box') {
        ctx.beginPath();
        for (let d = spacing; d < room.w + room.h; d += spacing) {
          const x1 = room.x + Math.min(d, room.w);
          const y1 = room.y + Math.max(0, d - room.w);
          const x2 = room.x + Math.max(0, d - room.h);
          const y2 = room.y + Math.min(d, room.h);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
      } else {
        const bounds = getPolygonBounds(room.points);
        if (bounds) {
          tracePolygonPath(ctx, room.points);
          ctx.clip();
          ctx.beginPath();
          for (let x = bounds.minX - bounds.height; x <= bounds.maxX + bounds.height; x += spacing) {
            ctx.moveTo(x, bounds.minY);
            ctx.lineTo(x + bounds.height, bounds.maxY);
          }
        }
      }
      ctx.stroke();
      ctx.restore();

      const cx = room.cx;
      const cy = room.cy;
      const minDim = room.minDim;
      const fontSize = Math.max(9, Math.min(14, minDim / 6));

      if (showLabels) {
        // Room name
        ctx.fillStyle = '#1F2937';
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(room.name, cx, cy - fontSize * 0.8);

        // Space type
        ctx.fillStyle = '#6B7280';
        ctx.font = `${fontSize * 0.75}px Inter, system-ui, sans-serif`;
        ctx.fillText(SPACE_TYPE_LABELS[room.spaceType] || room.spaceType, cx, cy);
      }

      if (showDimensions) {
        // Area
        ctx.fillStyle = '#374151';
        ctx.font = `500 ${fontSize * 0.8}px Inter, system-ui, sans-serif`;
        ctx.fillText(`${room.area.toFixed(1)} m²`, cx, cy + fontSize * 0.9);
      }

      if (showLoads && room.coolingLoad) {
        // Cooling load
        ctx.fillStyle = '#2563EB';
        ctx.font = `500 ${fontSize * 0.7}px Inter, system-ui, sans-serif`;
        const loadText = room.coolingLoad.totalLoad >= 1000
          ? `${(room.coolingLoad.totalLoad / 1000).toFixed(1)} kW`
          : `${room.coolingLoad.totalLoad.toFixed(0)} W`;
        ctx.fillText(`❄ ${loadText}`, cx, cy + fontSize * 1.7);
      }
    });

    ctx.restore();

    // Title block
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, h - 50, w, 50);
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 50);
    ctx.lineTo(w, h - 50);
    ctx.stroke();

    ctx.fillStyle = '#1F2937';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${projectName} — ${currentFloor?.name || `Floor ${activeFloor + 1}`}`,
      16, h - 28
    );
    ctx.fillStyle = '#6B7280';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(
      `${rooms.length} room${rooms.length !== 1 ? 's' : ''} · ${rooms.reduce((s, r) => s + r.area, 0).toFixed(1)} m² total`,
      16, h - 12
    );

    // Scale indicator
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, w - 16, h - 12);
    ctx.fillText(`Generated: ${new Date().toLocaleDateString('en-PH')}`, w - 16, h - 28);
  }, [rooms, zoom, showLabels, showDimensions, showLoads, projectName, currentFloor, activeFloor, generateLayout]);

  useEffect(() => {
    render();
    const handleResize = () => render();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  // Print floor plan
  const handlePrint = () => {
    window.print();
  };

  // Export as PNG
  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `FloorPlan-${projectName}-${currentFloor?.name || 'floor'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('success', 'Floor plan exported as PNG');
  };

  const totalArea = rooms.reduce((s, r) => s + r.area, 0);
  const totalLoad = rooms.reduce((s, r) => s + (r.coolingLoad?.totalLoad || 0), 0);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-64">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full"
          />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Print-only header */}
      <style>{`
        @media print {
          nav, .no-print, button, .sidebar { display: none !important; }
          .print-full { width: 100vw !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <PageHeader
        title="Floor Plan Preview"
        description={`${projectName} — Visual preview of room layout and HVAC loads`}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: projectName, href: `/projects/${id}` },
          { label: 'Floor Plan', href: `/projects/${id}/floorplan` },
          { label: 'Preview' },
        ]}
        actions={
          <div className="flex gap-2 no-print">
            <Link href={`/projects/${id}/floorplan`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" /> Editor
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={exportPNG}>
              <Download className="w-4 h-4 mr-1" /> PNG
            </Button>
            <Button variant="accent" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          </div>
        }
      />

      {floors.length === 0 ? (
        <EmptyState
          icon={<Building2 className="w-12 h-12" />}
          title="No floors defined"
          description="Add rooms in the Floor Plan Editor to see a preview"
        />
      ) : (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="panel-glass no-print flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2 shadow-sm">
            {/* Floor selector */}
            {floors.length > 1 && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
                {floors.map((floor, idx) => (
                  <button
                    key={floor.id}
                    onClick={() => setActiveFloor(idx)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      idx === activeFloor
                        ? 'bg-accent text-accent-foreground shadow-md'
                        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                    }`}
                  >
                    {floor.name}
                  </button>
                ))}
              </div>
            )}

            {/* Toggle buttons */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
              <button
                onClick={() => setShowLabels(!showLabels)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  showLabels
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                }`}
              >
                Labels
              </button>
              <button
                onClick={() => setShowDimensions(!showDimensions)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  showDimensions
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                }`}
              >
                Areas
              </button>
              <button
                onClick={() => setShowLoads(!showLoads)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  showLoads
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                }`}
              >
                Loads
              </button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/75 hover:text-foreground"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/75 hover:text-foreground"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/75 hover:text-foreground"
                title="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <Card className="print-full overflow-hidden border border-border bg-card p-0 shadow-sm">
            <div ref={containerRef} className="w-full h-125 relative">
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
          </Card>

          {/* Room summary table */}
          <Card className="panel-glass border border-border/70 bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="w-4 h-4 text-muted-foreground" />
                Room schedule — {currentFloor?.name || 'Floor 1'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium w-6">#</th>
                      <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Room</th>
                      <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Type</th>
                      <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Area (m²)</th>
                      <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Ceiling (m)</th>
                      <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Total Load (W)</th>
                      <th className="text-right py-2.5 text-[11px] uppercase tracking-wider font-medium">W/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room, idx) => {
                      const wPerSqm = room.coolingLoad?.totalLoad && room.area > 0
                        ? (room.coolingLoad.totalLoad / room.area).toFixed(0)
                        : '—';
                      return (
                        <tr key={room.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                          <td className="py-2.5 pr-4">
                            <div className={`h-3.5 w-3.5 rounded-sm border ${ROOM_SWATCH_CLASSES[idx % ROOM_SWATCH_CLASSES.length]}`} />
                          </td>
                          <td className="py-2.5 pr-4 font-medium">{room.name}</td>
                          <td className="py-2.5 pr-4">
                            <Badge size="sm" variant="outline">
                              {SPACE_TYPE_LABELS[room.spaceType] || room.spaceType}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{room.area.toFixed(1)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{room.ceilingHeight.toFixed(1)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">
                            {room.coolingLoad ? room.coolingLoad.totalLoad.toLocaleString() : '—'}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-muted-foreground">{wPerSqm}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-2.5" colSpan={3}>Total</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{totalArea.toFixed(1)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{totalLoad.toLocaleString()}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {totalArea > 0 ? (totalLoad / totalArea).toFixed(0) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground pt-3 border-t border-border">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  {rooms.length} rooms
                </span>
                <span className="flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5" />
                  {totalArea.toFixed(1)} m² total area
                </span>
                <span className="flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5" />
                  {totalLoad > 0 ? `${(totalLoad / 3517).toFixed(1)} TR cooling capacity` : 'No cooling loads calculated'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageWrapper>
  );
}
