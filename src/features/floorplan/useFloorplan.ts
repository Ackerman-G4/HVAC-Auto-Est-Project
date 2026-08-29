'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@/components/ui/toast';
import {
  createRectPolygonPoints,
  getPolygonBounds,
  parseRoomPolygon,
  parseRoomPolygonRect,
  validateRoomPolygon,
  type RoomPolygonPoint,
} from '@/lib/utils/room-polygon';
import { authFetch } from '@/lib/api-client';
import { useSimulationStore } from '@/stores/simulation-store';
import type { LayoutHVACPlacement, LayoutTilePlacement } from '@/types/simulation';
import { ROOM_COLORS } from './constants';
import {
  drawPolygonPath,
  pointInPolygon,
  findNearestEdgeIndex,
  getRoomPolygonPoints,
  getRoomAreaM2,
  getRoomLabelCenter,
} from './geometry';
import type { CanvasRoom, FloorData, Tool, WallSegment } from './types';
import { logger } from '@/lib/observability/logger';

/**
 * Owns all Floor Plan editor state, canvas rendering, pointer/drawing
 * handlers, upload/export, and room persistence. Extracted verbatim from
 * the former monolith page so page.tsx can be a composition shell.
 */
export function useFloorplan(id: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragInvalidMessageRef = useRef<string | null>(null);

  const [floors, setFloors] = useState<FloorData[]>([]);
  const [activeFloor, setActiveFloor] = useState<number>(0);
  const [rooms, setRooms] = useState<CanvasRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<CanvasRoom | null>(null);
  const [walls, setWalls] = useState<WallSegment[]>([]);
  const [wallDrawing, setWallDrawing] = useState<{ x1: number; y1: number } | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [scale, setScale] = useState(50); // pixels per meter
  const [zoom, setZoom] = useState(1);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<RoomPolygonPoint[]>([]);
  const [draggingVertex, setDraggingVertex] = useState<{ roomId: string; vertexIndex: number } | null>(null);
  const [Pan, setPan] = useState({ x: 0, y: 0 });
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
  const [bgFileName, setBgFileName] = useState<string>('');
  const [bgImageDims, setBgImageDims] = useState<{ w: number; h: number } | null>(null);
  const [showBgOnCanvas, setShowBgOnCanvas] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showMultiView, setShowMultiView] = useState(false);

  // Layout entities (HVAC units + airflow tiles)
  const [layoutHVAC, setLayoutHVAC] = useState<LayoutHVACPlacement[]>([]);
  const [layoutTiles, setLayoutTiles] = useState<LayoutTilePlacement[]>([]);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const {
    setLayoutHVAC: syncHVAC,
    setLayoutTiles: syncTiles,
  } = useSimulationStore();

  // Fetch project floors and restore persisted rooms as canvas geometry.
  useEffect(() => {
    authFetch(`/api/projects/${id}/rooms`)
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
            const parsedPolygon = parseRoomPolygon(r.polygon);
            if (parsedPolygon) {
              const rawBounds = getPolygonBounds(parsedPolygon.points);
              if (!rawBounds) {
                return;
              }

              const inferredScale = parsedPolygon.scale && parsedPolygon.scale > 0
                ? parsedPolygon.scale
                : ((rawBounds.width <= 60 && rawBounds.height <= 60) ? floorScale : 1);
              const pointsPx = parsedPolygon.points.map((point) => ({
                x: point.x * inferredScale,
                y: point.y * inferredScale,
              }));
              const boundsPx = getPolygonBounds(pointsPx);
              if (!boundsPx) {
                return;
              }

              restored.push({
                id: r.id,
                name: r.name,
                spaceType: r.spaceType,
                x: boundsPx.minX,
                y: boundsPx.minY,
                width: boundsPx.width,
                height: boundsPx.height,
                color: ROOM_COLORS[idx % ROOM_COLORS.length],
                polygonPoints: pointsPx,
              });
              return;
            }

            const polyRect = parseRoomPolygonRect(r.polygon);
            if (polyRect) {
              const pointsPx = createRectPolygonPoints(polyRect);
              const boundsPx = getPolygonBounds(pointsPx);
              if (!boundsPx) {
                return;
              }

              restored.push({
                id: r.id,
                name: r.name,
                spaceType: r.spaceType,
                x: boundsPx.minX,
                y: boundsPx.minY,
                width: boundsPx.width,
                height: boundsPx.height,
                color: ROOM_COLORS[idx % ROOM_COLORS.length],
                polygonPoints: pointsPx,
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

  // Load simulation layout when floor changes
  useEffect(() => {
    const floorId = floors[activeFloor]?.id;
    if (!floorId) return;
    authFetch(`/api/projects/${id}/simulation-layout?floorId=${encodeURIComponent(floorId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.layout) {
          setLayoutHVAC(data.layout.hvacPlacements || []);
          setLayoutTiles(data.layout.tilePlacements || []);
        }
      })
      .catch(() => { /* no layout yet — that's fine */ });
  }, [id, floors, activeFloor]);

  const snapToGrid = useCallback((val: number) => Math.round(val / (scale / 4)) * (scale / 4), [scale]);

  const validateCanvasPolygon = useCallback((points: RoomPolygonPoint[]) => {
    return validateRoomPolygon(
      points.map((point) => ({ x: point.x / scale, y: point.y / scale })),
      { minArea: 0.25, epsilon: 1e-6 },
    );
  }, [scale]);

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

    // Walls
    walls.forEach((wall) => {
      ctx.save();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = wall.thickness;
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
      ctx.restore();
    });

    // Rooms
    rooms.forEach((room) => {
      const isSelected = selectedRoom?.id === room.id;
      const roomPolygon = room.polygonPoints && room.polygonPoints.length >= 3
        ? room.polygonPoints
        : null;
      const roomBounds = roomPolygon ? getPolygonBounds(roomPolygon) : null;
      const labelCenter = getRoomLabelCenter(room);
      const widthPx = roomBounds?.width ?? room.width;
      const heightPx = roomBounds?.height ?? room.height;

      // Fill
      ctx.fillStyle = room.color;
      if (roomPolygon) {
        drawPolygonPath(ctx, roomPolygon);
        ctx.fill();
      } else {
        ctx.fillRect(room.x, room.y, room.width, room.height);
      }

      // Border
      ctx.strokeStyle = isSelected ? '#2563EB' : '#343A40';
      ctx.lineWidth = isSelected ? 2 : 1;
      if (roomPolygon) {
        drawPolygonPath(ctx, roomPolygon);
        ctx.stroke();
      } else {
        ctx.strokeRect(room.x, room.y, room.width, room.height);
      }

      // Vertex handles (select mode only)
      if (isSelected && tool === 'select' && roomPolygon) {
        roomPolygon.forEach((point, vertexIndex) => {
          const isActiveVertex = draggingVertex?.roomId === room.id && draggingVertex.vertexIndex === vertexIndex;
          ctx.beginPath();
          ctx.fillStyle = isActiveVertex ? '#F97316' : '#2563EB';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.arc(point.x, point.y, isActiveVertex ? 6 : 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }

      // Label
      ctx.fillStyle = '#212529';
      ctx.font = `${Math.max(10, Math.min(14, widthPx / 8))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = room.name;
      ctx.fillText(label, labelCenter.x, labelCenter.y - 8);

      // Dimensions
      const widthM = (widthPx / scale).toFixed(1);
      const heightM = (heightPx / scale).toFixed(1);
      const areaM2 = getRoomAreaM2(room, scale).toFixed(1);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#495057';
      ctx.fillText(`${widthM}m × ${heightM}m`, labelCenter.x, labelCenter.y + 6);
      ctx.fillText(`${areaM2} m²`, labelCenter.x, labelCenter.y + 18);
    });

    // HVAC placements
    layoutHVAC.forEach((h) => {
      const px = h.position.x * scale;
      const py = h.position.y * scale;
      const sz = 1.2 * scale; // 1.2m icon size on canvas
      const isDragging = draggingId === h.id;

      ctx.save();
      ctx.fillStyle = isDragging ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.2)';
      ctx.strokeStyle = isDragging ? '#10b981' : '#059669';
      ctx.lineWidth = isDragging ? 2.5 : 1.5;
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      ctx.strokeRect(px - sz / 2, py - sz / 2, sz, sz);

      // HVAC icon label
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❄', px, py - 4);
      ctx.font = '9px sans-serif';
      ctx.fillText(h.label || h.type, px, py + 10);
      ctx.restore();
    });

    // Tile placements
    layoutTiles.forEach((t) => {
      const px = t.x * scale;
      const py = t.y * scale;
      const sz = t.tileSize * scale;

      ctx.save();
      ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      ctx.strokeRect(px - sz / 2, py - sz / 2, sz, sz);
      ctx.setLineDash([]);

      ctx.fillStyle = '#6366f1';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${(t.openArea * 100).toFixed(0)}%`, px, py);
      ctx.restore();
    });

    // HVAC/Tile drag ghost
    if (dragGhost && (tool === 'hvac' || tool === 'tile')) {
      const gx = snapToGrid(dragGhost.x);
      const gy = snapToGrid(dragGhost.y);
      const sz = (tool === 'hvac' ? 1.2 : 0.6) * scale;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = tool === 'hvac' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)';
      ctx.strokeStyle = tool === 'hvac' ? '#10b981' : '#6366f1';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(gx - sz / 2, gy - sz / 2, sz, sz);
      ctx.strokeRect(gx - sz / 2, gy - sz / 2, sz, sz);
      ctx.setLineDash([]);
      ctx.restore();
    }

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

    // Polygon drawing preview
    if (tool === 'polygon' && polygonDraft.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(polygonDraft[0].x, polygonDraft[0].y);
      for (let i = 1; i < polygonDraft.length; i++) {
        ctx.lineTo(polygonDraft[i].x, polygonDraft[i].y);
      }
      if (drawCurrent) {
        ctx.lineTo(drawCurrent.x, drawCurrent.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      polygonDraft.forEach((point, index) => {
        ctx.beginPath();
        ctx.fillStyle = index === 0 ? '#1D4ED8' : '#2563EB';
        ctx.arc(point.x, point.y, index === 0 ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = '#1D4ED8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';

      if (polygonDraft.length >= 3) {
        ctx.fillText(
          'Click first point, double-click, or press Enter to close',
          polygonDraft[0].x + 8,
          polygonDraft[0].y - 8,
        );
      } else {
        const lastPoint = polygonDraft[polygonDraft.length - 1];
        ctx.fillText(
          `Add at least ${3 - polygonDraft.length} more point${polygonDraft.length === 2 ? '' : 's'}`,
          lastPoint.x + 8,
          lastPoint.y - 8,
        );
      }

      ctx.fillText('Press Esc to cancel draft', 12, 20);
      ctx.restore();
    }

    ctx.restore();
  }, [rooms, selectedRoom, bgImage, showBgOnCanvas, showGrid, scale, zoom, Pan, isDrawing, drawStart, drawCurrent, polygonDraft, walls, layoutHVAC, layoutTiles, dragGhost, draggingId, draggingVertex, tool, snapToGrid]);

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

  useEffect(() => {
    if (tool !== 'polygon' && polygonDraft.length > 0) {
      setPolygonDraft([]);
      setDrawCurrent(null);
    }
  }, [tool, polygonDraft.length]);

  const finalizePolygonDraft = useCallback(() => {
    if (polygonDraft.length < 3) {
      showToast('warning', 'Polygon needs at least 3 points');
      return;
    }

    const validation = validateCanvasPolygon(polygonDraft);
    if (!validation.isValid) {
      showToast('warning', validation.issues[0] ?? 'Polygon geometry is invalid');
      return;
    }

    const bounds = getPolygonBounds(polygonDraft);
    if (!bounds) {
      showToast('warning', 'Polygon bounds are invalid');
      return;
    }

    const areaM2 = validation.area;

    const newRoom: CanvasRoom = {
      id: `room_${Date.now()}`,
      name: `Room ${rooms.length + 1}`,
      spaceType: 'office',
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.width,
      height: bounds.height,
      color: ROOM_COLORS[rooms.length % ROOM_COLORS.length],
      polygonPoints: polygonDraft,
    };

    setRooms([...rooms, newRoom]);
    setSelectedRoom(newRoom);
    setPolygonDraft([]);
    setDrawCurrent(null);
    showToast('success', `Polygon room added: ${areaM2.toFixed(1)} m²`);
  }, [polygonDraft, rooms, validateCanvasPolygon]);

  useEffect(() => {
    if (tool !== 'polygon') return;

    const handlePolygonKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && polygonDraft.length > 0) {
        event.preventDefault();
        setPolygonDraft([]);
        setDrawCurrent(null);
        showToast('info', 'Polygon draft canceled');
        return;
      }

      if ((event.key === 'Enter' || event.key === 'NumpadEnter') && polygonDraft.length >= 3) {
        event.preventDefault();
        finalizePolygonDraft();
      }
    };

    window.addEventListener('keydown', handlePolygonKeyDown);
    return () => window.removeEventListener('keydown', handlePolygonKeyDown);
  }, [tool, polygonDraft.length, finalizePolygonDraft]);

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

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);

    if (tool === 'hvac') {
      // Check if clicking an existing HVAC to start drag
      const existing = layoutHVAC.find((h) => {
        const px = h.position.x * scale;
        const py = h.position.y * scale;
        const sz = 1.2 * scale;
        return pos.x >= px - sz / 2 && pos.x <= px + sz / 2 && pos.y >= py - sz / 2 && pos.y <= py + sz / 2;
      });
      if (existing) {
        setDraggingId(existing.id);
        return;
      }
      // Place new HVAC unit
      const mx = snapToGrid(pos.x) / scale; // convert to meters
      const my = snapToGrid(pos.y) / scale;
      const newH: LayoutHVACPlacement = {
        id: `hvac_${Date.now()}`,
        type: 'crac',
        label: `CRAC ${layoutHVAC.length + 1}`,
        position: { x: mx, y: my, z: 0 },
        orientation: 0,
        capacityKW: 50,
        airflowCFM: 3000,
      };
      setLayoutHVAC([...layoutHVAC, newH]);
      showToast('success', `HVAC unit placed at (${mx.toFixed(1)}, ${my.toFixed(1)}) m`);
      return;
    }
    if (tool === 'tile') {
      const mx = snapToGrid(pos.x) / scale;
      const my = snapToGrid(pos.y) / scale;
      const newT: LayoutTilePlacement = {
        id: `tile_${Date.now()}`,
        x: mx,
        y: my,
        openArea: 0.25,
        tileSize: 0.6,
      };
      setLayoutTiles([...layoutTiles, newT]);
      showToast('success', `Airflow tile placed at (${mx.toFixed(1)}, ${my.toFixed(1)}) m`);
      return;
    }

    if (tool === 'draw') {
      setIsDrawing(true);
      setDrawStart({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
      setDrawCurrent({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
      return;
    }

    if (tool === 'polygon') {
      const snappedPoint = { x: snapToGrid(pos.x), y: snapToGrid(pos.y) };
      if (polygonDraft.length >= 3) {
        const first = polygonDraft[0];
        const closeDistance = Math.hypot(snappedPoint.x - first.x, snappedPoint.y - first.y);
        if (closeDistance <= Math.max(8, scale * 0.2)) {
          finalizePolygonDraft();
          return;
        }
      }

      setPolygonDraft([...polygonDraft, snappedPoint]);
      setDrawCurrent(snappedPoint);
      return;
    }

    if (tool === 'wall') {
      if (!wallDrawing) {
        setWallDrawing({ x1: snapToGrid(pos.x), y1: snapToGrid(pos.y) });
      } else {
        // Complete wall segment
        const x1 = wallDrawing.x1;
        const y1 = wallDrawing.y1;
        const x2 = snapToGrid(pos.x);
        const y2 = snapToGrid(pos.y);
        setWalls([...walls, { id: `wall_${Date.now()}`, x1, y1, x2, y2, thickness: 6 }]);
        setWallDrawing(null);
      }
      return;
    }

    if (tool === 'select') {
      const vertexHitRadius = Math.max(8 / zoom, 3);
      const edgeHitRadius = Math.max(10 / zoom, 4);

      for (const room of [...rooms].reverse()) {
        if (!room.polygonPoints || room.polygonPoints.length < 3) {
          continue;
        }

        for (let vertexIndex = 0; vertexIndex < room.polygonPoints.length; vertexIndex++) {
          const vertex = room.polygonPoints[vertexIndex];
          const distance = Math.hypot(pos.x - vertex.x, pos.y - vertex.y);
          if (distance <= vertexHitRadius) {
            setSelectedRoom(room);

            if (e.shiftKey) {
              if (room.polygonPoints.length <= 3) {
                showToast('warning', 'Polygon must keep at least 3 vertices');
                return;
              }

              const updatedPoints = room.polygonPoints.filter((_, idx) => idx !== vertexIndex);
              const validation = validateCanvasPolygon(updatedPoints);
              if (!validation.isValid) {
                showToast('warning', validation.issues[0] ?? 'Cannot remove vertex: polygon would be invalid');
                return;
              }

              const bounds = getPolygonBounds(updatedPoints);
              if (!bounds) {
                showToast('warning', 'Cannot remove vertex: polygon bounds are invalid');
                return;
              }

              const updatedRoom: CanvasRoom = {
                ...room,
                polygonPoints: updatedPoints,
                x: bounds.minX,
                y: bounds.minY,
                width: bounds.width,
                height: bounds.height,
              };

              setRooms((previousRooms) => previousRooms.map((candidate) => (
                candidate.id === room.id ? updatedRoom : candidate
              )));
              setSelectedRoom(updatedRoom);
              showToast('success', 'Vertex removed');
              return;
            }

            dragInvalidMessageRef.current = null;
            setDraggingVertex({ roomId: room.id, vertexIndex });
            return;
          }
        }
      }

      if (e.altKey) {
        for (const room of [...rooms].reverse()) {
          if (!room.polygonPoints || room.polygonPoints.length < 3) {
            continue;
          }

          const edgeIndex = findNearestEdgeIndex(room.polygonPoints, pos, edgeHitRadius);
          if (edgeIndex === null) {
            continue;
          }

          const insertedPoint = {
            x: snapToGrid(pos.x),
            y: snapToGrid(pos.y),
          };
          const updatedPoints = [
            ...room.polygonPoints.slice(0, edgeIndex + 1),
            insertedPoint,
            ...room.polygonPoints.slice(edgeIndex + 1),
          ];
          const validation = validateCanvasPolygon(updatedPoints);

          if (!validation.isValid) {
            showToast('warning', validation.issues[0] ?? 'Cannot insert vertex: polygon would be invalid');
            return;
          }

          const bounds = getPolygonBounds(updatedPoints);
          if (!bounds) {
            showToast('warning', 'Cannot insert vertex: polygon bounds are invalid');
            return;
          }

          const updatedRoom: CanvasRoom = {
            ...room,
            polygonPoints: updatedPoints,
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.width,
            height: bounds.height,
          };

          setRooms((previousRooms) => previousRooms.map((candidate) => (
            candidate.id === room.id ? updatedRoom : candidate
          )));
          setSelectedRoom(updatedRoom);
          showToast('success', 'Vertex inserted');
          return;
        }
      }

      // Check if clicking on a room
      const room = [...rooms].reverse().find(
        (r) => {
          if (r.polygonPoints && r.polygonPoints.length >= 3) {
            return pointInPolygon({ x: pos.x, y: pos.y }, r.polygonPoints);
          }
          return pos.x >= r.x && pos.x <= r.x + r.width && pos.y >= r.y && pos.y <= r.y + r.height;
        },
      );
      setSelectedRoom(room || null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);

    if (draggingVertex) {
      const nextPoint = {
        x: snapToGrid(pos.x),
        y: snapToGrid(pos.y),
      };

      setRooms((previousRooms) => {
        let updatedSelectedRoom: CanvasRoom | null = null;

        const updatedRooms = previousRooms.map((room) => {
          if (room.id !== draggingVertex.roomId || !room.polygonPoints || room.polygonPoints.length < 3) {
            return room;
          }

          const updatedPoints = room.polygonPoints.map((point, index) => (
            index === draggingVertex.vertexIndex ? nextPoint : point
          ));
          const validation = validateCanvasPolygon(updatedPoints);
          if (!validation.isValid) {
            dragInvalidMessageRef.current = validation.issues[0] ?? 'Polygon geometry is invalid.';
            return room;
          }

          dragInvalidMessageRef.current = null;
          const bounds = getPolygonBounds(updatedPoints);
          if (!bounds) {
            dragInvalidMessageRef.current = 'Polygon bounds are invalid.';
            return room;
          }

          const updatedRoom: CanvasRoom = {
            ...room,
            polygonPoints: updatedPoints,
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.width,
            height: bounds.height,
          };
          updatedSelectedRoom = updatedRoom;
          return updatedRoom;
        });

        if (updatedSelectedRoom) {
          setSelectedRoom(updatedSelectedRoom);
        }

        return updatedRooms;
      });
      return;
    }

    // Drag ghost for hvac/tile placement preview
    if (tool === 'hvac' || tool === 'tile') {
      setDragGhost({ x: pos.x, y: pos.y });
    }

    // Dragging existing HVAC entity
    if (draggingId) {
      const mx = snapToGrid(pos.x) / scale;
      const my = snapToGrid(pos.y) / scale;
      setLayoutHVAC(layoutHVAC.map((h) =>
        h.id === draggingId ? { ...h, position: { ...h.position, x: mx, y: my } } : h
      ));
      return;
    }

    if (tool === 'draw') {
      if (!isDrawing || !drawStart) return;
      const pos = getCanvasPos(e);
      setDrawCurrent({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
      return;
    }

    if (tool === 'polygon') {
      setDrawCurrent({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
    }
  };

  const handleMouseUp = () => {
    if (draggingVertex) {
      const invalidMessage = dragInvalidMessageRef.current;
      dragInvalidMessageRef.current = null;
      setDraggingVertex(null);
      if (invalidMessage) {
        showToast('warning', invalidMessage);
      }
      return;
    }

    if (draggingId) {
      setDraggingId(null);
      return;
    }

    if (tool === 'draw') {
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
    }
  };

  const handleDoubleClick = () => {
    if (tool === 'polygon') {
      finalizePolygonDraft();
    }
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
                const aM = getRoomAreaM2(room, scale).toFixed(2);
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
      logger.error('Failed to export PDF', err);
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
      const polygon = getRoomPolygonPoints(room);
      const polygonMeters = polygon.map((point) => ({
        x: point.x / scale,
        y: -point.y / scale,
      }));

      for (let i = 0; i < polygonMeters.length; i++) {
        const start = polygonMeters[i];
        const end = polygonMeters[(i + 1) % polygonMeters.length];
        push('0', 'LINE', '8', 'ROOMS');
        push('10', start.x.toFixed(4), '20', start.y.toFixed(4), '30', '0');
        push('11', end.x.toFixed(4), '21', end.y.toFixed(4), '31', '0');
      }

      const wM = room.width / scale;
      const hM = room.height / scale;
      const aM = getRoomAreaM2(room, scale);

      // Room label (TEXT entity)
      const center = getRoomLabelCenter(room);
      const cx = (center.x / scale).toFixed(4);
      const cy = (-(center.y / scale)).toFixed(4);
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

    for (const room of rooms) {
      const polygonPoints = getRoomPolygonPoints(room);
      const validation = validateCanvasPolygon(polygonPoints);
      if (!validation.isValid) {
        setSelectedRoom(room);
        showToast('error', `Cannot save ${room.name}: ${validation.issues[0] ?? 'Invalid polygon geometry'}`);
        return;
      }
    }

    try {
      let saved = 0;
      for (const room of rooms) {
        const polygonPoints = getRoomPolygonPoints(room);
        const validation = validateCanvasPolygon(polygonPoints);
        if (!validation.isValid) {
          showToast('error', `Cannot save ${room.name}: ${validation.issues[0] ?? 'Invalid polygon geometry'}`);
          return;
        }

        const areaSqM = validation.area;
        const perimeterM = validation.perimeter;
        const polygon = {
          points: polygonPoints,
          scale,
        };

        // If room already has a DB id (loaded from DB), update it
        const isExisting = !room.id.startsWith('room_');
        if (isExisting) {
          await authFetch(`/api/projects/${id}/rooms/${room.id}`, {
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
          await authFetch(`/api/projects/${id}/rooms`, {
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

      // Also persist simulation layout (HVAC + tiles)
      const floorId = floors[activeFloor]?.id;
      if (floorId && (layoutHVAC.length > 0 || layoutTiles.length > 0)) {
        await authFetch(`/api/projects/${id}/simulation-layout`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            floorId,
            hvacPlacements: layoutHVAC,
            tilePlacements: layoutTiles,
            canvasScale: scale,
          }),
        });
        // Sync to simulation store
        syncHVAC(layoutHVAC);
        syncTiles(layoutTiles);
        showToast('success', `Layout saved: ${layoutHVAC.length} HVAC, ${layoutTiles.length} tiles`);
      }
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
  return {
    floors,
    setFloors,
    activeFloor,
    setActiveFloor,
    rooms,
    setRooms,
    selectedRoom,
    setSelectedRoom,
    walls,
    setWalls,
    wallDrawing,
    setWallDrawing,
    tool,
    setTool,
    scale,
    setScale,
    zoom,
    setZoom,
    bgImage,
    setBgImage,
    showGrid,
    setShowGrid,
    isDrawing,
    setIsDrawing,
    drawStart,
    setDrawStart,
    drawCurrent,
    setDrawCurrent,
    polygonDraft,
    setPolygonDraft,
    draggingVertex,
    setDraggingVertex,
    Pan,
    setPan,
    showImagePreview,
    setShowImagePreview,
    bgImageSrc,
    setBgImageSrc,
    bgFileName,
    setBgFileName,
    bgImageDims,
    setBgImageDims,
    showBgOnCanvas,
    setShowBgOnCanvas,
    exporting,
    setExporting,
    showMultiView,
    setShowMultiView,
    layoutHVAC,
    setLayoutHVAC,
    layoutTiles,
    setLayoutTiles,
    dragGhost,
    setDragGhost,
    draggingId,
    setDraggingId,
    canvasRef,
    fileInputRef,
    dragInvalidMessageRef,
    snapToGrid,
    validateCanvasPolygon,
    render,
    finalizePolygonDraft,
    getCanvasPos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleUpload,
    exportToPDF,
    exportToDXF,
    handleSaveRooms,
    updateRoom,
    deleteRoom,
  };
}
