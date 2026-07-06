'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Thermometer,
  Calculator,
  Package,
  FileText,
  MapPin,
  Building2,
  Trash2,
  Save,
  Zap,
  Box,
  Download,
  FileSpreadsheet,
  FileDown,
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
import { showToast } from '@/components/ui/toast';
import { DualValueExplainer } from '@/components/ui/dual-value-explainer';
import { TermHint } from '@/components/ui/term-hint';
import { listContainerVariants, listItemVariants } from '@/animations/list-variants';
import { formatPHP } from '@/lib/utils/format-currency';
import { feetToMeters, sqftToSqm, metersToFeet, sqmToSqft } from '@/lib/utils/unit-conversion';
import { psychrometricState, psychrometricACRecommendation } from '@/lib/functions/psychrometric';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import { safeJsonParse } from '@/lib/utils/safe-json';
import Link from 'next/link';
import { exportProjectPDF, exportProjectDXF, exportProjectCSV, exportProjectExcel } from '@/lib/utils/project-export';
import { projectsApi, roomsApi, calculateApi, equipmentApi, boqApi } from '@/lib/api-client';
import dynamic from 'next/dynamic';

const BuildingViewer3D = dynamic(() => import('@/components/building/BuildingViewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[500px] border border-border rounded-xl bg-secondary/30">
      <div className="text-center text-muted-foreground">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm">Loading 3D viewer...</p>
      </div>
    </div>
  ),
});

