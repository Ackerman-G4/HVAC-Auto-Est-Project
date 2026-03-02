'use client';

import { useEffect, useState, use } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Thermometer,
  Settings2,
  Calculator,
  Package,
  FileText,
  MapPin,
  Building2,
  Trash2,
  Edit3,
  Save,
  ArrowLeft,
  Play,
  Zap,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';
import { listContainerVariants, listItemVariants } from '@/animations/list-variants';
import { formatPHP } from '@/lib/utils/format-currency';
import { feetToMeters, sqftToSqm, metersToFeet, sqmToSqft, formatFtM, formatSqFtSqM } from '@/lib/utils/unit-conversion';
import { psychrometricState, psychrometricACRecommendation } from '@/lib/functions/psychrometric';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const SPACE_TYPES = [
  { value: 'office', label: 'Office' },
  { value: 'conference_room', label: 'Conference Room' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'server_room', label: 'Server Room' },
  { value: 'residential', label: 'Residential' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'hospital_ward', label: 'Hospital Ward' },
  { value: 'gym', label: 'Gym' },
  { value: 'theater', label: 'Theater' },
  { value: 'warehouse', label: 'Warehouse' },
];

const WALL_TYPES = [
  { value: 'concrete_block_200mm', label: 'Concrete Block 200mm' },
  { value: 'concrete_block_150mm', label: 'Concrete Block 150mm' },
  { value: 'brick_wall_200mm', label: 'Brick Wall 200mm' },
  { value: 'drywall_metal_stud', label: 'Drywall Metal Stud' },
  { value: 'curtain_wall', label: 'Curtain Wall' },
  { value: 'precast_concrete_150mm', label: 'Precast Concrete 150mm' },
];

const GLASS_TYPES = [
  { value: 'single_clear_6mm', label: 'Single Clear 6mm' },
  { value: 'single_tinted_6mm', label: 'Single Tinted 6mm' },
  { value: 'double_clear_6mm', label: 'Double Clear 6mm' },
  { value: 'double_tinted_6mm', label: 'Double Tinted 6mm' },
  { value: 'double_low_e', label: 'Double Low-E' },
  { value: 'triple_low_e', label: 'Triple Low-E' },
];

const ORIENTATIONS = [
  { value: 'N', label: 'North' },
  { value: 'NE', label: 'Northeast' },
  { value: 'E', label: 'East' },
  { value: 'SE', label: 'Southeast' },
  { value: 'S', label: 'South' },
  { value: 'SW', label: 'Southwest' },
  { value: 'W', label: 'West' },
  { value: 'NW', label: 'Northwest' },
];

interface ProjectData {
  id: string;
  name: string;
  clientName: string;
  buildingType: string;
  status: string;
  location: string;
  city: string;
  totalFloorArea: number;
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  notes: string;
  floors: {
    id: string;
    floorNumber: number;
    name: string;
    rooms: {
      id: string;
      name: string;
      spaceType: string;
      area: number;
      ceilingHeight: number;
      wallConstruction: string;
      windowType: string;
      windowArea: number;
      windowOrientation: string;
      occupantCount: number;
      lightingDensity: number;
      equipmentLoad: number;
      hasRoofExposure: boolean;
      coolingLoad?: {
        totalLoad: number;
        trValue: number;
        btuPerHour: number;
        totalSensibleLoad: number;
        totalLatentLoad: number;
        wallLoad: number;
        roofLoad: number;
        glassSolarLoad: number;
        glassConductionLoad: number;
        lightingLoad: number;
        peopleLoadSensible: number;
        peopleLoadLatent: number;
        equipmentLoadSensible: number;
        ventilationLoadSensible: number;
        ventilationLoadLatent: number;
        cfmSupply: number;
        cfmReturn: number;
      } | null;
    }[];
  }[];
  selectedEquipment: {
    id: string;
    roomId: string;
    brand: string;
    model: string;
    type: string;
    capacityTR: number;
    capacityBTU: number;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    eer: number;
    isInverter: boolean;
  }[];
  boqItems: {
    id: string;
    section: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }[];
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [autoSizing, setAutoSizing] = useState(false);
  const [generatingBOQ, setGeneratingBOQ] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [activeTab, setActiveTab] = useState('rooms');
  const [roomForm, setRoomForm] = useState<Record<string, string | number | boolean>>({
    name: '',
    floorNumber: 1,
    spaceType: 'office',
    area: 0,
    lengthFt: 0,
    widthFt: 0,
    useFootInput: true,
    ceilingHeight: 2.7,
    wallConstruction: 'concrete_block_200mm',
    windowType: 'single_clear_6mm',
    windowArea: 0,
    windowLengthFt: 0,
    windowWidthFt: 0,
    windowQty: 1,
    windowOrientation: 'N',
    occupantCount: 0,
    lightingDensity: 15,
    equipmentLoad: 10,
    hasRoofExposure: false,
  });

