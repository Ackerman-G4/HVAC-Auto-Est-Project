'use client';

import { useEffect, useState, useRef, useCallback, use } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Printer,
  Download,
  Layers,
  Eye,
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

interface RoomData {
  id: string;
  name: string;
  spaceType: string;
  area: number;
  ceilingHeight: number;
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
  rooms: RoomData[];
}

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
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch(`/api/projects/${id}/rooms`).then(r => r.json()),
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
  const rooms = currentFloor?.rooms || [];

  // Calculate room layout positions based on area
  const generateLayout = useCallback((roomList: RoomData[], canvasW: number, canvasH: number) => {
    if (roomList.length === 0) return [];

    const padding = 60;
    const gap = 8;
    const usableW = canvasW - padding * 2;
    const usableH = canvasH - padding * 2;

    // Calculate proportional sizes based on room area
    const totalArea = roomList.reduce((s, r) => s + r.area, 0);
    const avgArea = totalArea / roomList.length;

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

      return { ...room, x, y, w, h, colorIdx: i % ROOM_COLORS.length };
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

    const layout = generateLayout(rooms, w, h);

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
      ctx.fillRect(room.x, room.y, room.w, room.h);
      ctx.shadowColor = 'transparent';
    });

    // Room fills and borders
    layout.forEach((room) => {
      // Fill
      ctx.fillStyle = ROOM_COLORS[room.colorIdx];
      ctx.fillRect(room.x, room.y, room.w, room.h);

      // Border
      ctx.strokeStyle = ROOM_BORDER_COLORS[room.colorIdx];
      ctx.lineWidth = 1.5;
      ctx.strokeRect(room.x, room.y, room.w, room.h);

      // Hatching for visual texture
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.strokeStyle = ROOM_BORDER_COLORS[room.colorIdx];
      ctx.lineWidth = 0.5;
      const spacing = 12;
      ctx.beginPath();
      for (let d = spacing; d < room.w + room.h; d += spacing) {
        const x1 = room.x + Math.min(d, room.w);
        const y1 = room.y + Math.max(0, d - room.w);
        const x2 = room.x + Math.max(0, d - room.h);
        const y2 = room.y + Math.min(d, room.h);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      ctx.restore();

      const cx = room.x + room.w / 2;
      const cy = room.y + room.h / 2;
      const minDim = Math.min(room.w, room.h);
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
          <div className="no-print flex flex-wrap items-center gap-3">
            {/* Floor selector */}
            {floors.length > 1 && (
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                {floors.map((floor, idx) => (
                  <button
                    key={floor.id}
                    onClick={() => setActiveFloor(idx)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      idx === activeFloor
                        ? 'bg-white text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {floor.name}
                  </button>
                ))}
              </div>
            )}

            {/* Toggle buttons */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              <button
                onClick={() => setShowLabels(!showLabels)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  showLabels ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Labels
              </button>
              <button
                onClick={() => setShowDimensions(!showDimensions)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  showDimensions ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Areas
              </button>
              <button
                onClick={() => setShowLoads(!showLoads)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  showLoads ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Loads
              </button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary transition-colors"
                title="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <Card padding="none" className="print-full">
            <div ref={containerRef} className="w-full h-125 relative">
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
          </Card>

          {/* Room summary table */}
          <Card>
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
                        <tr key={room.id} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                          <td className="py-2.5 pr-4">
                            <div
                              className="w-3.5 h-3.5 rounded-sm border"
                              style={{
                                backgroundColor: ROOM_COLORS[idx % ROOM_COLORS.length],
                                borderColor: ROOM_BORDER_COLORS[idx % ROOM_BORDER_COLORS.length],
                              }}
                            />
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

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground pt-3 border-t border-border/40">
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