const SPACE_TYPES = [
  { value: 'office', label: 'Office' },
  { value: 'conference', label: 'Conference Room' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'hotel_room', label: 'Hotel Room' },
  { value: 'server_room', label: 'Server Room' },
  { value: 'corridor', label: 'Corridor' },
  { value: 'restroom', label: 'Restroom' },
  { value: 'storage', label: 'Storage' },
  { value: 'residential', label: 'Residential' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'hospital_ward', label: 'Hospital Ward' },
  { value: 'operating_room', label: 'Operating Room' },
  { value: 'gym', label: 'Gym' },
  { value: 'theater', label: 'Theater' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'parking', label: 'Parking' },
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

type PsychrometricSnapshot = ReturnType<typeof psychrometricState>;

const PSYCHROMETRIC_METRICS: Array<{
  term: string;
  definition: string;
  formatValue: (state: PsychrometricSnapshot) => string;
}> = [
  {
    term: 'DB',
    definition: 'Dry-bulb temperature: the actual air temperature measured by a standard thermometer.',
    formatValue: (state) => `${state.dryBulb}°C`,
  },
  {
    term: 'WB',
    definition: 'Wet-bulb temperature: indicates evaporative cooling potential and moisture influence.',
    formatValue: (state) => `${state.wetBulb}°C`,
  },
  {
    term: 'RH',
    definition: 'Relative humidity: percentage of moisture in air relative to saturation at the same temperature.',
    formatValue: (state) => `${state.relativeHumidity}%`,
  },
  {
    term: 'Dew Pt',
    definition: 'Dew point temperature: point where air becomes saturated and condensation begins.',
    formatValue: (state) => `${state.dewPoint}°C`,
  },
  {
    term: 'W (g/kg)',
    definition: 'Humidity ratio: grams of water vapor per kilogram of dry air.',
    formatValue: (state) => (state.humidityRatio * 1000).toFixed(1),
  },
  {
    term: 'h (kJ/kg)',
    definition: 'Specific enthalpy: total heat content per kilogram of dry air.',
    formatValue: (state) => String(state.enthalpy),
  },
];

function renderPsychrometricMetricGrid(
  state: PsychrometricSnapshot,
  toneClassName: string,
) {
  return (
    <div className="grid grid-cols-3 gap-1.5 text-center">
      {PSYCHROMETRIC_METRICS.map((metric) => (
        <div key={metric.term} className={`rounded py-1.5 ${toneClassName}`}>
          <p className="text-sm font-bold tabular-nums">{metric.formatValue(state)}</p>
          <p className="text-[8px] uppercase tracking-wider text-muted-foreground">
            <TermHint term={metric.term} definition={metric.definition} compact />
          </p>
        </div>
      ))}
    </div>
  );
}

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
  suggestedLaborMultiplier?: number;
  laborMultiplierOverride?: number | null;
  suggestedOverheadPercent?: number;
  overheadPercentOverride?: number | null;
  suggestedContingencyPercent?: number;
  contingencyPercentOverride?: number | null;
  suggestedVatRate?: number;
  vatRateOverride?: number | null;
  isBoqStale?: boolean;
  lastBoqGeneratedAt?: string | null;
  pricingPolicy?: {
    laborMultiplier: number;
    overheadPercent: number;
    contingencyPercent: number;
    vatRate: number;
  };
  floors: {
    id: string;
    floorNumber: number;
    name: string;
    rooms: {
      id: string;
      name: string;
      spaceType: string;
      area: number;
      perimeter: number;
      polygon?: string;
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
        suggestedTrValue?: number;
        userTrOverride?: number | null;
        finalTrValue?: number;
        suggestedBtuPerHour?: number;
        userBtuOverride?: number | null;
        finalBtuPerHour?: number;
        isOverridden?: boolean;
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
    suggestedQuantity?: number;
    userQuantityOverride?: number | null;
    suggestedUnitPrice?: number;
    userUnitPriceOverride?: number | null;
    unitPrice: number;
    totalPrice: number;
    eer: number;
    isInverter: boolean;
    sourceState?: 'suggested' | 'override';
    isOverridden?: boolean;
  }[];
  boqItems: {
    id: string;
    section: string;
    description: string;
    quantity: number;
    unit: string;
    suggestedUnitPrice?: number;
    suggestedTotalPrice?: number;
    userUnitPriceOverride?: number | null;
    userTotalPriceOverride?: number | null;
    finalUnitPrice?: number;
    finalTotalPrice?: number;
    sourceState?: 'suggested' | 'override';
    isOverridden?: boolean;
    overrideReason?: string;
    unitPrice: number;
    totalPrice: number;
  }[];
}

type PricingDraftState = {
  laborMultiplier: string;
  overheadPercent: string;
  contingencyPercent: string;
  vatRate: string;
};

type RoomLoadDraftState = {
  tr: string;
  btu: string;
};

type EquipmentDraftState = {
  quantity: string;
  unitPrice: string;
};

type LocalProjectSnapshot = {
  version: 1;
  projectId: string;
  savedAt: string;
  project: ProjectData;
  boqDraftPrices: Record<string, string>;
  pricingDraft: PricingDraftState;
  roomLoadDrafts: Record<string, RoomLoadDraftState>;
  equipmentDrafts: Record<string, EquipmentDraftState>;
};

type ProjectGetResponse = {
  project?: ProjectData;
};

type RecalculateResponse = {
  summary?: {
    roomCount?: number;
    totalTR?: number;
  };
};

type AutoSizeResponse = {
  results?: unknown[];
};

type GenerateBoqResponse = {
  boq?: {
    grandTotal?: number;
  };
};

const EMPTY_PRICING_DRAFT: PricingDraftState = {
  laborMultiplier: '',
  overheadPercent: '',
  contingencyPercent: '',
  vatRate: '',
};

const EMPTY_ROOM_LOAD_DRAFT: RoomLoadDraftState = {
  tr: '',
  btu: '',
};

const parsePricingDraftValue = (value: string): { valid: boolean; value: number | null } => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { valid: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { valid: false, value: null };
  }

  return { valid: true, value: parsed };
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [autoSizing, setAutoSizing] = useState(false);
  const [generatingBOQ, setGeneratingBOQ] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [activeTab, setActiveTab] = useState('rooms');
  const [boqDraftPrices, setBoqDraftPrices] = useState<Record<string, string>>({});
  const [boqSavingItemId, setBoqSavingItemId] = useState<string | null>(null);
  const [pricingDraft, setPricingDraft] = useState<PricingDraftState>(EMPTY_PRICING_DRAFT);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [roomLoadDrafts, setRoomLoadDrafts] = useState<Record<string, RoomLoadDraftState>>({});
  const [roomLoadSavingId, setRoomLoadSavingId] = useState<string | null>(null);
  const [equipmentDrafts, setEquipmentDrafts] = useState<Record<string, EquipmentDraftState>>({});
  const [equipmentSavingId, setEquipmentSavingId] = useState<string | null>(null);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
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
    equipmentLoad: 500,
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

  const fetchProject = useCallback(() => {
    setLoading(true);
    projectsApi.get(id)
      .then((data) => {
        const projectData = (data as ProjectGetResponse | null)?.project;
        if (projectData) {
          setProject(projectData);
          const draftMap = Object.fromEntries(
            (projectData.boqItems || []).map((item: { id: string; unitPrice?: number; finalUnitPrice?: number; }) => [
              item.id,
              String(item.unitPrice ?? item.finalUnitPrice ?? 0),
            ])
          );
          setBoqDraftPrices(draftMap);

          const roomDraftMap: Record<string, RoomLoadDraftState> = {};
          (projectData.floors || []).forEach((floor: { rooms?: Array<{ id: string; coolingLoad?: { userTrOverride?: number | null; userBtuOverride?: number | null } | null }> }) => {
            (floor.rooms || []).forEach((room) => {
              roomDraftMap[room.id] = {
                tr:
                  room.coolingLoad?.userTrOverride !== null && room.coolingLoad?.userTrOverride !== undefined
                    ? String(room.coolingLoad.userTrOverride)
                    : '',
                btu:
                  room.coolingLoad?.userBtuOverride !== null && room.coolingLoad?.userBtuOverride !== undefined
                    ? String(room.coolingLoad.userBtuOverride)
                    : '',
              };
            });
          });
          setRoomLoadDrafts(roomDraftMap);

          const equipmentDraftMap: Record<string, EquipmentDraftState> = {};
          (projectData.selectedEquipment || []).forEach((equipment: {
            id: string;
            userQuantityOverride?: number | null;
            userUnitPriceOverride?: number | null;
          }) => {
            equipmentDraftMap[equipment.id] = {
              quantity:
                equipment.userQuantityOverride !== null && equipment.userQuantityOverride !== undefined
                  ? String(equipment.userQuantityOverride)
                  : '',
              unitPrice:
                equipment.userUnitPriceOverride !== null && equipment.userUnitPriceOverride !== undefined
                  ? String(equipment.userUnitPriceOverride)
                  : '',
            };
          });
          setEquipmentDrafts(equipmentDraftMap);

          setPricingDraft({
            laborMultiplier:
              projectData.laborMultiplierOverride !== null && projectData.laborMultiplierOverride !== undefined
                ? String(projectData.laborMultiplierOverride)
                : '',
            overheadPercent:
              projectData.overheadPercentOverride !== null && projectData.overheadPercentOverride !== undefined
                ? String(projectData.overheadPercentOverride)
                : '',
            contingencyPercent:
              projectData.contingencyPercentOverride !== null && projectData.contingencyPercentOverride !== undefined
                ? String(projectData.contingencyPercentOverride)
                : '',
            vatRate:
              projectData.vatRateOverride !== null && projectData.vatRateOverride !== undefined
                ? String(projectData.vatRateOverride)
                : '',
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Fetch project error:', err);
        showToast('error', 'Failed to load project', 'Network error or server unreachable.');
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const snapshotStorageKey = `hvac-project-snapshot:${id}`;

  const readLocalSnapshot = useCallback((): {
    raw: string | null;
    parsed: Partial<LocalProjectSnapshot> | null;
  } => {
    if (typeof window === 'undefined') {
      return { raw: null, parsed: null };
    }

    const raw = window.localStorage.getItem(snapshotStorageKey);
    return {
      raw,
      parsed: safeJsonParse<Partial<LocalProjectSnapshot>>(raw),
    };
  }, [snapshotStorageKey]);

  const readSnapshotMeta = useCallback(() => {
    const { raw, parsed } = readLocalSnapshot();
    if (!raw) {
      setSnapshotSavedAt(null);
      return;
    }

    if (!parsed) {
      setSnapshotSavedAt(null);
      return;
    }

    setSnapshotSavedAt(typeof parsed.savedAt === 'string' ? parsed.savedAt : null);
  }, [readLocalSnapshot]);

  const buildSnapshotPayload = useCallback((): LocalProjectSnapshot | null => {
    if (!project) return null;

    return {
      version: 1,
      projectId: id,
      savedAt: new Date().toISOString(),
      project,
      boqDraftPrices,
      pricingDraft,
      roomLoadDrafts,
      equipmentDrafts,
    };
  }, [project, id, boqDraftPrices, pricingDraft, roomLoadDrafts, equipmentDrafts]);

  const saveLocalSnapshot = useCallback((showSuccessToast: boolean) => {
    if (typeof window === 'undefined') return;
    const payload = buildSnapshotPayload();
    if (!payload) return;

    window.localStorage.setItem(snapshotStorageKey, JSON.stringify(payload));
    setSnapshotSavedAt(payload.savedAt);

    if (showSuccessToast) {
      showToast('success', 'Local snapshot saved', 'You can restore this project state from the Export tab.');
    }
  }, [buildSnapshotPayload, snapshotStorageKey]);

  const restoreLocalSnapshot = () => {
    const { raw, parsed } = readLocalSnapshot();
    if (!raw) {
      showToast('error', 'No local snapshot found', 'Create a snapshot first before restoring.');
      return;
    }

    if (!parsed) {
      showToast('error', 'Snapshot is invalid', 'Unable to parse local snapshot data.');
      return;
    }

    if (parsed.projectId && parsed.projectId !== id) {
      showToast('error', 'Snapshot mismatch', 'The saved snapshot belongs to a different project.');
      return;
    }

    if (parsed.project) setProject(parsed.project as ProjectData);
    if (parsed.boqDraftPrices) setBoqDraftPrices(parsed.boqDraftPrices);
    if (parsed.pricingDraft) setPricingDraft(parsed.pricingDraft);
    if (parsed.roomLoadDrafts) setRoomLoadDrafts(parsed.roomLoadDrafts);
    if (parsed.equipmentDrafts) setEquipmentDrafts(parsed.equipmentDrafts);
    setSnapshotSavedAt(typeof parsed.savedAt === 'string' ? parsed.savedAt : null);

    showToast('success', 'Local snapshot restored', 'Review restored values, then save overrides to sync with the server.');
  };

  const clearLocalSnapshot = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(snapshotStorageKey);
    setSnapshotSavedAt(null);
    showToast('success', 'Local snapshot cleared');
  };

  useEffect(() => {
    readSnapshotMeta();
  }, [readSnapshotMeta]);

  useEffect(() => {
    if (!project) return;
    const timeoutId = window.setTimeout(() => {
      saveLocalSnapshot(false);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [project, saveLocalSnapshot]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalArea = effectiveArea;
    const finalWindowArea = effectiveWindowArea;
    if (!roomForm.name || finalArea <= 0) {
      showToast('error', 'Room name and area are required');
      return;
    }
    try {
      await roomsApi.create(id, {
        ...roomForm,
        area: finalArea,
        windowArea: finalWindowArea,
        perimeter: effectivePerimeterM > 0 ? effectivePerimeterM : undefined,
      });
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
        equipmentLoad: 500,
        hasRoofExposure: false,
      });
      fetchProject();
    } catch (err) {
      console.error('Add room error:', err);
      showToast('error', 'Failed to add room', 'Check the room parameters and try again.');
    }
  };

  const runCalculation = async () => {
    setCalculating(true);
    try {
      const data = await calculateApi.recalculate(id) as RecalculateResponse;
      const roomCount = data.summary?.roomCount ?? 0;
      const totalTR = data.summary?.totalTR ?? 0;
      showToast('success', `Calculated ${roomCount} rooms — Total: ${totalTR} TR`);
      fetchProject();
    } catch (err) {
      console.error('Calculate error:', err);
      showToast('error', 'Calculation failed', 'The server returned an error.');
    } finally {
      setCalculating(false);
    }
  };

  const autoSizeEquipment = async () => {
    setAutoSizing(true);
    try {
      const data = await equipmentApi.autoSize(id) as AutoSizeResponse;
      const sizedCount = data.results?.length ?? 0;
      showToast('success', `Equipment sized for ${sizedCount} rooms`);
      setActiveTab('equipment');
      fetchProject();
    } catch (err) {
      console.error('Auto-size error:', err);
      showToast('error', 'Equipment sizing failed', 'Make sure rooms have cooling loads calculated first.');
    } finally {
      setAutoSizing(false);
    }
  };

  const generateBOQ = async () => {
    setGeneratingBOQ(true);
    try {
      const data = await boqApi.generate(id) as GenerateBoqResponse;
      showToast('success', `BOQ generated: ${formatPHP(data.boq?.grandTotal ?? 0)}`);
      fetchProject();
    } catch (err) {
      console.error('BOQ error:', err);
      showToast('error', 'BOQ generation failed', 'Make sure equipment is selected before generating BOQ.');
    } finally {
      setGeneratingBOQ(false);
    }
  };

  const handleBoqDraftChange = (itemId: string, value: string) => {
    setBoqDraftPrices((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleBoqItemSave = async (item: ProjectData['boqItems'][number]) => {
    const draft = boqDraftPrices[item.id] ?? String(item.unitPrice);
    const nextUnitPrice = parseFloat(draft);

    if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) {
      showToast('error', 'Invalid unit price', 'Enter a non-negative number before saving.');
      return;
    }

    setBoqSavingItemId(item.id);
    try {
      const response = await fetch(`/api/projects/${id}/boq/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitPrice: nextUnitPrice,
          overrideReason: 'Manual BOQ price adjustment',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        showToast('error', data.error || 'Failed to save BOQ item', data.description || 'Unable to update the BOQ row.');
        return;
      }

      showToast('success', 'BOQ item updated');
      fetchProject();
    } catch (error) {
      console.error('BOQ item save error:', error);
      showToast('error', 'Failed to save BOQ item', 'Network error or server unreachable.');
    } finally {
      setBoqSavingItemId(null);
    }
  };

  const handleBoqUseSuggested = async (item: ProjectData['boqItems'][number]) => {
    setBoqSavingItemId(item.id);
    try {
      const response = await fetch(`/api/projects/${id}/boq/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useSuggested: true,
          userUnitPriceOverride: null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        showToast('error', data.error || 'Failed to reset BOQ item', data.description || 'Unable to restore suggested pricing.');
        return;
      }

      showToast('success', 'BOQ item reset to suggested price');
      fetchProject();
    } catch (error) {
      console.error('BOQ item reset error:', error);
      showToast('error', 'Failed to reset BOQ item', 'Network error or server unreachable.');
    } finally {
      setBoqSavingItemId(null);
    }
  };

  const handlePricingDraftChange = (field: keyof PricingDraftState, value: string) => {
    setPricingDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handlePricingResetDraft = () => {
    setPricingDraft({ ...EMPTY_PRICING_DRAFT });
  };

  const handlePricingSave = async () => {
    const labor = parsePricingDraftValue(pricingDraft.laborMultiplier);
    const overhead = parsePricingDraftValue(pricingDraft.overheadPercent);
    const contingency = parsePricingDraftValue(pricingDraft.contingencyPercent);
    const vat = parsePricingDraftValue(pricingDraft.vatRate);

    if (!labor.valid || !overhead.valid || !contingency.valid || !vat.valid) {
      showToast('error', 'Invalid pricing override', 'Enter valid numbers or leave fields blank to use suggested values.');
      return;
    }

    if (
      (labor.value !== null && labor.value < 0) ||
      (overhead.value !== null && overhead.value < 0) ||
      (contingency.value !== null && contingency.value < 0) ||
      (vat.value !== null && vat.value < 0)
    ) {
      showToast('error', 'Invalid pricing override', 'Override values must be non-negative.');
      return;
    }

    setPricingSaving(true);
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laborMultiplierOverride: labor.value,
          overheadPercentOverride: overhead.value,
          contingencyPercentOverride: contingency.value,
          vatRateOverride: vat.value,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        showToast('error', data.error || 'Failed to save pricing overrides', data.description || 'Unable to update pricing policy.');
        return;
      }

      showToast('success', 'Pricing overrides saved', 'Regenerate BOQ to apply updated pricing policy totals.');
      fetchProject();
    } catch (error) {
      console.error('Pricing override save error:', error);
      showToast('error', 'Failed to save pricing overrides', 'Network error or server unreachable.');
    } finally {
      setPricingSaving(false);
    }
  };

  const handleRoomLoadDraftChange = (roomId: string, field: keyof RoomLoadDraftState, value: string) => {
    setRoomLoadDrafts((prev) => ({
      ...prev,
      [roomId]: {
        ...(prev[roomId] ?? EMPTY_ROOM_LOAD_DRAFT),
        [field]: value,
      },
    }));
  };

  const updateRoomLoadOverride = async (
    roomId: string,
    overrides: { userTrOverride: number | null; userBtuOverride: number | null },
    successMessage: string,
  ) => {
    setRoomLoadSavingId(roomId);
    try {
      const response = await fetch(`/api/projects/${id}/rooms/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...overrides,
          overrideReason: 'Manual cooling load adjustment',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        showToast('error', data.error || 'Failed to save cooling load override', data.description || 'Unable to update room load values.');
        return;
      }

      showToast('success', successMessage, 'Equipment and BOQ are now marked stale until refreshed.');
      fetchProject();
    } catch (error) {
      console.error('Cooling load override save error:', error);
      showToast('error', 'Failed to save cooling load override', 'Network error or server unreachable.');
    } finally {
      setRoomLoadSavingId(null);
    }
  };

  const handleRoomLoadSave = async (room: ProjectData['floors'][number]['rooms'][number]) => {
    const draft = roomLoadDrafts[room.id] ?? EMPTY_ROOM_LOAD_DRAFT;
    const tr = parsePricingDraftValue(draft.tr);
    const btu = parsePricingDraftValue(draft.btu);

    if (!tr.valid || !btu.valid) {
      showToast('error', 'Invalid room load override', 'Enter valid numbers or leave fields blank to use suggested values.');
      return;
    }

    if ((tr.value !== null && tr.value < 0) || (btu.value !== null && btu.value < 0)) {
      showToast('error', 'Invalid room load override', 'Override values must be non-negative.');
      return;
    }

    await updateRoomLoadOverride(
      room.id,
      {
        userTrOverride: tr.value,
        userBtuOverride: btu.value,
      },
      'Cooling load override saved',
    );
  };

  const handleRoomLoadUseSuggested = async (room: ProjectData['floors'][number]['rooms'][number]) => {
    setRoomLoadDrafts((prev) => ({
      ...prev,
      [room.id]: { ...EMPTY_ROOM_LOAD_DRAFT },
    }));

    await updateRoomLoadOverride(
      room.id,
      {
        userTrOverride: null,
        userBtuOverride: null,
      },
      'Cooling load reset to suggested values',
    );
  };

  const handleEquipmentDraftChange = (
    selectionId: string,
    field: keyof EquipmentDraftState,
    value: string,
  ) => {
    setEquipmentDrafts((prev) => ({
      ...prev,
      [selectionId]: {
        ...(prev[selectionId] ?? { quantity: '', unitPrice: '' }),
        [field]: value,
      },
    }));
  };

  const handleEquipmentSave = async (equipment: ProjectData['selectedEquipment'][number]) => {
    const draft = equipmentDrafts[equipment.id] ?? { quantity: '', unitPrice: '' };
    const quantity = parsePricingDraftValue(draft.quantity);
    const unitPrice = parsePricingDraftValue(draft.unitPrice);

    if (!quantity.valid || !unitPrice.valid) {
      showToast('error', 'Invalid equipment override', 'Enter valid numbers or leave fields blank to use suggested values.');
      return;
    }

    if ((quantity.value !== null && quantity.value < 0) || (unitPrice.value !== null && unitPrice.value < 0)) {
      showToast('error', 'Invalid equipment override', 'Override values must be non-negative.');
      return;
    }

    setEquipmentSavingId(equipment.id);
    try {
      const response = await fetch(`/api/projects/${id}/equipment/${equipment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userQuantityOverride: quantity.value !== null ? Math.round(quantity.value) : null,
          userUnitPriceOverride: unitPrice.value,
          overrideReason: 'Manual equipment adjustment',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        showToast('error', data.error || 'Failed to save equipment override', data.description || 'Unable to update equipment values.');
        return;
      }

      showToast('success', 'Equipment override saved', 'BOQ is now marked stale until regenerated.');
      fetchProject();
    } catch (error) {
      console.error('Equipment override save error:', error);
      showToast('error', 'Failed to save equipment override', 'Network error or server unreachable.');
    } finally {
      setEquipmentSavingId(null);
    }
  };

  const handleEquipmentUseSuggested = async (equipment: ProjectData['selectedEquipment'][number]) => {
    setEquipmentSavingId(equipment.id);
    try {
      const response = await fetch(`/api/projects/${id}/equipment/${equipment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useSuggested: true,
          userQuantityOverride: null,
          userUnitPriceOverride: null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        showToast('error', data.error || 'Failed to reset equipment override', data.description || 'Unable to restore suggested equipment values.');
        return;
      }

      showToast('success', 'Equipment reset to suggested values', 'BOQ is now marked stale until regenerated.');
      fetchProject();
    } catch (error) {
      console.error('Equipment override reset error:', error);
      showToast('error', 'Failed to reset equipment override', 'Network error or server unreachable.');
    } finally {
      setEquipmentSavingId(null);
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
  const totalArea = allRooms.reduce((sum, r) => sum + r.area, 0);
  const equipmentCost = project.selectedEquipment.reduce((sum, e) => sum + e.totalPrice, 0);
  const boqTotal = project.boqItems.reduce((sum, b) => sum + b.totalPrice, 0);

  const pricingParsed = {
    laborMultiplier: parsePricingDraftValue(pricingDraft.laborMultiplier),
    overheadPercent: parsePricingDraftValue(pricingDraft.overheadPercent),
    contingencyPercent: parsePricingDraftValue(pricingDraft.contingencyPercent),
    vatRate: parsePricingDraftValue(pricingDraft.vatRate),
  };

  const currentOverrides = {
    laborMultiplier: project.laborMultiplierOverride ?? null,
    overheadPercent: project.overheadPercentOverride ?? null,
    contingencyPercent: project.contingencyPercentOverride ?? null,
    vatRate: project.vatRateOverride ?? null,
  };

  const pricingHasInvalidInput =
    !pricingParsed.laborMultiplier.valid ||
    !pricingParsed.overheadPercent.valid ||
    !pricingParsed.contingencyPercent.valid ||
    !pricingParsed.vatRate.valid;

  const pricingHasChanges =
    pricingParsed.laborMultiplier.value !== currentOverrides.laborMultiplier ||
    pricingParsed.overheadPercent.value !== currentOverrides.overheadPercent ||
    pricingParsed.contingencyPercent.value !== currentOverrides.contingencyPercent ||
    pricingParsed.vatRate.value !== currentOverrides.vatRate;

  const pricingFinal = {
    laborMultiplier: project.pricingPolicy?.laborMultiplier ?? project.suggestedLaborMultiplier ?? 1,
    overheadPercent: project.pricingPolicy?.overheadPercent ?? project.suggestedOverheadPercent ?? 12,
    contingencyPercent: project.pricingPolicy?.contingencyPercent ?? project.suggestedContingencyPercent ?? 8,
    vatRate: project.pricingPolicy?.vatRate ?? project.suggestedVatRate ?? 12,
  };

  const tabs = [
    { id: 'rooms', label: 'Rooms & Loads', icon: <Thermometer className="w-4 h-4" /> },
    { id: '3d', label: '3D View', icon: <Box className="w-4 h-4" /> },
    { id: 'equipment', label: 'Equipment', icon: <Package className="w-4 h-4" /> },
    { id: 'boq', label: 'BOQ', icon: <FileText className="w-4 h-4" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
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
          <div className="flex flex-wrap gap-2.5 rounded-xl border border-border/70 bg-card/75 p-2">
            <Button variant="secondary" size="md" onClick={runCalculation} isLoading={calculating}>
              <Calculator className="w-4 h-4 mr-1" /> Calculate
            </Button>
            <Button variant="secondary" size="md" onClick={autoSizeEquipment} isLoading={autoSizing}>
              <Zap className="w-4 h-4 mr-1" /> Auto-Size
            </Button>
            <Button variant="accent" size="md" onClick={generateBOQ} isLoading={generatingBOQ}>
              <FileText className="w-4 h-4 mr-1" /> Generate BOQ
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-7 grid grid-cols-2 gap-5 sm:grid-cols-5">
        <StatCard title="Rooms" value={allRooms.length} icon={MapPin} />
        <StatCard title="Total TR" value={totalTR.toFixed(1)} icon={Thermometer} />
        <StatCard title="Total Area" value={`${totalArea.toFixed(0)} m²`} icon={Building2} />
        <StatCard title="Equipment" value={formatPHP(equipmentCost)} icon={Package} />
        <StatCard title="BOQ Total" value={formatPHP(boqTotal)} icon={FileText} />
      </div>

      {/* Psychrometric Conditions Panel — Carrier Chart */}
      {(() => {
        const outdoorPS = psychrometricState(project.outdoorDB, project.outdoorRH || 50);
        const indoorPS = psychrometricState(project.indoorDB, project.indoorRH);
        return (
          <Card className="mb-6 border-border/70 bg-[linear-gradient(162deg,rgba(15,139,141,0.12),rgba(255,255,255,0.94))] shadow-[0_14px_28px_-24px_rgba(19,32,51,0.66)]">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-[color:var(--accent)]" />
                <h3 className="text-base font-semibold">Carrier Psychrometric Chart — Design Conditions</h3>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Outdoor */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Outdoor Air</p>
                  {renderPsychrometricMetricGrid(outdoorPS, 'bg-[rgba(219,142,47,0.14)]')}
                </div>
                {/* Indoor */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Indoor Air (Design)</p>
                  {renderPsychrometricMetricGrid(indoorPS, 'bg-[rgba(15,139,141,0.14)]')}
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
      <div className="mt-5 space-y-5">
        {/* Rooms & Loads Tab */}
        {activeTab === 'rooms' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Rooms & Cooling Loads</h3>
              <Button variant="accent" size="md" onClick={() => setShowAddRoom(!showAddRoom)}>
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
                <Card className="mb-4 border-border/70 bg-card/90 shadow-[0_14px_28px_-24px_rgba(19,32,51,0.66)]">
                  <CardHeader>
                    <CardTitle>Add New Room</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddRoom} className="space-y-5">
                      {/* Unit toggle */}
                      <div className="flex items-center gap-4 border-b border-border/60 pb-3">
                        <label className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">Input Unit:</label>
                        <button
                          type="button"
                          onClick={() => setRoomForm({ ...roomForm, useFootInput: !roomForm.useFootInput })}
                          className={`rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors ${roomForm.useFootInput ? 'border-accent/35 bg-accent text-accent-foreground' : 'border-border/55 bg-secondary/45 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
                        >
                          Feet (ft)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoomForm({ ...roomForm, useFootInput: !roomForm.useFootInput })}
                          className={`rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors ${!roomForm.useFootInput ? 'border-accent/35 bg-accent text-accent-foreground' : 'border-border/55 bg-secondary/45 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
                        >
                          Meters (m)
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Input label="Room Name *" value={strVal(roomForm.name)} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
                        <Input label="Floor Number" type="number" min={1} max={200} unit="floors" value={numVal(roomForm.floorNumber) || ''} onChange={(e) => handleRoomNumChange('floorNumber', e.target.value)} onBlur={() => handleRoomNumBlur('floorNumber', 1)} />
                        <Select label="Space Type" value={strVal(roomForm.spaceType)} onChange={(e) => setRoomForm({ ...roomForm, spaceType: e.target.value })} options={SPACE_TYPES} />

                        {/* Measurements section */}
                        {roomForm.useFootInput ? (
                          <>
                            <Input label="Room Length (ft) *" type="number" step={0.1} min={0} max={1000} unit="ft" value={numVal(roomForm.lengthFt) || ''} onChange={(e) => handleRoomNumChange('lengthFt', e.target.value)} onBlur={() => handleRoomNumBlur('lengthFt', 0)} hint={numVal(roomForm.lengthFt) > 0 ? `= ${feetToMeters(numVal(roomForm.lengthFt)).toFixed(2)} m` : ''} />
                            <Input label="Room Width (ft) *" type="number" step={0.1} min={0} max={1000} unit="ft" value={numVal(roomForm.widthFt) || ''} onChange={(e) => handleRoomNumChange('widthFt', e.target.value)} onBlur={() => handleRoomNumBlur('widthFt', 0)} hint={numVal(roomForm.widthFt) > 0 ? `= ${feetToMeters(numVal(roomForm.widthFt)).toFixed(2)} m` : ''} />
                            <div>
                              <label className="mb-1.5 block text-sm font-medium text-foreground">Area (auto)</label>
                              <div className="flex h-10 items-center rounded-lg border border-border/60 bg-secondary/50 px-3.5 text-sm tabular-nums">
                                {computedAreaSqft > 0 ? (
                                  <span>{computedAreaSqft.toFixed(1)} ft² <span className="text-muted-foreground">({computedAreaSqm.toFixed(1)} m²)</span></span>
                                ) : (
                                  <span className="text-muted-foreground">Enter length × width</span>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <Input label="Area (m²) *" type="number" step={0.1} min={0} max={100000} unit="m²" value={numVal(roomForm.area) || ''} onChange={(e) => handleRoomNumChange('area', e.target.value)} onBlur={() => handleRoomNumBlur('area', 0)} hint={numVal(roomForm.area) > 0 ? `= ${sqmToSqft(numVal(roomForm.area)).toFixed(1)} ft²` : ''} />
                        )}

                        <Input label="Ceiling Height (m)" type="number" step={0.1} min={2} max={8} unit="m" value={numVal(roomForm.ceilingHeight) || ''} onChange={(e) => handleRoomNumChange('ceilingHeight', e.target.value)} onBlur={() => handleRoomNumBlur('ceilingHeight', 2.7)} hint={`= ${metersToFeet(numVal(roomForm.ceilingHeight)).toFixed(1)} ft`} />
                        <Select label="Wall Construction" value={strVal(roomForm.wallConstruction)} onChange={(e) => setRoomForm({ ...roomForm, wallConstruction: e.target.value })} options={WALL_TYPES} />
                        <Select label="Glass Type" value={strVal(roomForm.windowType)} onChange={(e) => setRoomForm({ ...roomForm, windowType: e.target.value })} options={GLASS_TYPES} />

                        {/* Window measurements */}
                        {roomForm.useFootInput ? (
                          <>
                            <Input label="Window Qty" type="number" min={0} max={100} unit="pcs" value={numVal(roomForm.windowQty) || ''} onChange={(e) => handleRoomNumChange('windowQty', e.target.value)} onBlur={() => handleRoomNumBlur('windowQty', 0)} />
                            <Input label="Window Length (ft)" type="number" step={0.1} min={0} max={100} unit="ft" value={numVal(roomForm.windowLengthFt) || ''} onChange={(e) => handleRoomNumChange('windowLengthFt', e.target.value)} onBlur={() => handleRoomNumBlur('windowLengthFt', 0)} />
                            <Input label="Window Width (ft)" type="number" step={0.1} min={0} max={100} unit="ft" value={numVal(roomForm.windowWidthFt) || ''} onChange={(e) => handleRoomNumChange('windowWidthFt', e.target.value)} onBlur={() => handleRoomNumBlur('windowWidthFt', 0)} hint={computedWindowSqm > 0 ? `= ${computedWindowSqm.toFixed(2)} m²` : ''} />
                          </>
                        ) : (
                          <Input label="Window Area (m²)" type="number" step={0.1} min={0} max={10000} unit="m²" value={numVal(roomForm.windowArea) || ''} onChange={(e) => handleRoomNumChange('windowArea', e.target.value)} onBlur={() => handleRoomNumBlur('windowArea', 0)} hint={numVal(roomForm.windowArea) > 0 ? `= ${sqmToSqft(numVal(roomForm.windowArea)).toFixed(1)} ft²` : ''} />
                        )}

                        <Select label="Window Orientation" value={strVal(roomForm.windowOrientation)} onChange={(e) => setRoomForm({ ...roomForm, windowOrientation: e.target.value })} options={ORIENTATIONS} />
                        <Input label="Occupants" type="number" min={0} max={1000} unit="pax" value={numVal(roomForm.occupantCount) || ''} onChange={(e) => handleRoomNumChange('occupantCount', e.target.value)} onBlur={() => handleRoomNumBlur('occupantCount', 0)} />
                        <Input label="Lighting (W/m²)" type="number" step={0.1} min={5} max={60} unit="W/m²" value={numVal(roomForm.lightingDensity) || ''} onChange={(e) => handleRoomNumChange('lightingDensity', e.target.value)} onBlur={() => handleRoomNumBlur('lightingDensity', 15)} />
                        <Input label="Equipment Load (W)" type="number" step={1} min={0} max={50000} unit="W" value={numVal(roomForm.equipmentLoad) || ''} onChange={(e) => handleRoomNumChange('equipmentLoad', e.target.value)} onBlur={() => handleRoomNumBlur('equipmentLoad', 0)} />
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
                      <div className="flex justify-end gap-3">
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
              <div className="space-y-6">
                {project.floors.map((floor) => (
                  <div key={floor.id} className="rounded-2xl border border-border/70 bg-card/85 p-5 shadow-[0_14px_26px_-24px_rgba(19,32,51,0.64)]">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                      <Building2 className="w-5 h-5 text-accent" />
                      <h4 className="text-base font-bold text-foreground">
                        {floor.name}
                      </h4>
                      <Badge size="sm" variant="default">Floor {floor.floorNumber}</Badge>
                      <span className="text-sm text-muted-foreground ml-auto">{floor.rooms.length} room{floor.rooms.length !== 1 ? 's' : ''}</span>
                    </div>
                    <motion.div variants={listContainerVariants} initial="hidden" animate="visible" className="space-y-4">
                      {floor.rooms.map((room) => {
                        const roomLoadDraft = roomLoadDrafts[room.id] ?? EMPTY_ROOM_LOAD_DRAFT;
                        const roomTrParsed = parsePricingDraftValue(roomLoadDraft.tr);
                        const roomBtuParsed = parsePricingDraftValue(roomLoadDraft.btu);
                        const currentRoomTrOverride = room.coolingLoad?.userTrOverride ?? null;
                        const currentRoomBtuOverride = room.coolingLoad?.userBtuOverride ?? null;
                        const roomLoadHasInvalid = !roomTrParsed.valid || !roomBtuParsed.valid;
                        const roomLoadIsDirty =
                          roomTrParsed.value !== currentRoomTrOverride ||
                          roomBtuParsed.value !== currentRoomBtuOverride;
                        const roomLoadSaving = roomLoadSavingId === room.id;

                        return (
                        <motion.div key={room.id} variants={listItemVariants}>
                          <Card className="border border-border/70 bg-card/85 shadow-[0_12px_24px_-22px_rgba(19,32,51,0.62)]">
                            <CardContent className="p-5">
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <h4 className="text-base font-semibold text-foreground">{room.name}</h4>
                                    <Badge size="sm">{room.spaceType.replace(/_/g, ' ')}</Badge>
                                    <button
                                      onClick={async () => {
                                        if (!confirm(`Delete room "${room.name}"?`)) return;
                                        try {
                                          await roomsApi.delete(id, room.id);
                                          showToast('success', `Room "${room.name}" deleted`);
                                          fetchProject();
                                        } catch {
                                          showToast('error', 'Failed to delete room');
                                        }
                                      }}
                                      className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                                      title="Delete room"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-sm">
                                    <span className="text-muted-foreground">Area: <span className="text-foreground font-medium">{room.area} m² ({sqmToSqft(room.area).toFixed(0)} ft²)</span></span>
                                    <span className="text-muted-foreground">Ceiling: <span className="text-foreground font-medium">{room.ceilingHeight}m ({metersToFeet(room.ceilingHeight).toFixed(1)} ft)</span></span>
                                    <span className="text-muted-foreground">Occupants: <span className="text-foreground font-medium">{room.occupantCount}</span></span>
                                    <span className="text-muted-foreground">Orientation: <span className="text-foreground font-medium">{room.windowOrientation}</span></span>
                                  </div>
                                </div>
                                {room.coolingLoad && (
                                  <div className="w-full shrink-0 text-right sm:w-auto">
                                    <div className="flex gap-5">
                                      <div className="rounded-lg border border-accent/30 bg-accent/12 px-3.5 py-2">
                                        <div className="flex items-center justify-end gap-2 mb-1">
                                          <Badge size="sm" variant={room.coolingLoad.isOverridden ? 'accent' : 'secondary'}>
                                            {room.coolingLoad.isOverridden ? 'Override' : 'Suggested'}
                                          </Badge>
                                        </div>
                                        <p className="text-lg font-bold text-accent">{room.coolingLoad.trValue} TR</p>
                                        <p className="text-sm text-muted-foreground">{(room.coolingLoad.btuPerHour || 0).toLocaleString()} BTU/h</p>
                                      </div>
                                      <div className="rounded-lg border border-border/55 bg-secondary/35 px-3.5 py-2">
                                        <p className="text-base font-semibold">{room.coolingLoad.cfmSupply} CFM</p>
                                        <p className="text-sm text-muted-foreground">
                                          <TermHint
                                            term="Supply Air"
                                            definition="CFM is cubic feet per minute of airflow delivered to the room to offset sensible and latent heat."
                                            compact
                                          />
                                        </p>
                                      </div>
                                      <div className="rounded-lg border border-border/55 bg-secondary/35 px-3.5 py-2">
                                        <p className="text-base font-semibold">{(room.coolingLoad.totalLoad / room.area).toFixed(0)} W/m²</p>
                                        <p className="text-sm text-muted-foreground">
                                          <TermHint
                                            term="Load Density"
                                            definition="Cooling load per floor area. Higher W/m² indicates heavier internal or envelope gains."
                                            compact
                                          />
                                        </p>
                                      </div>
                                    </div>

                                    <div className="mt-2 grid w-full grid-cols-2 gap-2.5 sm:w-[430px]">
                                      <div className="rounded-lg border border-border/55 bg-secondary/35 px-3.5 py-2 text-right">
                                        <p className="text-sm font-semibold tabular-nums">
                                          {Math.round(room.coolingLoad.totalSensibleLoad).toLocaleString()} W
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          <TermHint
                                            term="Sensible"
                                            definition="Sensible load changes dry-bulb temperature and is primarily handled by airflow and coil temperature difference."
                                            compact
                                          />
                                        </p>
                                      </div>
                                      <div className="rounded-lg border border-border/55 bg-secondary/35 px-3.5 py-2 text-right">
                                        <p className="text-sm font-semibold tabular-nums">
                                          {Math.round(room.coolingLoad.totalLatentLoad).toLocaleString()} W
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          <TermHint
                                            term="Latent"
                                            definition="Latent load removes moisture from air and is linked to humidity control and dehumidification performance."
                                            compact
                                          />
                                        </p>
                                      </div>
                                    </div>

                                    <div className="mt-2 grid w-full gap-2 sm:w-[430px]">
                                      <DualValueExplainer
                                        compact
                                        title="TR Decision"
                                        term="TR"
                                        definition="Tons of Refrigeration. 1 TR equals 12,000 BTU/h or about 3.517 kW of cooling capacity."
                                        suggested={`${(room.coolingLoad.suggestedTrValue ?? room.coolingLoad.trValue).toFixed(2)} TR`}
                                        override={
                                          room.coolingLoad.userTrOverride !== null && room.coolingLoad.userTrOverride !== undefined
                                            ? `${room.coolingLoad.userTrOverride.toFixed(2)} TR`
                                            : null
                                        }
                                        final={`${(room.coolingLoad.finalTrValue ?? room.coolingLoad.trValue).toFixed(2)} TR`}
                                        formula="Final TR = override TR when provided, otherwise suggested TR."
                                        note="Suggested TR is derived from envelope, people, lighting, equipment, and ventilation loads."
                                      />
                                      <DualValueExplainer
                                        compact
                                        title="BTU/h Decision"
                                        term="BTU/h"
                                        definition="British Thermal Units per hour, a cooling capacity rate used for HVAC equipment sizing."
                                        suggested={`${Math.round(room.coolingLoad.suggestedBtuPerHour ?? room.coolingLoad.btuPerHour).toLocaleString()} BTU/h`}
                                        override={
                                          room.coolingLoad.userBtuOverride !== null && room.coolingLoad.userBtuOverride !== undefined
                                            ? `${Math.round(room.coolingLoad.userBtuOverride).toLocaleString()} BTU/h`
                                            : null
                                        }
                                        final={`${Math.round(room.coolingLoad.finalBtuPerHour ?? room.coolingLoad.btuPerHour).toLocaleString()} BTU/h`}
                                        formula="Final BTU/h = override BTU/h when provided, otherwise suggested BTU/h."
                                        note="BTU/h is synchronized with TR override decisions for downstream equipment sizing."
                                      />
                                    </div>

                                    <div className="w-full rounded-lg border border-border/65 bg-card/80 p-3.5 shadow-[0_10px_20px_-22px_rgba(19,32,51,0.72)] sm:w-[360px]">
                                      <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">Cooling Load Overrides</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="mb-1 block text-xs text-muted-foreground">TR Override</label>
                                          <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={roomLoadDraft.tr}
                                            onChange={(event) => handleRoomLoadDraftChange(room.id, 'tr', event.target.value)}
                                            placeholder={`Suggested ${(room.coolingLoad.suggestedTrValue ?? room.coolingLoad.trValue).toString()}`}
                                            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-right"
                                          />
                                        </div>
                                        <div>
                                          <label className="mb-1 block text-xs text-muted-foreground">BTU/h Override</label>
                                          <input
                                            type="number"
                                            min={0}
                                            step="1"
                                            value={roomLoadDraft.btu}
                                            onChange={(event) => handleRoomLoadDraftChange(room.id, 'btu', event.target.value)}
                                            placeholder={`Suggested ${Math.round(room.coolingLoad.suggestedBtuPerHour ?? room.coolingLoad.btuPerHour).toString()}`}
                                            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-right"
                                          />
                                        </div>
                                      </div>
                                      <div className="mt-2 flex justify-end gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={roomLoadSaving || !room.coolingLoad.isOverridden}
                                          onClick={() => handleRoomLoadUseSuggested(room)}
                                        >
                                          Use Suggested
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          isLoading={roomLoadSaving}
                                          disabled={roomLoadSaving || roomLoadHasInvalid || !roomLoadIsDirty}
                                          onClick={() => handleRoomLoadSave(room)}
                                        >
                                          Save
                                        </Button>
                                      </div>
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
                                  project.outdoorRH || 50,
                                  project.indoorDB,
                                  project.indoorRH
                                );

                                // Find matching catalog units — if TR is large, find the best single
                                // unit and show how many are needed to cover the load.
                                const maxCatalogTR = Math.max(...EQUIPMENT_CATALOG.map((e) => e.capacityTR));
                                const needsMultiple = rec.adjustedTR > maxCatalogTR;
                                const targetTR = needsMultiple ? maxCatalogTR : rec.adjustedTR;

                                let matchedUnits = EQUIPMENT_CATALOG
                                  .filter((eq) => eq.capacityTR >= targetTR * 0.85 && eq.capacityTR <= targetTR * 1.5)
                                  .sort((a, b) => Math.abs(a.capacityTR - targetTR) - Math.abs(b.capacityTR - targetTR))
                                  .slice(0, 4);

                                // Fallback: if still no match, show the closest units by capacity
                                if (matchedUnits.length === 0) {
                                  matchedUnits = [...EQUIPMENT_CATALOG]
                                    .sort((a, b) => Math.abs(a.capacityTR - rec.adjustedTR) - Math.abs(b.capacityTR - rec.adjustedTR))
                                    .slice(0, 4);
                                }

                                return (
                                  <div className="mt-4 pt-4 border-t border-border/50">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                                      <span className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                                    <p className="mb-2 text-sm text-muted-foreground">
                                      Need: {rec.adjustedTR} TR (adjusted) · Min EER: {rec.recommendedMinEER} · {rec.notes[rec.notes.length - 1]}
                                    </p>
                                    {matchedUnits.length > 0 && (
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {matchedUnits.map((unit, idx) => {
                                          const qty = needsMultiple ? Math.ceil(rec.adjustedTR / unit.capacityTR) : 1;
                                          return (
                                            <div
                                              key={idx}
                                              className="flex items-center justify-between gap-2 rounded border border-border/55 bg-secondary/45 px-3 py-2 text-sm"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <span className="font-medium">{unit.manufacturer}</span>
                                                <span className="text-muted-foreground ml-1">{unit.model}</span>
                                              </div>
                                              <div className="flex items-center gap-2 text-right shrink-0">
                                                <span className="tabular-nums font-medium">{unit.capacityTR} TR</span>
                                                {qty > 1 && <span className="tabular-nums text-accent font-semibold">×{qty}</span>}
                                                <span className="tabular-nums text-muted-foreground">EER {unit.eer}</span>
                                                <span className="tabular-nums text-muted-foreground">{formatPHP(unit.unitPricePHP * qty)}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                      })}
                    </motion.div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3D Visualization Tab */}
        <div className={activeTab === '3d' ? 'block' : 'hidden'}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">3D Building Visualization</h3>
          </div>
          <BuildingViewer3D
            floors={project.floors}
            buildingType={project.buildingType}
            projectName={project.name}
          />
        </div>

        {/* Equipment Tab */}
        {activeTab === 'equipment' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Selected Equipment</h3>
              
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
              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/85 p-3 shadow-[0_14px_26px_-24px_rgba(19,32,51,0.66)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Brand / Model</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Type</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">State</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Capacity</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Qty</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <TermHint
                          term="EER"
                          definition="Energy Efficiency Ratio. Higher EER indicates better efficiency at rated operating conditions."
                        />
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Unit Price</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.selectedEquipment.map((eq) => {
                      const draft = equipmentDrafts[eq.id] ?? { quantity: '', unitPrice: '' };
                      const quantityParsed = parsePricingDraftValue(draft.quantity);
                      const unitPriceParsed = parsePricingDraftValue(draft.unitPrice);
                      const hasInvalidQuantity =
                        quantityParsed.value !== null && !Number.isInteger(quantityParsed.value);
                      const hasInvalid =
                        !quantityParsed.valid ||
                        !unitPriceParsed.valid ||
                        hasInvalidQuantity ||
                        (quantityParsed.value !== null && quantityParsed.value < 0) ||
                        (unitPriceParsed.value !== null && unitPriceParsed.value < 0);
                      const isDirty =
                        quantityParsed.value !== (eq.userQuantityOverride ?? null) ||
                        unitPriceParsed.value !== (eq.userUnitPriceOverride ?? null);
                      const isSaving = equipmentSavingId === eq.id;
                      const previewQuantity =
                        quantityParsed.valid
                          ? (quantityParsed.value ?? (eq.suggestedQuantity ?? eq.quantity))
                          : eq.quantity;
                      const previewUnitPrice =
                        unitPriceParsed.valid
                          ? (unitPriceParsed.value ?? (eq.suggestedUnitPrice ?? eq.unitPrice))
                          : eq.unitPrice;
                      const previewTotal = previewQuantity * previewUnitPrice;

                      return [
                        <tr key={`${eq.id}-main`} className="border-b border-border/30">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{eq.brand}</div>
                            <div className="text-sm text-muted-foreground">{eq.model}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge size="sm">{eq.type.replace(/_/g, ' ')}</Badge>
                            {eq.isInverter && <Badge size="sm" variant="success" className="ml-1">INV</Badge>}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge size="sm" variant={eq.isOverridden ? 'accent' : 'secondary'}>
                              {eq.isOverridden ? 'Override' : 'Suggested'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">{eq.capacityTR.toFixed(1)} TR</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end">
                              <input
                                type="number"
                                min={0}
                                step="1"
                                value={draft.quantity}
                                onChange={(event) => handleEquipmentDraftChange(eq.id, 'quantity', event.target.value)}
                                placeholder={String(eq.suggestedQuantity ?? eq.quantity)}
                                className="w-20 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm"
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Suggested: {eq.suggestedQuantity ?? eq.quantity}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 text-right">{eq.eer.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={draft.unitPrice}
                                onChange={(event) => handleEquipmentDraftChange(eq.id, 'unitPrice', event.target.value)}
                                placeholder={String(eq.suggestedUnitPrice ?? eq.unitPrice)}
                                className="w-28 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm"
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Suggested: {formatPHP(eq.suggestedUnitPrice ?? eq.unitPrice)}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">{formatPHP(previewTotal)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                isLoading={isSaving}
                                disabled={isSaving || hasInvalid || !isDirty}
                                onClick={() => handleEquipmentSave(eq)}
                              >
                                Save
                              </Button>
                              {eq.isOverridden && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isSaving}
                                  onClick={() => handleEquipmentUseSuggested(eq)}
                                >
                                  Use Suggested
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>,
                        <tr key={`${eq.id}-explain`} className="border-b border-border/20 bg-secondary/20">
                          <td colSpan={9} className="px-4 pb-3 pt-2">
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                              <DualValueExplainer
                                compact
                                title="Quantity Decision"
                                suggested={eq.suggestedQuantity ?? eq.quantity}
                                override={eq.userQuantityOverride}
                                final={previewQuantity}
                                formula="Final quantity = override quantity when provided, otherwise suggested quantity."
                              />
                              <DualValueExplainer
                                compact
                                title="Unit Price Decision"
                                suggested={formatPHP(eq.suggestedUnitPrice ?? eq.unitPrice)}
                                override={
                                  eq.userUnitPriceOverride !== null && eq.userUnitPriceOverride !== undefined
                                    ? formatPHP(eq.userUnitPriceOverride)
                                    : null
                                }
                                final={formatPHP(previewUnitPrice)}
                                formula="Final unit price = override price when provided, otherwise suggested catalog price."
                                note="Line total preview = final quantity × final unit price."
                              />
                            </div>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td colSpan={8} className="px-4 py-2.5 text-right">Equipment Subtotal:</td>
                      <td className="px-4 py-2.5 text-right">{formatPHP(equipmentCost)}</td>
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

              {project.isBoqStale && (
                <Badge variant="warning" size="sm">Pricing updated, BOQ needs regeneration</Badge>
              )}
            </div>

            <Card className="mb-4 border border-border/70 bg-card/90 shadow-[0_14px_28px_-24px_rgba(19,32,51,0.66)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pricing Policy Overrides</CardTitle>
                <CardDescription>
                  Suggested values are system defaults. Enter an override to force a final value, or leave blank to use suggested.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-secondary/35 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Labor Multiplier</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedLaborMultiplier ?? 1}</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.laborMultiplier}
                    onChange={(event) => handlePricingDraftChange('laborMultiplier', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.laborMultiplier}</p>
                </div>

                <div className="rounded-lg border border-border/60 bg-secondary/35 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Overhead %</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedOverheadPercent ?? 12}%</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.overheadPercent}
                    onChange={(event) => handlePricingDraftChange('overheadPercent', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.overheadPercent}%</p>
                </div>

                <div className="rounded-lg border border-border/60 bg-secondary/35 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Contingency %</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedContingencyPercent ?? 8}%</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.contingencyPercent}
                    onChange={(event) => handlePricingDraftChange('contingencyPercent', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.contingencyPercent}%</p>
                </div>

                <div className="rounded-lg border border-border/60 bg-secondary/35 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">VAT %</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedVatRate ?? 12}%</p>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricingDraft.vatRate}
                    onChange={(event) => handlePricingDraftChange('vatRate', event.target.value)}
                    placeholder="Use suggested"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.vatRate}%</p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={pricingSaving} onClick={handlePricingResetDraft}>
                  Use Suggested Values
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  isLoading={pricingSaving}
                  disabled={pricingSaving || pricingHasInvalidInput || !pricingHasChanges}
                  onClick={handlePricingSave}
                >
                  Save Pricing Overrides
                </Button>
              </CardFooter>
            </Card>

            {project.boqItems.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="No BOQ generated"
                description="Select equipment first, then generate the Bill of Quantities"
                action={
                  <Button variant="accent" size="sm" onClick={generateBOQ} isLoading={generatingBOQ}>
                    {project.isBoqStale ? 'Regenerate BOQ' : 'Generate BOQ'}
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/85 p-3 shadow-[0_14px_26px_-24px_rgba(19,32,51,0.66)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Section</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Description</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">State</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Qty</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Unit</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Unit Price</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.boqItems.map((item) => {
                      const draftValue = boqDraftPrices[item.id] ?? String(item.unitPrice);
                      const parsedDraft = parseFloat(draftValue);
                      const isDirty = Number.isFinite(parsedDraft) && Math.abs(parsedDraft - item.unitPrice) > 0.0001;
                      const isSaving = boqSavingItemId === item.id;
                      const suggestedUnitPrice = item.suggestedUnitPrice ?? item.unitPrice;
                      const finalUnitPrice = item.finalUnitPrice ?? item.unitPrice;
                      const suggestedTotalPrice = item.suggestedTotalPrice ?? suggestedUnitPrice * item.quantity;
                      const finalTotalPrice = item.finalTotalPrice ?? item.totalPrice;

                      return [
                        <tr key={`${item.id}-main`} className="border-b border-border/30">
                          <td className="px-4 py-2.5 text-sm text-muted-foreground">{item.section}</td>
                          <td className="px-4 py-2.5">{item.description}</td>
                          <td className="px-4 py-2.5">
                            <Badge
                              size="sm"
                              variant={item.isOverridden ? 'accent' : 'secondary'}
                            >
                              {item.isOverridden ? 'Override' : 'Suggested'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right">{item.unit}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={draftValue}
                                onChange={(event) => handleBoqDraftChange(item.id, event.target.value)}
                                className="w-28 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm"
                              />
                            </div>
                            {item.suggestedUnitPrice !== undefined && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Suggested: {formatPHP(item.suggestedUnitPrice)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">{formatPHP(item.totalPrice)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isSaving || !isDirty}
                                isLoading={isSaving}
                                onClick={() => handleBoqItemSave(item)}
                              >
                                Save
                              </Button>
                              {item.isOverridden && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isSaving}
                                  onClick={() => handleBoqUseSuggested(item)}
                                >
                                  Use Suggested
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>,
                        <tr key={`${item.id}-explain`} className="border-b border-border/20 bg-secondary/20">
                          <td colSpan={8} className="px-4 pb-3 pt-2">
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                              <DualValueExplainer
                                compact
                                title="Unit Price Decision"
                                suggested={formatPHP(suggestedUnitPrice)}
                                override={
                                  item.userUnitPriceOverride !== null && item.userUnitPriceOverride !== undefined
                                    ? formatPHP(item.userUnitPriceOverride)
                                    : null
                                }
                                final={formatPHP(finalUnitPrice)}
                                formula="Final unit price = override when provided, otherwise suggested unit price."
                              />
                              <DualValueExplainer
                                compact
                                title="Total Price Decision"
                                suggested={formatPHP(suggestedTotalPrice)}
                                override={
                                  item.userTotalPriceOverride !== null && item.userTotalPriceOverride !== undefined
                                    ? formatPHP(item.userTotalPriceOverride)
                                    : null
                                }
                                final={formatPHP(finalTotalPrice)}
                                formula="Final total price is quantity × final unit price; override fields track source state."
                              />
                            </div>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-lg">
                      <td colSpan={7} className="px-4 py-3 text-right">Grand Total:</td>
                      <td className="px-4 py-3 text-right">{formatPHP(boqTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-1">Export Project</h3>
              <p className="text-sm text-muted-foreground">Download project data in various formats for documentation, CAD, or spreadsheet analysis.</p>
            </div>

            <Card className="mb-4 border border-border/70 bg-card/90 shadow-[0_14px_28px_-24px_rgba(19,32,51,0.66)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Offline Snapshot (v1)</CardTitle>
                <CardDescription>
                  Autosaves locally in your browser and can be restored when needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Last local snapshot:{' '}
                  <span className="text-foreground font-medium">
                    {snapshotSavedAt ? new Date(snapshotSavedAt).toLocaleString() : 'No snapshot saved'}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => saveLocalSnapshot(true)}>
                    Save Snapshot
                  </Button>
                  <Button variant="accent" size="sm" onClick={restoreLocalSnapshot}>
                    Restore Snapshot
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearLocalSnapshot}>
                    Clear Snapshot
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {/* PDF Report */}
              <Card className="cursor-pointer border border-border/65 bg-card/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_16px_28px_-24px_rgba(19,32,51,0.78)]" onClick={() => {
                exportProjectPDF(project);
                showToast('success', 'PDF report downloaded');
              }}>
                <CardContent className="p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10">
                    <FileText className="w-6 h-6 text-red-600" />
                  </div>
                  <h4 className="font-semibold mb-1">PDF Report</h4>
                  <p className="text-sm text-muted-foreground">Full project report with cooling loads, equipment, and BOQ</p>
                </CardContent>
              </Card>

              {/* DXF / CAD */}
              <Card className="cursor-pointer border border-border/65 bg-card/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_16px_28px_-24px_rgba(19,32,51,0.78)]" onClick={() => {
                exportProjectDXF(project);
                showToast('success', 'DXF file downloaded — open in AutoCAD or BricsCAD');
              }}>
                <CardContent className="p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(15,139,141,0.3)] bg-[rgba(15,139,141,0.14)]">
                    <FileDown className="w-6 h-6 text-[color:var(--accent-dark)]" />
                  </div>
                  <h4 className="font-semibold mb-1">CAD Export (DXF)</h4>
                  <p className="text-sm text-muted-foreground">AutoCAD-compatible floor plans with room labels and loads</p>
                </CardContent>
              </Card>

              {/* Excel */}
              <Card className="cursor-pointer border border-border/65 bg-card/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_16px_28px_-24px_rgba(19,32,51,0.78)]" onClick={async () => {
                await exportProjectExcel(project);
                showToast('success', 'Excel workbook downloaded');
              }}>
                <CardContent className="p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                    <FileSpreadsheet className="w-6 h-6 text-green-600" />
                  </div>
                  <h4 className="font-semibold mb-1">Excel Workbook</h4>
                  <p className="text-sm text-muted-foreground">Multi-sheet workbook with loads, equipment, and BOQ</p>
                </CardContent>
              </Card>

              {/* CSV */}
              <Card className="cursor-pointer border border-border/65 bg-card/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_16px_28px_-24px_rgba(19,32,51,0.78)]" onClick={() => {
                exportProjectCSV(project);
                showToast('success', 'CSV file downloaded');
              }}>
                <CardContent className="p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10">
                    <FileText className="w-6 h-6 text-amber-600" />
                  </div>
                  <h4 className="font-semibold mb-1">CSV Data</h4>
                  <p className="text-sm text-muted-foreground">Cooling load data in CSV format for custom analysis</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
      </Tabs>
    </PageWrapper>
  );
}