  const numVal = (v: string | number | boolean): number => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'boolean' ? 0 : v;
    return isNaN(n) ? 0 : n;
  };

  const strVal = (v: string | number | boolean): string => String(v ?? '');

  const handleRoomNumChange = (field: string, raw: string) => {
    setRoomForm((prev) => ({ ...prev, [field]: raw }));
  };

  const handleRoomNumBlur = (field: string, fallback: number) => {
    setRoomForm((prev) => {
      const v = prev[field];
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'boolean' ? fallback : v;
      return { ...prev, [field]: isNaN(n) || v === '' ? fallback : n };
    });
  };

  // Auto-compute area from feet dimensions
  const computedAreaSqft = numVal(roomForm.lengthFt) * numVal(roomForm.widthFt);
  const computedAreaSqm = sqftToSqm(computedAreaSqft);
  const computedWindowSqm = numVal(roomForm.windowQty) * sqftToSqm(numVal(roomForm.windowLengthFt) * numVal(roomForm.windowWidthFt));
  const effectiveArea = roomForm.useFootInput && numVal(roomForm.lengthFt) > 0 && numVal(roomForm.widthFt) > 0 ? computedAreaSqm : numVal(roomForm.area);
  const effectiveWindowArea = roomForm.useFootInput && numVal(roomForm.windowLengthFt) > 0 && numVal(roomForm.windowWidthFt) > 0 ? computedWindowSqm : numVal(roomForm.windowArea);
  const effectivePerimeterM = roomForm.useFootInput && numVal(roomForm.lengthFt) > 0 && numVal(roomForm.widthFt) > 0 ? feetToMeters(2 * (numVal(roomForm.lengthFt) + numVal(roomForm.widthFt))) : 0;

  const fetchProject = () => {
    setLoading(true);
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data.project);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProject();
  }, [id]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalArea = effectiveArea;
    const finalWindowArea = effectiveWindowArea;
    if (!roomForm.name || finalArea <= 0) {
      showToast('error', 'Room name and area are required');
      return;
    }
    try {
      const res = await fetch(`/api/projects/${id}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...roomForm,
          area: Math.round(finalArea * 100) / 100,
          windowArea: Math.round(finalWindowArea * 100) / 100,
          perimeter: effectivePerimeterM > 0 ? Math.round(effectivePerimeterM * 100) / 100 : undefined,
        }),
      });
      if (res.ok) {
        showToast('success', 'Room added with cooling load calculated');
        setShowAddRoom(false);
        setRoomForm({
          name: '',
          floorNumber: roomForm.floorNumber,
          spaceType: 'office',
          area: 0,
          lengthFt: 0,
          widthFt: 0,
          useFootInput: true,
          ceilingHeight: 2.7,
          wallConstruction: 'concrete_block_200mm',
          windowType: 'single_clear_6mm',
          windowArea: 0,
          windowLengthFt: 0,
          windowWidthFt: 0,
          windowQty: 1,
          windowOrientation: 'N',
          occupantCount: 0,
          lightingDensity: 15,
          equipmentLoad: 10,
          hasRoofExposure: false,
        });
        fetchProject();
      }
    } catch {
      showToast('error', 'Failed to add room');
    }
  };

  const runCalculation = async () => {
    setCalculating(true);
    try {
      const res = await fetch(`/api/projects/${id}/calculate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('success', `Calculated ${data.summary.roomCount} rooms — Total: ${data.summary.totalTR} TR`);
        fetchProject();
      }
    } catch {
      showToast('error', 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const autoSizeEquipment = async () => {
    setAutoSizing(true);
    try {
      const res = await fetch(`/api/projects/${id}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSize: true, budgetLevel: 'mid-range' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', `Equipment sized for ${data.results.length} rooms`);
        fetchProject();
      }
    } catch {
      showToast('error', 'Equipment sizing failed');
    } finally {
      setAutoSizing(false);
    }
  };

  const generateBOQ = async () => {
    setGeneratingBOQ(true);
    try {
      const res = await fetch(`/api/projects/${id}/boq`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('success', `BOQ generated: ${formatPHP(data.boq.grandTotal)}`);
        fetchProject();
      } else {
        showToast('error', data.error || 'BOQ generation failed');
      }
    } catch {
      showToast('error', 'BOQ generation failed');
    } finally {
      setGeneratingBOQ(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <Skeleton className="h-10 w-64 mb-4" />
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </PageWrapper>
    );
  }

  if (!project) {
    return (
      <PageWrapper>
        <EmptyState
          icon={<Building2 className="w-12 h-12" />}
          title="Project not found"
          description="This project may have been deleted."
          action={<Link href="/projects"><Button variant="accent">Back to Projects</Button></Link>}
        />
      </PageWrapper>
    );
  }

  const allRooms = project.floors.flatMap((f) => f.rooms);
  const totalTR = allRooms.reduce((sum, r) => sum + (r.coolingLoad?.trValue || 0), 0);
  const totalBTU = allRooms.reduce((sum, r) => sum + (r.coolingLoad?.btuPerHour || 0), 0);
  const totalArea = allRooms.reduce((sum, r) => sum + r.area, 0);
  const equipmentCost = project.selectedEquipment.reduce((sum, e) => sum + e.totalPrice, 0);
  const boqTotal = project.boqItems.reduce((sum, b) => sum + b.totalPrice, 0);

  const tabs = [
    { id: 'rooms', label: 'Rooms & Loads', icon: <Thermometer className="w-4 h-4" /> },
    { id: 'equipment', label: 'Equipment', icon: <Package className="w-4 h-4" /> },
    { id: 'boq', label: 'BOQ', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <PageWrapper>
      <PageHeader
        title={project.name}
        description={`${project.clientName || 'No client'} · ${project.buildingType} · ${project.city}`}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project.name },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={runCalculation} isLoading={calculating}>
              <Calculator className="w-4 h-4 mr-1" /> Calculate
            </Button>
            <Button variant="secondary" size="sm" onClick={autoSizeEquipment} isLoading={autoSizing}>
              <Zap className="w-4 h-4 mr-1" /> Auto-Size
            </Button>
            <Button variant="accent" size="sm" onClick={generateBOQ} isLoading={generatingBOQ}>
              <FileText className="w-4 h-4 mr-1" /> Generate BOQ
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard title="Rooms" value={allRooms.length} icon={MapPin} />
        <StatCard title="Total TR" value={totalTR.toFixed(1)} icon={Thermometer} />
        <StatCard title="Total Area" value={`${totalArea.toFixed(0)} m²`} icon={Building2} />
        <StatCard title="BOQ Total" value={formatPHP(boqTotal)} icon={FileText} />
      </div>

      {/* Psychrometric Conditions Panel — Carrier Chart */}
      {(() => {
        const outdoorPS = psychrometricState(project.outdoorDB, project.outdoorRH || 65);
        const indoorPS = psychrometricState(project.indoorDB, project.indoorRH);
        return (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Thermometer className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold">Carrier Psychrometric Chart — Design Conditions</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Outdoor */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Outdoor Air</p>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{outdoorPS.dryBulb}°C</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">DB</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{outdoorPS.wetBulb}°C</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">WB</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{outdoorPS.relativeHumidity}%</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">RH</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{outdoorPS.dewPoint}°C</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Dew Pt</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{(outdoorPS.humidityRatio * 1000).toFixed(1)}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">W (g/kg)</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{outdoorPS.enthalpy}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">h (kJ/kg)</p>
                    </div>
                  </div>
                </div>
                {/* Indoor */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Indoor Air (Design)</p>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{indoorPS.dryBulb}°C</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">DB</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{indoorPS.wetBulb}°C</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">WB</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{indoorPS.relativeHumidity}%</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">RH</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{indoorPS.dewPoint}°C</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Dew Pt</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{(indoorPS.humidityRatio * 1000).toFixed(1)}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">W (g/kg)</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded py-1.5">
                      <p className="text-sm font-bold tabular-nums">{indoorPS.enthalpy}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">h (kJ/kg)</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
      <div className="mt-4">
        {/* Rooms & Loads Tab */}
        {activeTab === 'rooms' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Rooms & Cooling Loads</h3>
              <Button variant="accent" size="sm" onClick={() => setShowAddRoom(!showAddRoom)}>
                <Plus className="w-4 h-4 mr-1" /> Add Room
              </Button>
            </div>

            {/* Add Room Form */}
            {showAddRoom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="mb-4 border-2 border-accent">
                  <CardHeader>
                    <CardTitle>Add New Room</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddRoom} className="space-y-4">
                      {/* Unit toggle */}
                      <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Input Unit:</label>
                        <button
                          type="button"
                          onClick={() => setRoomForm({ ...roomForm, useFootInput: !roomForm.useFootInput })}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${roomForm.useFootInput ? 'bg-accent text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                        >
                          Feet (ft)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoomForm({ ...roomForm, useFootInput: !roomForm.useFootInput })}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${!roomForm.useFootInput ? 'bg-accent text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                        >
                          Meters (m)
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <Input label="Room Name *" value={strVal(roomForm.name)} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
                        <Input label="Floor Number" type="number" min={1} value={numVal(roomForm.floorNumber) || ''} onChange={(e) => handleRoomNumChange('floorNumber', e.target.value)} onBlur={() => handleRoomNumBlur('floorNumber', 1)} />
                        <Select label="Space Type" value={strVal(roomForm.spaceType)} onChange={(e) => setRoomForm({ ...roomForm, spaceType: e.target.value })} options={SPACE_TYPES} />

                        {/* Measurements section */}
                        {roomForm.useFootInput ? (
                          <>
                            <Input label="Room Length (ft) *" type="number" step={0.1} min={0} value={numVal(roomForm.lengthFt) || ''} onChange={(e) => handleRoomNumChange('lengthFt', e.target.value)} onBlur={() => handleRoomNumBlur('lengthFt', 0)} hint={numVal(roomForm.lengthFt) > 0 ? `= ${feetToMeters(numVal(roomForm.lengthFt)).toFixed(2)} m` : ''} />
                            <Input label="Room Width (ft) *" type="number" step={0.1} min={0} value={numVal(roomForm.widthFt) || ''} onChange={(e) => handleRoomNumChange('widthFt', e.target.value)} onBlur={() => handleRoomNumBlur('widthFt', 0)} hint={numVal(roomForm.widthFt) > 0 ? `= ${feetToMeters(numVal(roomForm.widthFt)).toFixed(2)} m` : ''} />
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1.5">Area (auto)</label>
                              <div className="h-9 px-3 rounded-lg border border-border/60 bg-secondary/50 flex items-center text-[13px] tabular-nums">
                                {computedAreaSqft > 0 ? (
                                  <span>{computedAreaSqft.toFixed(1)} ft² <span className="text-muted-foreground">({computedAreaSqm.toFixed(1)} m²)</span></span>
                                ) : (
                                  <span className="text-muted-foreground">Enter length × width</span>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <Input label="Area (m²) *" type="number" step={0.1} min={0} value={numVal(roomForm.area) || ''} onChange={(e) => handleRoomNumChange('area', e.target.value)} onBlur={() => handleRoomNumBlur('area', 0)} hint={numVal(roomForm.area) > 0 ? `= ${sqmToSqft(numVal(roomForm.area)).toFixed(1)} ft²` : ''} />
                        )}

                        <Input label="Ceiling Height (m)" type="number" step={0.1} value={numVal(roomForm.ceilingHeight) || ''} onChange={(e) => handleRoomNumChange('ceilingHeight', e.target.value)} onBlur={() => handleRoomNumBlur('ceilingHeight', 2.7)} hint={`= ${metersToFeet(numVal(roomForm.ceilingHeight)).toFixed(1)} ft`} />
                        <Select label="Wall Construction" value={strVal(roomForm.wallConstruction)} onChange={(e) => setRoomForm({ ...roomForm, wallConstruction: e.target.value })} options={WALL_TYPES} />
                        <Select label="Glass Type" value={strVal(roomForm.windowType)} onChange={(e) => setRoomForm({ ...roomForm, windowType: e.target.value })} options={GLASS_TYPES} />

                        {/* Window measurements */}
                        {roomForm.useFootInput ? (
                          <>
                            <Input label="Window Qty" type="number" min={0} value={numVal(roomForm.windowQty) || ''} onChange={(e) => handleRoomNumChange('windowQty', e.target.value)} onBlur={() => handleRoomNumBlur('windowQty', 0)} />
                            <Input label="Window Length (ft)" type="number" step={0.1} min={0} value={numVal(roomForm.windowLengthFt) || ''} onChange={(e) => handleRoomNumChange('windowLengthFt', e.target.value)} onBlur={() => handleRoomNumBlur('windowLengthFt', 0)} />
                            <Input label="Window Width (ft)" type="number" step={0.1} min={0} value={numVal(roomForm.windowWidthFt) || ''} onChange={(e) => handleRoomNumChange('windowWidthFt', e.target.value)} onBlur={() => handleRoomNumBlur('windowWidthFt', 0)} hint={computedWindowSqm > 0 ? `= ${computedWindowSqm.toFixed(2)} m²` : ''} />
                          </>
                        ) : (
                          <Input label="Window Area (m²)" type="number" step={0.1} min={0} value={numVal(roomForm.windowArea) || ''} onChange={(e) => handleRoomNumChange('windowArea', e.target.value)} onBlur={() => handleRoomNumBlur('windowArea', 0)} hint={numVal(roomForm.windowArea) > 0 ? `= ${sqmToSqft(numVal(roomForm.windowArea)).toFixed(1)} ft²` : ''} />
                        )}

                        <Select label="Window Orientation" value={strVal(roomForm.windowOrientation)} onChange={(e) => setRoomForm({ ...roomForm, windowOrientation: e.target.value })} options={ORIENTATIONS} />
                        <Input label="Occupants" type="number" min={0} value={numVal(roomForm.occupantCount) || ''} onChange={(e) => handleRoomNumChange('occupantCount', e.target.value)} onBlur={() => handleRoomNumBlur('occupantCount', 0)} />
                        <Input label="Lighting (W/m²)" type="number" step={0.1} value={numVal(roomForm.lightingDensity) || ''} onChange={(e) => handleRoomNumChange('lightingDensity', e.target.value)} onBlur={() => handleRoomNumBlur('lightingDensity', 15)} />
                        <Input label="Equipment (W/m²)" type="number" step={0.1} value={numVal(roomForm.equipmentLoad) || ''} onChange={(e) => handleRoomNumChange('equipmentLoad', e.target.value)} onBlur={() => handleRoomNumBlur('equipmentLoad', 10)} />
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!roomForm.hasRoofExposure}
                              onChange={(e) => setRoomForm({ ...roomForm, hasRoofExposure: e.target.checked })}
                              className="rounded"
                            />
                            Top floor (roof exposure)
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="ghost" onClick={() => setShowAddRoom(false)}>Cancel</Button>
                        <Button type="submit" variant="accent"><Save className="w-4 h-4 mr-1" /> Add Room</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Room List */}
            {allRooms.length === 0 ? (
              <EmptyState
                icon={<MapPin className="w-12 h-12" />}
                title="No rooms yet"
                description="Add rooms to start calculating cooling loads"
                action={
                  <Button variant="accent" size="sm" onClick={() => setShowAddRoom(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Add Room
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {project.floors.map((floor) => (
                  <div key={floor.id}>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                      {floor.name} (Floor {floor.floorNumber})
                    </h4>
                    <motion.div variants={listContainerVariants} initial="hidden" animate="visible" className="space-y-2">
                      {floor.rooms.map((room) => (
                        <motion.div key={room.id} variants={listItemVariants}>
                          <Card>
                            <CardContent className="p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium">{room.name}</h4>
                                    <Badge size="sm">{room.spaceType}</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {room.area} m² ({sqmToSqft(room.area).toFixed(0)} ft²) · {room.ceilingHeight}m ceil ({metersToFeet(room.ceilingHeight).toFixed(1)} ft) · {room.occupantCount} people · {room.windowOrientation}
                                  </p>
                                </div>
                                {room.coolingLoad && (
                                  <div className="flex gap-4 text-right">
                                    <div>
                                      <p className="text-lg font-bold text-foreground">{room.coolingLoad.trValue} TR</p>
                                      <p className="text-xs text-muted-foreground">{(room.coolingLoad.btuPerHour || 0).toLocaleString()} BTU/h</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{room.coolingLoad.cfmSupply} CFM</p>
                                      <p className="text-xs text-muted-foreground">Supply Air</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{(room.coolingLoad.totalLoad / room.area).toFixed(0)} W/m²</p>
                                      <p className="text-xs text-muted-foreground">Load Density</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* AC Unit Recommendation — Carrier Psychrometric */}
                              {room.coolingLoad && room.coolingLoad.trValue > 0 && (() => {
                                const rec = psychrometricACRecommendation(
                                  room.coolingLoad.totalLoad,
                                  room.coolingLoad.trValue,
                                  project.outdoorDB,
                                  project.outdoorRH || 65,
                                  project.indoorDB,
                                  project.indoorRH
                                );
                                // Find matching catalog units
                                const matchedUnits = EQUIPMENT_CATALOG
                                  .filter((eq) => eq.capacityTR >= rec.adjustedTR * 0.85 && eq.capacityTR <= rec.adjustedTR * 1.5)
                                  .sort((a, b) => Math.abs(a.capacityTR - rec.adjustedTR) - Math.abs(b.capacityTR - rec.adjustedTR))
                                  .slice(0, 4);

                                return (
                                  <div className="mt-3 pt-3 border-t border-border/40">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        AC Recommendation ({rec.recommendedType})
                                      </span>
                                      {rec.deratingFactor < 1 && (
                                        <Badge size="sm" variant="warning">
                                          Derated {((1 - rec.deratingFactor) * 100).toFixed(0)}%
                                        </Badge>
                                      )}
                                      <Badge size="sm" variant={
                                        rec.conditionsSeverity === 'extreme' ? 'warning' :
                                        rec.conditionsSeverity === 'hot' ? 'warning' : 'default'
                                      }>
                                        {rec.conditionsSeverity}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      Need: {rec.adjustedTR} TR (adjusted) · Min EER: {rec.recommendedMinEER} · {rec.notes[rec.notes.length - 1]}
                                    </p>
                                    {matchedUnits.length > 0 && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                        {matchedUnits.map((unit, idx) => (
                                          <div
                                            key={idx}
                                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-secondary/60 text-xs"
                                          >
                                            <div className="flex-1 min-w-0">
                                              <span className="font-medium">{unit.manufacturer}</span>
                                              <span className="text-muted-foreground ml-1">{unit.model}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-right shrink-0">
                                              <span className="tabular-nums font-medium">{unit.capacityTR} TR</span>
                                              <span className="tabular-nums text-muted-foreground">EER {unit.eer}</span>
                                              <span className="tabular-nums text-muted-foreground">{formatPHP(unit.unitPricePHP)}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Equipment Tab */}
        {activeTab === 'equipment' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Selected Equipment</h3>
              <Button variant="accent" size="sm" onClick={autoSizeEquipment} isLoading={autoSizing}>
                <Zap className="w-4 h-4 mr-1" /> Auto-Size All
              </Button>
            </div>
            {project.selectedEquipment.length === 0 ? (
              <EmptyState
                icon={<Package className="w-12 h-12" />}
                title="No equipment selected"
                description="Run auto-sizing to select equipment for all rooms"
                action={
                  <Button variant="accent" size="sm" onClick={autoSizeEquipment} isLoading={autoSizing}>
                    <Zap className="w-4 h-4 mr-1" /> Auto-Size
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3">Brand / Model</th>
                      <th className="text-left py-2 px-3">Type</th>
                      <th className="text-right py-2 px-3">Capacity</th>
                      <th className="text-right py-2 px-3">Qty</th>
                      <th className="text-right py-2 px-3">EER</th>
                      <th className="text-right py-2 px-3">Unit Price</th>
                      <th className="text-right py-2 px-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.selectedEquipment.map((eq) => (
                      <tr key={eq.id} className="border-b border-border/30">
                        <td className="py-2 px-3">
                          <div className="font-medium">{eq.brand}</div>
                          <div className="text-xs text-muted-foreground">{eq.model}</div>
                        </td>
                        <td className="py-2 px-3">
                          <Badge size="sm">{eq.type.replace(/_/g, ' ')}</Badge>
                          {eq.isInverter && <Badge size="sm" variant="success" className="ml-1">INV</Badge>}
                        </td>
                        <td className="text-right py-2 px-3">{eq.capacityTR.toFixed(1)} TR</td>
                        <td className="text-right py-2 px-3">{eq.quantity}</td>
                        <td className="text-right py-2 px-3">{eq.eer.toFixed(1)}</td>
                        <td className="text-right py-2 px-3">{formatPHP(eq.unitPrice)}</td>
                        <td className="text-right py-2 px-3 font-medium">{formatPHP(eq.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td colSpan={6} className="py-2 px-3 text-right">Equipment Subtotal:</td>
                      <td className="py-2 px-3 text-right">{formatPHP(equipmentCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* BOQ Tab */}
        {activeTab === 'boq' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Bill of Quantities</h3>
              <Button variant="accent" size="sm" onClick={generateBOQ} isLoading={generatingBOQ}>
                <FileText className="w-4 h-4 mr-1" /> Regenerate BOQ
              </Button>
            </div>
            {project.boqItems.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="No BOQ generated"
                description="Select equipment first, then generate the Bill of Quantities"
                action={
                  <Button variant="accent" size="sm" onClick={generateBOQ} isLoading={generatingBOQ}>
                    Generate BOQ
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3">Section</th>
                      <th className="text-left py-2 px-3">Description</th>
                      <th className="text-right py-2 px-3">Qty</th>
                      <th className="text-right py-2 px-3">Unit</th>
                      <th className="text-right py-2 px-3">Unit Price</th>
                      <th className="text-right py-2 px-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.boqItems.map((item) => (
                      <tr key={item.id} className="border-b border-border/30">
                        <td className="py-2 px-3 text-xs text-muted-foreground">{item.section}</td>
                        <td className="py-2 px-3">{item.description}</td>
                        <td className="text-right py-2 px-3">{item.quantity}</td>
                        <td className="text-right py-2 px-3">{item.unit}</td>
                        <td className="text-right py-2 px-3">{formatPHP(item.unitPrice)}</td>
                        <td className="text-right py-2 px-3 font-medium">{formatPHP(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-lg">
                      <td colSpan={5} className="py-3 px-3 text-right">Grand Total:</td>
                      <td className="py-3 px-3 text-right">{formatPHP(boqTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      </Tabs>
    </PageWrapper>
  );
}
