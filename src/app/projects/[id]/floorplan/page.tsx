'use client';

import { use } from 'react';
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
  AirVent,
  Grid3x3 as TileIcon,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import FloorPlanMultiView from '@/components/floorplan/FloorPlanMultiView';
import Link from 'next/link';
import Image from 'next/image';
import { SPACE_TYPE_OPTIONS } from '@/features/floorplan/constants';
import { getRoomAreaM2 } from '@/features/floorplan/geometry';
import type { Tool } from '@/features/floorplan/types';
import { useFloorplan } from '@/features/floorplan/useFloorplan';

export default function FloorPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const {
    floors,
    activeFloor,
    setActiveFloor,
    rooms,
    selectedRoom,
    setSelectedRoom,
    tool,
    setTool,
    scale,
    setScale,
    zoom,
    setZoom,
    bgImage,
    showGrid,
    setShowGrid,
    polygonDraft,
    draggingVertex,
    setPan,
    showImagePreview,
    setShowImagePreview,
    bgImageSrc,
    bgFileName,
    bgImageDims,
    showBgOnCanvas,
    setShowBgOnCanvas,
    exporting,
    showMultiView,
    setShowMultiView,
    layoutHVAC,
    setLayoutHVAC,
    layoutTiles,
    setLayoutTiles,
    canvasRef,
    fileInputRef,
    validateCanvasPolygon,
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
  } = useFloorplan(id);


  const selectedPolygonValidationIssue = selectedRoom?.polygonPoints && selectedRoom.polygonPoints.length >= 3
    ? (() => {
        const validation = validateCanvasPolygon(selectedRoom.polygonPoints ?? []);
        return validation.isValid ? null : (validation.issues[0] ?? 'Polygon geometry is invalid');
      })()
    : null;

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
              <Save className="w-4 h-4 mr-1" /> Save All ({rooms.length}R / {layoutHVAC.length}H / {layoutTiles.length}T)
            </Button>
          </div>
        }
      />

      <div className="flex h-auto min-h-[70vh] flex-col gap-4 xl:h-[calc(100vh-200px)] xl:flex-row">
        {/* Toolbar */}
        <div className="panel-glass flex w-full flex-row gap-1 overflow-x-auto rounded-xl border border-border/70 p-1.5 xl:w-12 xl:flex-col xl:overflow-visible">
          {([
            { t: 'select' as Tool, icon: MousePointer, label: 'Select' },
            { t: 'draw' as Tool, icon: Square, label: 'Draw Room' },
            { t: 'polygon' as Tool, icon: Pencil, label: 'Draw Polygon Room' },
            { t: 'measure' as Tool, icon: Ruler, label: 'Measure' },
            { t: 'hvac' as Tool, icon: AirVent, label: 'Place HVAC Unit' },
            { t: 'tile' as Tool, icon: TileIcon, label: 'Place Airflow Tile' },
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
          <div className="border-t border-border my-1" />
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
          <div className="border-t border-border my-1" />
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
        <div className="panel-glass relative min-h-112 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <canvas
            ref={canvasRef}
            className={`w-full h-full ${
              tool === 'draw' || tool === 'polygon' || tool === 'measure' || tool === 'hvac' || tool === 'tile' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          />

          {/* Status bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <div className="flex items-center gap-4">
              <span>Scale: 1m = {scale}px</span>
              <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
              <span>Rooms: {rooms.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge size="sm" variant={tool === 'select' ? 'accent' : 'outline'}>
                {tool === 'select'
                  ? 'Select'
                  : tool === 'draw'
                    ? 'Draw Room'
                    : tool === 'polygon'
                      ? 'Draw Polygon'
                      : tool === 'hvac'
                        ? 'Place HVAC'
                        : tool === 'tile'
                          ? 'Place Tile'
                          : 'Measure'}
              </Badge>
              {tool === 'select' && selectedRoom?.polygonPoints && selectedRoom.polygonPoints.length >= 3 && (
                <span className="hidden text-[11px] text-muted-foreground md:inline">
                  {selectedPolygonValidationIssue
                    ? `Polygon issue: ${selectedPolygonValidationIssue}`
                    : draggingVertex
                      ? 'Dragging vertex…'
                      : 'Tip: drag points, Alt+click edge to insert, Shift+click point to delete'}
                </span>
              )}
                {tool === 'polygon' && (
                  <span className="hidden text-[11px] text-muted-foreground md:inline">
                    {polygonDraft.length === 0
                      ? 'Click to add vertices'
                      : polygonDraft.length < 3
                        ? `${polygonDraft.length}/3 points`
                        : `${polygonDraft.length} points · Enter/Double-click to close · Esc to cancel`}
                  </span>
                )}
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
            <div className="absolute top-2 left-2 flex items-center gap-2 rounded-lg bg-[rgba(19,32,51,0.76)] px-2.5 py-1.5 text-xs text-white backdrop-blur-sm">
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="truncate max-w-45">{bgFileName}</span>
              {bgImageDims && <span className="text-white/60">{bgImageDims.w}×{bgImageDims.h}</span>}
              <button onClick={() => setShowImagePreview(true)} className="transition-colors hover:text-accent" title="View full image">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex w-full flex-col gap-3 overflow-y-auto xl:w-72">
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
          <Card className="panel-glass flex-1 border-border/70">
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
                    const areaM2 = getRoomAreaM2(room, scale).toFixed(1);
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
              <Card className="panel-glass border-accent/50">
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
                  {selectedRoom.polygonPoints && selectedRoom.polygonPoints.length >= 3 && (
                    <p className="rounded-md border border-accent/40 bg-accent/8 px-2 py-1 text-[11px] text-accent">
                      Polygon room: drag points to reshape, Alt+click edge to insert a vertex, Shift+click point to remove.
                    </p>
                  )}
                  {selectedPolygonValidationIssue && (
                    <p className="rounded-md border border-destructive/45 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                      {selectedPolygonValidationIssue}
                    </p>
                  )}
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
                      disabled={Boolean(selectedRoom.polygonPoints && selectedRoom.polygonPoints.length >= 3)}
                      onChange={(e) => updateRoom('width', parseFloat(e.target.value) * scale)}
                    />
                    <Input
                      label="Depth (m)"
                      type="number"
                      step={0.1}
                      value={((selectedRoom.height / scale)).toFixed(1)}
                      disabled={Boolean(selectedRoom.polygonPoints && selectedRoom.polygonPoints.length >= 3)}
                      onChange={(e) => updateRoom('height', parseFloat(e.target.value) * scale)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Area: {getRoomAreaM2(selectedRoom, scale).toFixed(1)} m²
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Layout Entities */}
          {(layoutHVAC.length > 0 || layoutTiles.length > 0) && (
            <Card className="panel-glass border-border/70">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AirVent className="w-4 h-4" /> Layout Entities
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {layoutHVAC.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">HVAC Units ({layoutHVAC.length})</p>
                    <div className="flex flex-col gap-1 max-h-30 overflow-y-auto">
                      {layoutHVAC.map((h) => (
                        <div key={h.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-2 py-1 text-xs">
                          <span className="font-medium">{h.label}</span>
                          <button
                            onClick={() => setLayoutHVAC(layoutHVAC.filter((x) => x.id !== h.id))}
                            className="text-red-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {layoutTiles.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Airflow Tiles ({layoutTiles.length})</p>
                    <div className="flex flex-col gap-1 max-h-30 overflow-y-auto">
                      {layoutTiles.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-2 py-1 text-xs">
                          <span className="font-medium">({t.x.toFixed(1)}, {t.y.toFixed(1)}) m — {(t.openArea * 100).toFixed(0)}%</span>
                          <button
                            onClick={() => setLayoutTiles(layoutTiles.filter((x) => x.id !== t.id))}
                            className="text-red-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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
              className="relative flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
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
              <div className="flex-1 overflow-auto p-4 bg-slate-900 flex items-center justify-center min-h-75">
                <Image
                  src={bgImageSrc}
                  alt="Floor Plan"
                  width={bgImageDims?.w || 1600}
                  height={bgImageDims?.h || 900}
                  className="max-w-full max-h-[70vh] w-auto h-auto object-contain rounded shadow-lg"
                  draggable={false}
                  unoptimized
                />
              </div>

              {/* Footer info */}
              <div className="flex items-center justify-between border-t border-border bg-card px-5 py-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>Rooms drawn: {rooms.length}</span>
                  <span>Scale: 1m = {scale}px</span>
                  {rooms.length > 0 && (
                    <span>
                      Total area: {rooms.reduce((s, r) => s + getRoomAreaM2(r, scale), 0).toFixed(1)} m²
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
