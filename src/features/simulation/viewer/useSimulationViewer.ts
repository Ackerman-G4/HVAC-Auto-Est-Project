'use client';

/**
 * State, effects and handlers for the CFD simulation viewer.
 *
 * Extracted verbatim from app/simulation/viewer/page.tsx so the route stays a
 * composition shell, per the decomposition rule in docs/architecture-v3.md.
 *
 * The layout autosave here is stateful and order-sensitive: layoutHydratingRef
 * suppresses saves while a floor's stored layout is being applied,
 * lastLayoutPayloadHashRef skips redundant PUTs, and layoutSaveTimerRef
 * debounces at 650ms. Moved as-is -- do not "tidy" without re-testing that
 * opening a project fires no PUT and one drag fires exactly one.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { useSimulationStore } from '@/stores/simulation-store';
import type { ServerRack, HVACUnit, PerforatedTile, Vec3 } from '@/types/simulation';
import type { Project } from '@/types/project';
import { authFetch } from '@/lib/api-client';
import { showToast } from '@/components/ui/toast';
import type { DetectedFloor, DetectedRoom, ViewerRoomBoundary } from './types';
import {
  mapLayoutHVACToUnit,
  mapLayoutTile,
  buildLayoutPayload,
  buildLayoutPayloadHash,
  buildRoomBoundariesForFloor,
  snapHVACUnit,
  validateHVACPlacement,
} from './helpers';
import { autoDetectEquipment } from '@/lib/functions/auto-detect-equipment';
import { normalizeRoomLayout } from '@/lib/simulation/normalize-room-layout';
import {
  buildSimulationEngineeringReport,
  exportSimulationReportCsv,
  exportSimulationReportJson,
  exportSimulationReportPdf,
} from '@/lib/reports/simulation-report';
import { appendSimulationReportHistory } from '@/lib/reports/simulation-report-history';

export function useSimulationViewer() {
  const [simError, setSimError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeTab, setActiveTab] = useState('equipment');
  const [selectedHVACId, setSelectedHVACId] = useState<string | null>(null);
  const [layoutSaveState, setLayoutSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const layoutHydratingRef = useRef(false);
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLayoutPayloadHashRef = useRef('');

  const {
    racks,
    hvacUnits,
    tiles,
    isRunning,
    result,
    runtimeMode,
    runSimulation, runCompliance, runPUE, runOptimization,
    activeView, showHotspots, showAirflow, selectedSliceZ,
    setActiveView, setShowHotspots, setShowAirflow, setSelectedSliceZ,
    addRack, updateHVACUnit, setHVACUnits, setTiles, setConfig, setMode, config, clearAll,
    inspectedCell, setInspectedCell,
    tileFlowView, setTileFlowView, alerts, tileAirflowData,
  } = useSimulationStore();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [detectedFloors, setDetectedFloors] = useState<DetectedFloor[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const tileFlowViewerRef = useRef<import('@/components/building/AirflowViewer3D').AirflowViewerHandle>(null);
  const selectedFloor = useMemo(
    () => detectedFloors.find((floor) => floor.id === selectedFloorId) ?? null,
    [detectedFloors, selectedFloorId],
  );

  // Fetch projects
  useEffect(() => {
    authFetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.projects && Array.isArray(data.projects)) {
          setProjectList(data.projects);
          if (data.projects.length > 0) {
            setSelectedProjectId(data.projects[0].id);
          }
        }
        setLoadingProjects(false);
      })
      .catch((err) => {
        setLoadingProjects(false);
        setSimError('Failed to load projects: ' + err?.message);
      });
  }, []);

  // Fetch floors+rooms when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    authFetch(`/api/projects/${selectedProjectId}`)
      .then(res => res.json())
      .then(data => {
        const project = data.project || data;
        if (project.floors && Array.isArray(project.floors)) {
          const floors: DetectedFloor[] = project.floors.map((f: Record<string, unknown>) => ({
            id: f.id as string,
            floorNumber: (f.floorNumber as number) ?? 0,
            name: (f.name as string) ?? `Floor ${f.floorNumber}`,
            scale: Number(f.scale) > 0 ? Number(f.scale) : 50,
            ceilingHeight: (f.ceilingHeight as number) ?? 3.0,
            rooms: Array.isArray(f.rooms) ? (f.rooms as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
              id: r.id as string,
              name: (r.name as string) ?? 'Room',
              area: (r.area as number) ?? 0,
              ceilingHeight: (r.ceilingHeight as number) ?? 3.0,
              spaceType: (r.spaceType as string) ?? 'office',
              occupantCount: (r.occupantCount as number) ?? 0,
              lightingDensity: (r.lightingDensity as number) ?? 0,
              equipmentLoad: (r.equipmentLoad as number) ?? 0,
              coolingLoad: r.coolingLoad as DetectedRoom['coolingLoad'],
              polygon: typeof r.polygon === 'string' ? r.polygon : undefined,
            })) : [],
          }));
          setDetectedFloors(floors);
          if (floors.length > 0) setSelectedFloorId(floors[0].id);
        }
      })
      .catch(() => { /* ignore */ });
  }, [selectedProjectId]);

  // Sync HVAC/tile placements from saved floorplan layout.
  useEffect(() => {
    if (!selectedProjectId || !selectedFloorId) {
      return;
    }

    let cancelled = false;
    layoutHydratingRef.current = true;

    authFetch(`/api/projects/${selectedProjectId}/simulation-layout?floorId=${encodeURIComponent(selectedFloorId)}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const data = await response.json();
        return (data?.layout ?? null) as Record<string, unknown> | null;
      })
      .then((layout) => {
        if (cancelled) {
          return;
        }

        const hvacPlacements = Array.isArray(layout?.hvacPlacements)
          ? (layout?.hvacPlacements as Record<string, unknown>[])
          : [];
        const tilePlacements = Array.isArray(layout?.tilePlacements)
          ? (layout?.tilePlacements as Record<string, unknown>[])
          : [];

        const mappedHVAC = hvacPlacements
          .map((placement, index) => mapLayoutHVACToUnit(placement, index))
          .filter((unit): unit is HVACUnit => unit !== null);
        const mappedTiles = tilePlacements
          .map(mapLayoutTile)
          .filter((tile): tile is PerforatedTile => tile !== null);

        // Single normalization pass: floor-snap, drop NaN, validate, one grid
        // size. Same pipeline as auto-detect so a hydrated layout and a freshly
        // detected one are grounded and framed identically.
        const normalized = normalizeRoomLayout({
          roomBoundaries: buildRoomBoundariesForFloor(selectedFloor),
          racks: [],
          hvacUnits: mappedHVAC,
          tiles: mappedTiles,
          gridResolution: config.gridResolution,
          ceilingHeightM: selectedFloor?.ceilingHeight,
        });

        setHVACUnits(normalized.hvacUnits);
        setTiles(normalized.tiles);
        if (selectedHVACId && !normalized.hvacUnits.some((unit) => unit.id === selectedHVACId)) {
          setSelectedHVACId(null);
        }

        // Seed the autosave baseline from the NORMALIZED payload so opening a
        // project never triggers a PUT /simulation-layout — render-time sanitize
        // only, storage is never silently mutated.
        const hydratedPayload = buildLayoutPayload(
          selectedFloorId,
          selectedFloor,
          normalized.hvacUnits,
          normalized.tiles,
        );
        lastLayoutPayloadHashRef.current = buildLayoutPayloadHash(hydratedPayload);

        if (normalized.warnings.length > 0) {
          showToast(
            'warning',
            'Layout adjusted on load',
            `${normalized.hvacUnits.length} unit(s) placed; ${normalized.warnings.length} adjusted or skipped by placement validation.`,
          );
        }

        const currentConfig = useSimulationStore.getState().config;
        if (
          normalized.gridSize.gridSizeX !== currentConfig.gridSizeX
          || normalized.gridSize.gridSizeY !== currentConfig.gridSizeY
          || normalized.gridSize.gridSizeZ !== currentConfig.gridSizeZ
        ) {
          setConfig(normalized.gridSize);
        }
      })
      .catch(() => { /* ignore layout sync errors */ })
      .finally(() => {
        if (!cancelled) {
          layoutHydratingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
      layoutHydratingRef.current = false;
    };
  }, [
    selectedProjectId,
    selectedFloorId,
    selectedFloor,
    selectedHVACId,
    config.gridResolution,
    setConfig,
    setHVACUnits,
    setTiles,
  ]);

  const viewerRoomBoundaries = useMemo<ViewerRoomBoundary[]>(
    () => buildRoomBoundariesForFloor(selectedFloor),
    [selectedFloor],
  );

  const canEditHVACIn3D = viewerRoomBoundaries.length > 0;

  const handleHVACDragPreview = useCallback((unitId: string, proposedPosition: Vec3) => {
    const unit = hvacUnits.find((item) => item.id === unitId);
    if (!unit) {
      return {
        position: proposedPosition,
        valid: false,
        reason: 'Selected HVAC unit no longer exists.',
      };
    }

    const snappedCandidate = snapHVACUnit({
      ...unit,
      position: {
        x: proposedPosition.x,
        y: proposedPosition.y,
        z: unit.position.z,
      },
    });
    const validation = validateHVACPlacement(
      snappedCandidate,
      hvacUnits.filter((item) => item.id !== unitId),
      viewerRoomBoundaries,
    );

    return {
      position: snappedCandidate.position,
      valid: validation.valid,
      reason: validation.reason,
    };
  }, [hvacUnits, viewerRoomBoundaries]);

  const handleHVACDragCommit = useCallback((unitId: string, position: Vec3) => {
    const unit = hvacUnits.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    const snappedCandidate = snapHVACUnit({
      ...unit,
      position: {
        x: position.x,
        y: position.y,
        z: unit.position.z,
      },
    });
    const validation = validateHVACPlacement(
      snappedCandidate,
      hvacUnits.filter((item) => item.id !== unitId),
      viewerRoomBoundaries,
    );

    if (!validation.valid) {
      showToast('warning', 'Invalid HVAC placement', validation.reason ?? 'Placement failed validation.');
      return;
    }

    setSelectedHVACId(unitId);
    updateHVACUnit(unitId, { position: snappedCandidate.position });
  }, [hvacUnits, updateHVACUnit, viewerRoomBoundaries]);

  const handleHVACDragInvalid = useCallback((_: string, reason: string) => {
    showToast('warning', 'Invalid HVAC placement', reason || 'Placement failed validation.');
  }, []);

  // Persist committed HVAC/tile layout changes back to the floor simulation layout.
  useEffect(() => {
    if (!selectedProjectId || !selectedFloorId || layoutHydratingRef.current) {
      return;
    }

    const payload = buildLayoutPayload(selectedFloorId, selectedFloor, hvacUnits, tiles);
    const nextHash = buildLayoutPayloadHash(payload);

    if (nextHash === lastLayoutPayloadHashRef.current) {
      return;
    }

    if (layoutSaveTimerRef.current) {
      clearTimeout(layoutSaveTimerRef.current);
      layoutSaveTimerRef.current = null;
    }

    layoutSaveTimerRef.current = setTimeout(() => {
      setLayoutSaveState('saving');
      authFetch(`/api/projects/${selectedProjectId}/simulation-layout`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (!response.ok) {
            const details = await response.text().catch(() => '');
            throw new Error(details || 'Failed to save simulation layout.');
          }
          lastLayoutPayloadHashRef.current = nextHash;
          setLayoutSaveState('saved');
        })
        .catch(() => {
          setLayoutSaveState('error');
          showToast(
            'error',
            'Simulation layout save failed',
            'Recent HVAC or tile changes were not persisted. Move the unit again to retry.',
          );
        });
    }, 650);

    return () => {
      if (layoutSaveTimerRef.current) {
        clearTimeout(layoutSaveTimerRef.current);
        layoutSaveTimerRef.current = null;
      }
    };
  }, [selectedProjectId, selectedFloorId, selectedFloor, hvacUnits, tiles]);

  useEffect(() => {
    if (layoutSaveState !== 'saved') {
      return;
    }
    const clearSavedStateTimer = setTimeout(() => {
      setLayoutSaveState('idle');
    }, 1200);
    return () => {
      clearTimeout(clearSavedStateTimer);
    };
  }, [layoutSaveState]);

  const layoutSaveStatusText = useMemo(() => {
    if (layoutSaveState === 'saving') return 'Layout saving...';
    if (layoutSaveState === 'saved') return 'Layout saved';
    if (layoutSaveState === 'error') return 'Layout save failed';
    return 'Layout synced';
  }, [layoutSaveState]);

  // Auto-detect handler: one implementation (autoDetectEquipment) routed
  // through normalizeRoomLayout so racks, HVAC, and the grid share one frame.
  const handleAutoDetect = useCallback(() => {
    const floor = detectedFloors.find(f => f.id === selectedFloorId);
    if (!floor || floor.rooms.length === 0) {
      showToast('error', 'No rooms found', 'This floor has no rooms to auto-detect from.');
      return;
    }

    setIsDetecting(true);
    clearAll();
    setSelectedHVACId(null);

    const detected = autoDetectEquipment({ floors: [floor], gridResolution: config.gridResolution });
    const seededRacks: ServerRack[] = detected.racks.map((r, i) => ({ ...r, id: `auto-rack-${i + 1}-${crypto.randomUUID()}` }));
    const seededHVAC: HVACUnit[] = detected.hvacUnits.map((u, i) => ({ ...u, id: `auto-hvac-${i + 1}-${crypto.randomUUID()}` }));

    const normalized = normalizeRoomLayout({
      roomBoundaries: buildRoomBoundariesForFloor(floor),
      racks: seededRacks,
      hvacUnits: seededHVAC,
      tiles: detected.tiles,
      gridResolution: config.gridResolution,
      ceilingHeightM: floor.ceilingHeight,
    });

    for (const rack of normalized.racks) addRack(rack);
    setHVACUnits(normalized.hvacUnits);
    setTiles(normalized.tiles);
    setConfig(normalized.gridSize);

    setIsDetecting(false);
    const rejectedCount = normalized.warnings.length;
    const message = rejectedCount > 0
      ? `Placed ${normalized.racks.length} rack(s) and ${normalized.hvacUnits.length} HVAC unit(s); ${rejectedCount} adjusted/skipped by placement validation.`
      : `Placed ${normalized.racks.length} rack(s) and ${normalized.hvacUnits.length} HVAC unit(s) from ${floor.rooms.length} room(s).`;
    showToast(rejectedCount > 0 ? 'warning' : 'success', 'Equipment auto-detected', message);
  }, [detectedFloors, selectedFloorId, config.gridResolution, addRack, setHVACUnits, setTiles, setConfig, clearAll]);
  const totalHeatKW = useMemo(() => racks.reduce((s, r) => s + r.powerKW, 0), [racks]);
  const totalCoolingKW = useMemo(() => hvacUnits.filter(u => u.status !== 'failed').reduce((s, u) => s + u.capacityKW, 0), [hvacUnits]);
  // Engineering report export (PDF/CSV/JSON). Ported from the retired
  // /simulation/workspace view, which was the only surface offering it.
  const [reportExporting, setReportExporting] = useState<null | 'pdf' | 'csv' | 'json'>(null);

  const selectedProjectName = useMemo(
    () => projectList.find((project) => project.id === selectedProjectId)?.name ?? 'Simulation Workspace',
    [projectList, selectedProjectId],
  );

  const handleExportReport = useCallback(async (format: 'pdf' | 'csv' | 'json') => {
    if (!result) {
      showToast('error', 'Run simulation first');
      return;
    }

    setReportExporting(format);
    try {
      const report = buildSimulationEngineeringReport({
        projectId: selectedProjectId || 'viewer',
        projectName: selectedProjectName,
        floorId: selectedFloorId || 'default',
        runtimeMode,
        config,
        rackCount: racks.length,
        hvacCount: hvacUnits.length,
        tileCount: tiles.length,
        totalHeatKw: totalHeatKW,
        totalCoolingKw: totalCoolingKW,
        result,
      });

      if (format === 'pdf') {
        await exportSimulationReportPdf(report);
      } else if (format === 'csv') {
        exportSimulationReportCsv(report);
      } else {
        exportSimulationReportJson(report);
      }

      try {
        await appendSimulationReportHistory(report, format, 'viewer');
      } catch (historyError) {
        console.warn('Failed to persist simulation report history:', historyError);
      }

      showToast('success', `${format.toUpperCase()} report exported`);
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to export report');
    } finally {
      setReportExporting(null);
    }
  }, [
    config, hvacUnits, racks, result, runtimeMode, selectedProjectId,
    selectedProjectName, selectedFloorId, tiles.length, totalHeatKW, totalCoolingKW,
  ]);

  return {
    simError,
    setSimError,
    projectList,
    setProjectList,
    loadingProjects,
    setLoadingProjects,
    activeTab,
    setActiveTab,
    selectedHVACId,
    setSelectedHVACId,
    layoutSaveState,
    setLayoutSaveState,
    layoutHydratingRef,
    layoutSaveTimerRef,
    lastLayoutPayloadHashRef,
    tileFlowViewerRef,
    racks,
    hvacUnits,
    tiles,
    isRunning,
    result,
    runSimulation,
    runCompliance,
    runPUE,
    runOptimization,
    activeView,
    showHotspots,
    showAirflow,
    selectedSliceZ,
    setActiveView,
    setShowHotspots,
    setShowAirflow,
    setSelectedSliceZ,
    addRack,
    updateHVACUnit,
    setHVACUnits,
    setTiles,
    setConfig,
    setMode,
    config,
    clearAll,
    inspectedCell,
    setInspectedCell,
    tileFlowView,
    setTileFlowView,
    alerts,
    tileAirflowData,
    selectedProjectId,
    setSelectedProjectId,
    detectedFloors,
    setDetectedFloors,
    selectedFloorId,
    setSelectedFloorId,
    isDetecting,
    setIsDetecting,
    selectedFloor,
    viewerRoomBoundaries,
    handleHVACDragPreview,
    handleHVACDragCommit,
    handleHVACDragInvalid,
    layoutSaveStatusText,
    handleAutoDetect,
    totalHeatKW,
    totalCoolingKW,
    canEditHVACIn3D,
    runtimeMode,
    reportExporting,
    handleExportReport,
  };
}
