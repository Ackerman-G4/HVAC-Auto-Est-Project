'use client';

import { useCallback, useEffect, useState } from 'react';
import { showToast } from '@/components/ui/toast';
import { formatPHP } from '@/lib/utils/format-currency';
import { feetToMeters, sqftToSqm } from '@/lib/utils/unit-conversion';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { authFetch } from '@/lib/api-client';
import { EMPTY_PRICING_DRAFT, EMPTY_ROOM_LOAD_DRAFT } from './constants';
import { parsePricingDraftValue } from './helpers';
import type {
  BoqVerification,
  EquipmentDraftState,
  LocalProjectSnapshot,
  PricingDraftState,
  ProjectData,
  RoomLoadDraftState,
} from './types';

/**
 * Owns all Project Detail state, data fetching, local-snapshot persistence,
 * and every mutation handler (rooms, calculation, equipment, BOQ, pricing).
 * Extracted verbatim from the former monolith page so page.tsx can be a
 * composition shell — behavior unchanged.
 */
export function useProjectDetail(id: string) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [autoSizing, setAutoSizing] = useState(false);
  const [generatingBOQ, setGeneratingBOQ] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [activeTab, setActiveTab] = useState('rooms');
  const [boqDraftPrices, setBoqDraftPrices] = useState<Record<string, string>>({});
  const [boqSavingItemId, setBoqSavingItemId] = useState<string | null>(null);
  const [boqVerification, setBoqVerification] = useState<BoqVerification | null>(null);
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
    authFetch(`/api/projects/${id}`)
      .then((r) => {
        if (!r.ok) {
          return r.json().then((data) => {
            showToast('error', data.error || 'Failed to load project', data.description || '');
            setLoading(false);
            return null;
          });
        }
        return r.json();
      })
      .then((data) => {
        if (data && data.project) {
          setProject(data.project);
          const draftMap = Object.fromEntries(
            (data.project.boqItems || []).map((item: { id: string; unitPrice?: number; finalUnitPrice?: number; }) => [
              item.id,
              String(item.unitPrice ?? item.finalUnitPrice ?? 0),
            ])
          );
          setBoqDraftPrices(draftMap);

          const roomDraftMap: Record<string, RoomLoadDraftState> = {};
          (data.project.floors || []).forEach((floor: { rooms?: Array<{ id: string; coolingLoad?: { userTrOverride?: number | null; userBtuOverride?: number | null } | null }> }) => {
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
          (data.project.selectedEquipment || []).forEach((equipment: {
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
              data.project.laborMultiplierOverride !== null && data.project.laborMultiplierOverride !== undefined
                ? String(data.project.laborMultiplierOverride)
                : '',
            overheadPercent:
              data.project.overheadPercentOverride !== null && data.project.overheadPercentOverride !== undefined
                ? String(data.project.overheadPercentOverride)
                : '',
            contingencyPercent:
              data.project.contingencyPercentOverride !== null && data.project.contingencyPercentOverride !== undefined
                ? String(data.project.contingencyPercentOverride)
                : '',
            vatRate:
              data.project.vatRateOverride !== null && data.project.vatRateOverride !== undefined
                ? String(data.project.vatRateOverride)
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

  const fetchBoqVerification = useCallback(async () => {
    try {
      const res = await authFetch(`/api/projects/${id}/boq/verify`);
      if (!res.ok) {
        setBoqVerification(null);
        return;
      }
      const data = await res.json();
      setBoqVerification((data.verification as BoqVerification) ?? null);
    } catch {
      setBoqVerification(null);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchBoqVerification();
  }, [fetchProject, fetchBoqVerification]);

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
      const res = await authFetch(`/api/projects/${id}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...roomForm,
          area: finalArea,
          windowArea: finalWindowArea,
          perimeter: effectivePerimeterM > 0 ? effectivePerimeterM : undefined,
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
          equipmentLoad: 500,
          hasRoofExposure: false,
        });
        fetchProject();
      } else {
        const data = await res.json();
        showToast('error', data.error || 'Failed to add room', data.description || 'Check the room parameters and try again.');
      }
    } catch (err) {
      console.error('Add room error:', err);
      showToast('error', 'Failed to add room', 'Network error or server unreachable.');
    }
  };

  const runCalculation = async () => {
    setCalculating(true);
    try {
      const res = await authFetch(`/api/projects/${id}/calculate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('success', `Calculated ${data.summary.roomCount} rooms — Total: ${data.summary.totalTR} TR`);
        fetchProject();
      } else {
        showToast('error', data.error || 'Calculation failed', data.description || 'The server returned an error.');
      }
    } catch (err) {
      console.error('Calculate error:', err);
      showToast('error', 'Calculation failed', 'Network error or server unreachable.');
    } finally {
      setCalculating(false);
    }
  };

  const autoSizeEquipment = async () => {
    setAutoSizing(true);
    try {
      const res = await authFetch(`/api/projects/${id}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSize: true, budgetLevel: 'mid-range' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', `Equipment sized for ${data.results.length} rooms`);
        setActiveTab('equipment');
        fetchProject();
      } else {
        showToast('error', data.error || 'Equipment sizing failed', data.description || 'The server returned an error. Make sure rooms have cooling loads calculated first.');
      }
    } catch (err) {
      console.error('Auto-size error:', err);
      showToast('error', 'Equipment sizing failed', 'Network error or server unreachable.');
    } finally {
      setAutoSizing(false);
    }
  };

  const generateBOQ = async () => {
    setGeneratingBOQ(true);
    try {
      const res = await authFetch(`/api/projects/${id}/boq`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('success', `BOQ generated: ${formatPHP(data.boq.grandTotal)}`);
        fetchProject();
        fetchBoqVerification();
      } else {
        showToast('error', data.error || 'BOQ generation failed', data.description || 'Make sure equipment is selected before generating BOQ.');
      }
    } catch (err) {
      console.error('BOQ error:', err);
      showToast('error', 'BOQ generation failed', 'Network error or server unreachable.');
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
      const response = await authFetch(`/api/projects/${id}/boq/${item.id}`, {
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
      fetchBoqVerification();
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
      const response = await authFetch(`/api/projects/${id}/boq/${item.id}`, {
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
      fetchBoqVerification();
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
      const response = await authFetch(`/api/projects/${id}`, {
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
      const response = await authFetch(`/api/projects/${id}/rooms/${roomId}`, {
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
      const response = await authFetch(`/api/projects/${id}/equipment/${equipment.id}`, {
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
      const response = await authFetch(`/api/projects/${id}/equipment/${equipment.id}`, {
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

  return {
    // identity
    id,
    // state
    project,
    loading,
    calculating,
    autoSizing,
    generatingBOQ,
    showAddRoom,
    setShowAddRoom,
    activeTab,
    setActiveTab,
    boqDraftPrices,
    boqSavingItemId,
    boqVerification,
    pricingDraft,
    pricingSaving,
    roomLoadDrafts,
    roomLoadSavingId,
    equipmentDrafts,
    equipmentSavingId,
    snapshotSavedAt,
    roomForm,
    setRoomForm,
    // form helpers + derived
    numVal,
    strVal,
    handleRoomNumChange,
    handleRoomNumBlur,
    computedAreaSqft,
    computedAreaSqm,
    computedWindowSqm,
    effectiveArea,
    effectiveWindowArea,
    effectivePerimeterM,
    // data + snapshot
    fetchProject,
    fetchBoqVerification,
    saveLocalSnapshot,
    restoreLocalSnapshot,
    clearLocalSnapshot,
    // mutations
    handleAddRoom,
    runCalculation,
    autoSizeEquipment,
    generateBOQ,
    handleBoqDraftChange,
    handleBoqItemSave,
    handleBoqUseSuggested,
    handlePricingDraftChange,
    handlePricingResetDraft,
    handlePricingSave,
    handleRoomLoadDraftChange,
    handleRoomLoadSave,
    handleRoomLoadUseSuggested,
    handleEquipmentDraftChange,
    handleEquipmentSave,
    handleEquipmentUseSuggested,
  };
}
