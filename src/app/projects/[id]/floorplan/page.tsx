'use client';

import { useEffect, useState, useRef, useCallback, use } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Pencil,
  Square,
  Ruler,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  MapPin,
  ArrowLeft,
  MousePointer,
  Plus,
  Grid3X3,
  FileDown,
  FileText,
  Image as ImageIcon,
  X,
  Eye,
  EyeOff,
  Maximize2,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import FloorPlanMultiView from '@/components/floorplan/FloorPlanMultiView';
import Link from 'next/link';

const SPACE_TYPE_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'conference_room', label: 'Conference Room' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'server_room', label: 'Server Room' },
  { value: 'residential', label: 'Residential' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'warehouse', label: 'Warehouse' },
];

interface CanvasRoom {
  id: string;
  name: string;
  spaceType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface FloorData {
  id: string;
  floorNumber: number;
  name: string;
  floorPlanImage: string | null;
  scale: number;
}

type Tool = 'select' | 'draw' | 'measure';

const ROOM_COLORS = [
  'rgba(37, 99, 235, 0.15)',
  'rgba(22, 163, 74, 0.15)',
  'rgba(234, 179, 8, 0.15)',
  'rgba(239, 68, 68, 0.15)',
  'rgba(168, 85, 247, 0.15)',
  'rgba(14, 165, 233, 0.15)',
  'rgba(249, 115, 22, 0.15)',
  'rgba(236, 72, 153, 0.15)',
];

export default function FloorPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [floors, setFloors] = useState<FloorData[]>([]);
  const [activeFloor, setActiveFloor] = useState<number>(0);
  const [rooms, setRooms] = useState<CanvasRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<CanvasRoom | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [scale, setScale] = useState(50); // pixels per meter
  const [zoom, setZoom] = useState(1);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [Pan, setPan] = useState({ x: 0, y: 0 });
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
  const [bgFileName, setBgFileName] = useState<string>('');
  const [bgImageDims, setBgImageDims] = useState<{ w: number; h: number } | null>(null);
  const [showBgOnCanvas, setShowBgOnCanvas] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showMultiView, setShowMultiView] = useState(false);

  // Fetch project floors AND restore persisted rooms as canvas rectangles
  useEffect(() => {
    fetch(`/api/projects/${id}/rooms`)
      .then((r) => r.json())
      .then((data) => {
        const rawFloors = data.floors || [];
        const floorData: FloorData[] = rawFloors.map((f: FloorData) => ({
          id: f.id,
          floorNumber: f.floorNumber,
          name: f.name,
          floorPlanImage: f.floorPlanImage,
          scale: f.scale || 50,
        }));
        setFloors(floorData);
        const floorScale = floorData.length > 0 ? floorData[0].scale : 50;
        if (floorData.length > 0) setScale(floorScale);

        // Restore rooms from DB as CanvasRooms on the active floor
        interface DbRoom {
          id: string;
          name: string;
          spaceType: string;
          polygon: string;
          area: number;
          perimeter: number;
        }
        interface DbFloor {
          floorNumber: number;
          rooms: DbRoom[];
        }
        const activeFloorData = rawFloors.find((f: DbFloor) => f.floorNumber === (floorData[0]?.floorNumber ?? 1));
        if (activeFloorData && activeFloorData.rooms) {
          const restored: CanvasRoom[] = [];
          activeFloorData.rooms.forEach((r: DbRoom, idx: number) => {
            let poly: { x: number; y: number; width: number; height: number } | null = null;
            try {
              const parsed = JSON.parse(r.polygon || '[]');
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.width > 0) {
                poly = parsed;
              }
            } catch { /* ignore */ }
            if (poly) {
              restored.push({
                id: r.id,
                name: r.name,
                spaceType: r.spaceType,
                x: poly.x,
                y: poly.y,
                width: poly.width,
                height: poly.height,
                color: ROOM_COLORS[idx % ROOM_COLORS.length],
              });
            }
          });
          if (restored.length > 0) setRooms(restored);
        }
      })
      .catch(() => {
        showToast('error', 'Failed to load floor data');
      });
  }, [id]);

  // Canvas rendering
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(Pan.x, Pan.y);
    ctx.scale(zoom, zoom);

    // Background
    if (bgImage && showBgOnCanvas) {
      ctx.drawImage(bgImage, 0, 0, bgImage.width, bgImage.height);
    } else {
      ctx.fillStyle = '#F8F9FA';
      ctx.fillRect(0, 0, w / zoom, h / zoom);
    }

    // Grid
    if (showGrid) {
      const gridSize = scale;
      ctx.strokeStyle = '#DEE2E6';
      ctx.lineWidth = 0.5;
      const startX = 0;
      const startY = 0;
      const endX = w / zoom;
      const endY = h / zoom;

      for (let x = startX; x <= endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }

      // Scale label
      ctx.fillStyle = '#495057';
      ctx.font = '11px sans-serif';
      ctx.fillText(`1m = ${scale}px`, 10, h / zoom - 10);
    }

    // Rooms
    rooms.forEach((room) => {
      const isSelected = selectedRoom?.id === room.id;

      // Fill
      ctx.fillStyle = room.color;
      ctx.fillRect(room.x, room.y, room.width, room.height);

      // Border
      ctx.strokeStyle = isSelected ? '#2563EB' : '#343A40';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(room.x, room.y, room.width, room.height);

      // Label
      ctx.fillStyle = '#212529';
      ctx.font = `${Math.max(10, Math.min(14, room.width / 8))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = room.name;
      ctx.fillText(label, room.x + room.width / 2, room.y + room.height / 2 - 8);

      // Dimensions
      const widthM = (room.width / scale).toFixed(1);
      const heightM = (room.height / scale).toFixed(1);
      const areaM2 = ((room.width / scale) * (room.height / scale)).toFixed(1);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#495057';
      ctx.fillText(`${widthM}m × ${heightM}m`, room.x + room.width / 2, room.y + room.height / 2 + 6);
      ctx.fillText(`${areaM2} m²`, room.x + room.width / 2, room.y + room.height / 2 + 18);
    });

    // Drawing preview
    if (isDrawing && drawStart && drawCurrent) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const w2 = Math.abs(drawCurrent.x - drawStart.x);
      const h2 = Math.abs(drawCurrent.y - drawStart.y);

      ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
      ctx.fillRect(x, y, w2, h2);
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x, y, w2, h2);
      ctx.setLineDash([]);

      // Preview dimensions
      ctx.fillStyle = '#2563EB';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${(w2 / scale).toFixed(1)}m × ${(h2 / scale).toFixed(1)}m`,
        x + w2 / 2,
        y + h2 / 2
      );
    }

    ctx.restore();
  }, [rooms, selectedRoom, bgImage, showBgOnCanvas, showGrid, scale, zoom, Pan, isDrawing, drawStart, drawCurrent]);

  useEffect(() => {
    render();
  }, [render]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      render();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [render]);

  // Mouse handlers
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - Pan.x) / zoom,
      y: (e.clientY - rect.top - Pan.y) / zoom,
    };
  };

  const snapToGrid = (val: number) => Math.round(val / (scale / 4)) * (scale / 4);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);

    if (tool === 'draw') {
      setIsDrawing(true);
      setDrawStart({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
      setDrawCurrent({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
      return;
    }

    if (tool === 'select') {
      // Check if clicking on a room
      const room = [...rooms].reverse().find(
        (r) => pos.x >= r.x && pos.x <= r.x + r.width && pos.y >= r.y && pos.y <= r.y + r.height
      );
      setSelectedRoom(room || null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStart) return;
    const pos = getCanvasPos(e);
    setDrawCurrent({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawStart || !drawCurrent) {
      setIsDrawing(false);
      return;
    }

    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    // Minimum 0.5m x 0.5m
    if (width >= scale * 0.5 && height >= scale * 0.5) {
      const newRoom: CanvasRoom = {
        id: `room_${Date.now()}`,
        name: `Room ${rooms.length + 1}`,
        spaceType: 'office',
        x,
        y,
        width,
        height,
        color: ROOM_COLORS[rooms.length % ROOM_COLORS.length],
      };
      setRooms([...rooms, newRoom]);
      setSelectedRoom(newRoom);
      showToast('success', `Room added: ${((width / scale) * (height / scale)).toFixed(1)} m²`);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  };

  // Image upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBgFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setBgImageSrc(dataUrl);
      const img = new window.Image();
      img.onload = () => {
        setBgImage(img);
        setBgImageDims({ w: img.width, h: img.height });
        setShowImagePreview(true);
        showToast('success', 'Floor plan uploaded — click canvas to draw rooms on top');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // ── Export to PDF ────────────────────────────────────────────────────────
  const exportToPDF = async () => {
    setExporting(true);
    try {
      const { createAndDownloadPdf, boldText } = await import('@/lib/utils/pdf-make');
      type Content = import('pdfmake/interfaces').Content;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not ready');

      // Render canvas to data URL
      const imgData = canvas.toDataURL('image/png', 1.0);
      const cw = canvas.width;
      const ch = canvas.height;
      const orientation = cw >= ch ? 'landscape' : 'portrait';

      // Calculate image fit within A3 margins
      const pageW = orientation === 'landscape' ? 420 : 297;
      const pageH = orientation === 'landscape' ? 297 : 420;
      const margin = 14;
      const topOffset = 28;
      const maxW = (pageW - margin * 2) * 2.83465; // mm to pt
      const maxH = (pageH - topOffset - margin) * 2.83465;
      const ratio = Math.min(maxW / cw, maxH / ch);
      const imgW = cw * ratio;

      const bold = boldText;

      // Room schedule table (second page)
      const roomSchedule: Content[] = [];
      if (rooms.length > 0) {
        roomSchedule.push({ text: '', pageBreak: 'before' as const });
        roomSchedule.push(bold('Room Schedule', { fontSize: 14, margin: [0, 0, 0, 8] }));
        roomSchedule.push({
          table: {
            headerRows: 1,
            widths: ['*', 80, 50, 50, 50],
            body: [
              ['Room', 'Type', 'Width (m)', 'Depth (m)', 'Area (m²)'].map((h) => bold(h, { fontSize: 8 })),
              ...rooms.map((room) => {
                const wM = (room.width / scale).toFixed(2);
                const hM = (room.height / scale).toFixed(2);
                const aM = ((room.width / scale) * (room.height / scale)).toFixed(2);
                return [room.name, room.spaceType, wM, hM, aM];
              }),
            ],
          },
          layout: 'lightHorizontalLines',
          fontSize: 8,
        });
      }

      await createAndDownloadPdf(
        {
          content: [
            bold('HVAC Floor Plan', { fontSize: 16, margin: [0, 0, 0, 4] }),
            { text: `Scale: 1m = ${scale}px  |  Rooms: ${rooms.length}  |  Generated: ${new Date().toLocaleDateString('en-PH')}`, fontSize: 9, margin: [0, 0, 0, 8] },
            { image: imgData, width: imgW / 2.83465 } as Content,
            ...roomSchedule,
          ],
          pageSize: 'A3',
          pageOrientation: orientation as 'landscape' | 'portrait',
          defaultStyle: { font: 'Roboto' },
        },
        `FloorPlan-${id}.pdf`,
      );
      showToast('success', 'PDF exported with floor plan and room schedule');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to export PDF');
    }
    setExporting(false);
  };

  // ── Export to DXF (AutoCAD) ─────────────────────────────────────────────
  const exportToDXF = () => {
    if (rooms.length === 0) {
      showToast('warning', 'No rooms to export');
      return;
    }

    // Build DXF R12 text file
    const lines: string[] = [];
    const push = (...args: string[]) => args.forEach((l) => lines.push(l));

    // ── HEADER section
    push('0', 'SECTION', '2', 'HEADER');
    push('9', '$ACADVER', '1', 'AC1009');  // R12
    push('9', '$INSUNITS', '70', '6');      // meters
    push('0', 'ENDSEC');

    // ── TABLES section (layers)
    push('0', 'SECTION', '2', 'TABLES');
    push('0', 'TABLE', '2', 'LAYER', '70', '3');
    // Layer: ROOMS
    push('0', 'LAYER', '2', 'ROOMS', '70', '0', '62', '7', '6', 'CONTINUOUS');
    // Layer: DIMENSIONS
    push('0', 'LAYER', '2', 'DIMENSIONS', '70', '0', '62', '3', '6', 'CONTINUOUS');
    // Layer: LABELS
    push('0', 'LAYER', '2', 'LABELS', '70', '0', '62', '5', '6', 'CONTINUOUS');
    push('0', 'ENDTAB');
    push('0', 'ENDSEC');

    // ── ENTITIES section
    push('0', 'SECTION', '2', 'ENTITIES');

    rooms.forEach((room) => {
      // Convert px to meters
      const x1 = room.x / scale;
      const y1 = -(room.y + room.height) / scale; // flip Y for CAD (Y-up)
      const x2 = (room.x + room.width) / scale;
      const y2 = -room.y / scale;
      const wM = room.width / scale;
      const hM = room.height / scale;
      const aM = wM * hM;

      // Room outline as LWPOLYLINE (closed rectangle)
      push('0', 'LINE', '8', 'ROOMS');
      push('10', x1.toFixed(4), '20', y1.toFixed(4), '30', '0');
      push('11', x2.toFixed(4), '21', y1.toFixed(4), '31', '0');
      push('0', 'LINE', '8', 'ROOMS');
      push('10', x2.toFixed(4), '20', y1.toFixed(4), '30', '0');
      push('11', x2.toFixed(4), '21', y2.toFixed(4), '31', '0');
      push('0', 'LINE', '8', 'ROOMS');
      push('10', x2.toFixed(4), '20', y2.toFixed(4), '30', '0');
      push('11', x1.toFixed(4), '21', y2.toFixed(4), '31', '0');
      push('0', 'LINE', '8', 'ROOMS');
      push('10', x1.toFixed(4), '20', y2.toFixed(4), '30', '0');
      push('11', x1.toFixed(4), '21', y1.toFixed(4), '31', '0');

      // Room label (TEXT entity)
      const cx = ((x1 + x2) / 2).toFixed(4);
      const cy = ((y1 + y2) / 2).toFixed(4);
      const textH = Math.max(0.15, Math.min(0.4, wM / 12));
      push('0', 'TEXT', '8', 'LABELS');
      push('10', cx, '20', cy, '30', '0');
      push('40', textH.toFixed(2));  // text height
      push('1', `${room.name} (${room.spaceType})`);
      push('72', '1'); // center horizontally
      push('11', cx, '21', cy, '31', '0');

      // Dimensions text
      const dimY = (parseFloat(cy) - textH - 0.15).toFixed(4);
      push('0', 'TEXT', '8', 'DIMENSIONS');
      push('10', cx, '20', dimY, '30', '0');
      push('40', (textH * 0.7).toFixed(2));
      push('1', `${wM.toFixed(2)}m x ${hM.toFixed(2)}m = ${aM.toFixed(2)}m2`);
      push('72', '1');
      push('11', cx, '21', dimY, '31', '0');
    });

    push('0', 'ENDSEC');
    push('0', 'EOF');

    // Download
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FloorPlan-${id}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'DXF exported — open in AutoCAD, BricsCAD, or any CAD viewer');
  };

  // Save rooms to project — persists polygon geometry for 3D/floorplan sync
  const handleSaveRooms = async () => {
    if (rooms.length === 0) {
      showToast('warning', 'No rooms to save');
      return;
    }

    try {
      let saved = 0;
      for (const room of rooms) {
        const widthM = room.width / scale;
        const heightM = room.height / scale;
        const areaSqM = widthM * heightM;
        const perimeterM = 2 * (widthM + heightM);
        // Store pixel-coordinate rectangle as polygon for later reload
        const polygon = { x: room.x, y: room.y, width: room.width, height: room.height, scale };

        // If room already has a DB id (loaded from DB), update it
        const isExisting = !room.id.startsWith('room_');
        if (isExisting) {
          await fetch(`/api/projects/${id}/rooms/${room.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: room.name,
              spaceType: room.spaceType,
              area: areaSqM,
              perimeter: perimeterM,
              polygon,
            }),
          });
        } else {
          await fetch(`/api/projects/${id}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: room.name,
              spaceType: room.spaceType,
              area: areaSqM,
              perimeter: perimeterM,
              polygon,
              floorNumber: floors[activeFloor]?.floorNumber || 1,
              ceilingHeight: 2.7,
              occupantCount: Math.max(1, Math.round(areaSqM / 10)),
            }),
          });
        }
        saved++;
      }
      showToast('success', `${saved} rooms saved with geometry and cooling loads`);
    } catch {
      showToast('error', 'Failed to save rooms');
    }
  };

  // Room editor
  const updateRoom = (field: keyof CanvasRoom, value: string | number) => {
    if (!selectedRoom) return;
    const updated = rooms.map((r) =>
      r.id === selectedRoom.id ? { ...r, [field]: value } : r
    );
    setRooms(updated);
    setSelectedRoom({ ...selectedRoom, [field]: value });
  };

  const deleteRoom = () => {
    if (!selectedRoom) return;
    setRooms(rooms.filter((r) => r.id !== selectedRoom.id));
    setSelectedRoom(null);
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Floor Plan Editor"
        description="Upload a floor plan and draw rooms to auto-calculate HVAC loads"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: 'Project', href: `/projects/${id}` },
          { label: 'Floor Plan' },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href={`/projects/${id}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            </Link>
            {bgImageSrc && (
              <Button variant="secondary" size="sm" onClick={() => setShowImagePreview(true)}>
                <Eye className="w-4 h-4 mr-1" /> View Plan
              </Button>
            )}
            <Link href={`/projects/${id}/floorplan/preview`}>
              <Button variant="secondary" size="sm">
                <Maximize2 className="w-4 h-4 mr-1" /> Preview
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setShowMultiView(true)} disabled={rooms.length === 0}>
              <Layers className="w-4 h-4 mr-1" /> Multi-View
            </Button>
            <Button variant="secondary" size="sm" onClick={exportToDXF} disabled={rooms.length === 0}>
              <FileDown className="w-4 h-4 mr-1" /> DXF
            </Button>
            <Button variant="secondary" size="sm" onClick={exportToPDF} isLoading={exporting} disabled={rooms.length === 0 && !bgImage}>
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button variant="accent" size="sm" onClick={handleSaveRooms}>
              <Save className="w-4 h-4 mr-1" /> Save Rooms ({rooms.length})
            </Button>
          </div>
        }
      />

      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* Toolbar */}
        <div className="w-12 flex flex-col gap-1 bg-secondary rounded-lg p-1.5">
          {([
            { t: 'select' as Tool, icon: MousePointer, label: 'Select' },
            { t: 'draw' as Tool, icon: Square, label: 'Draw Room' },
            { t: 'measure' as Tool, icon: Ruler, label: 'Measure' },
          ]).map(({ t, icon: Icon, label }) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              title={label}
              className={`p-2 rounded-lg transition-colors ${
                tool === t
                  ? 'bg-accent text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <div className="border-t border-border/50 my-1" />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload Floor Plan"
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Grid"
            className={`p-2 rounded-lg transition-colors ${
              showGrid ? 'bg-secondary' : ''
            } text-muted-foreground`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          {bgImage && (
            <button
              onClick={() => setShowBgOnCanvas(!showBgOnCanvas)}
              title={showBgOnCanvas ? 'Hide Floor Plan Image' : 'Show Floor Plan Image'}
              className={`p-2 rounded-lg transition-colors ${
                showBgOnCanvas ? 'bg-secondary' : ''
              } text-muted-foreground`}
            >
              {showBgOnCanvas ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}
          <div className="border-t border-border/50 my-1" />
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            title="Zoom In"
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            title="Zoom Out"
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            title="Reset View"
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative border border-border/50 rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            className={`w-full h-full ${
              tool === 'draw' ? 'cursor-crosshair' : tool === 'measure' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Status bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-white/90 border-t border-border/50 px-3 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>Scale: 1m = {scale}px</span>
              <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
              <span>Rooms: {rooms.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge size="sm" variant={tool === 'select' ? 'accent' : 'outline'}>
                {tool === 'select' ? 'Select' : tool === 'draw' ? 'Draw Room' : 'Measure'}
              </Badge>
            </div>
          </div>

          {/* Empty state overlay */}
          {rooms.length === 0 && !bgImage && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <MapPin className="w-12 h-12 text-border/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No floor plan loaded</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload an image or use the Draw tool to create rooms
                </p>
              </div>
            </div>
          )}

          {/* Image info badge */}
          {bgImage && bgFileName && (
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="truncate max-w-45">{bgFileName}</span>
              {bgImageDims && <span className="text-white/60">{bgImageDims.w}×{bgImageDims.h}</span>}
              <button onClick={() => setShowImagePreview(true)} className="hover:text-blue-300 transition-colors" title="View full image">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="w-72 flex flex-col gap-3 overflow-y-auto">
          {/* Floor selector */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4" /> Floors
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {floors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No floors yet. Rooms will auto-create Floor 1.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {floors.map((floor, idx) => (
                    <button
                      key={floor.id}
                      onClick={() => setActiveFloor(idx)}
                      className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeFloor === idx
                          ? 'bg-accent text-white'
                          : 'hover:bg-secondary'
                      }`}
                    >
                      {floor.name}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scale */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ruler className="w-4 h-4" /> Scale
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <Input
                label="Pixels per meter"
                type="number"
                min={10}
                max={200}
                value={scale}
                onChange={(e) => setScale(e.target.value === '' ? ('' as unknown as number) : parseInt(e.target.value) || scale)}
                onBlur={() => { if (!scale) setScale(50); }}
              />
            </CardContent>
          </Card>

          {/* Room list */}
          <Card className="flex-1">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Rooms ({rooms.length})
                </span>
                <Button variant="ghost" size="sm" onClick={() => setTool('draw')}>
                  <Plus className="w-3 h-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {rooms.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Select the Draw tool and drag on the canvas to create rooms.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {rooms.map((room) => {
                    const areaM2 = ((room.width / scale) * (room.height / scale)).toFixed(1);
                    return (
                      <button
                        key={room.id}
                        onClick={() => setSelectedRoom(room)}
                        className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedRoom?.id === room.id
                            ? 'bg-accent/10 border border-accent'
                            : 'hover:bg-secondary'
                        }`}
                      >
                        <div className="font-medium">{room.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {room.spaceType} · {areaM2} m²
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Room editor */}
          {selectedRoom && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-accent">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Pencil className="w-4 h-4" /> Edit Room
                    </span>
                    <Button variant="ghost" size="sm" onClick={deleteRoom}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <Input
                    label="Name"
                    value={selectedRoom.name}
                    onChange={(e) => updateRoom('name', e.target.value)}
                  />
                  <Select
                    label="Space Type"
                    value={selectedRoom.spaceType}
                    onChange={(e) => updateRoom('spaceType', e.target.value)}
                    options={SPACE_TYPE_OPTIONS}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Width (m)"
                      type="number"
                      step={0.1}
                      value={((selectedRoom.width / scale)).toFixed(1)}
                      onChange={(e) => updateRoom('width', parseFloat(e.target.value) * scale)}
                    />
                    <Input
                      label="Depth (m)"
                      type="number"
                      step={0.1}
                      value={((selectedRoom.height / scale)).toFixed(1)}
                      onChange={(e) => updateRoom('height', parseFloat(e.target.value) * scale)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Area: {((selectedRoom.width / scale) * (selectedRoom.height / scale)).toFixed(1)} m²
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload floor plan image"
        onChange={handleUpload}
      />

      {/* ── Image Preview Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showImagePreview && bgImageSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowImagePreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative bg-white rounded-xl shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-secondary">
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold text-sm">{bgFileName}</h3>
                    {bgImageDims && (
                      <p className="text-xs text-muted-foreground">
                        {bgImageDims.w} × {bgImageDims.h} px
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={exportToPDF} isLoading={exporting}>
                    <FileText className="w-4 h-4 mr-1" /> Export PDF
                  </Button>
                  <Button variant="secondary" size="sm" onClick={exportToDXF} disabled={rooms.length === 0}>
                    <FileDown className="w-4 h-4 mr-1" /> Export DXF
                  </Button>
                  <button
                    onClick={() => setShowImagePreview(false)}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                    title="Close preview"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Image view */}
              <div className="flex-1 overflow-auto p-4 bg-[#1a1a1a] flex items-center justify-center min-h-75">
                <img
                  src={bgImageSrc}
                  alt="Floor Plan"
                  className="max-w-full max-h-[70vh] object-contain rounded shadow-lg"
                  draggable={false}
                />
              </div>

              {/* Footer info */}
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-border/50 bg-secondary text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>Rooms drawn: {rooms.length}</span>
                  <span>Scale: 1m = {scale}px</span>
                  {rooms.length > 0 && (
                    <span>
                      Total area: {rooms.reduce((s, r) => s + (r.width / scale) * (r.height / scale), 0).toFixed(1)} m²
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowImagePreview(false); }}
                  className="text-accent hover:underline font-medium"
                >
                  Replace image
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Multi-View Modal ──────────────────────────────────────────── */}
      <FloorPlanMultiView
        rooms={rooms}
        scale={scale}
        ceilingHeight={2.7}
        visible={showMultiView}
        onClose={() => setShowMultiView(false)}
      />
    </PageWrapper>
  );
}
