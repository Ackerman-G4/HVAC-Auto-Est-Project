'use client';

/**
 * CFD Simulation Workspace — 3-panel layout
 *
 * Left:   Equipment config (racks, HVAC, grid settings, simulation mode)
 * Center: 3D viewer tabs (Airflow 3D, Heatmap, Psychrometric)
 * Right:  Results metrics + compliance alerts
 */
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  RotateCcw, Layers, Settings2,
  Box, Wind, Droplets, BarChart3,
  Scan, Server, Fan, Grid3x3,
} from 'lucide-react';

import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { InputPanel, type InputSection, SECTION_ICONS } from '@/components/layout/InputPanel';
import { ViewerPanel, type ViewerTab } from '@/components/layout/ViewerPanel';
import { ResultsPanel, type ResultSection } from '@/components/layout/ResultsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSimulationStore } from '@/stores/simulation-store';
import { authFetch } from '@/lib/api-client';

/* ── Lazy-loaded viewers ───────────────────────────────────────── */

const AirflowViewer3D = dynamic(
  () => import('@/components/building/AirflowViewer3D'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-2 text-sm text-muted-foreground">
          Loading 3D viewer...
        </div>
      </div>
    ),
  },
);

const PsychrometricChart = dynamic(
  () => import('@/components/charts/PsychrometricChart'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-2 text-sm text-muted-foreground">
          Loading chart...
        </div>
      </div>
    ),
  },
);

/* ── Input Sections ────────────────────────────────────────────── */

interface ProjectOption {
  id: string;
  name: string;
}

function useInputSections(projects: ProjectOption[]): InputSection[] {
  return useMemo(() => [
    {
      id: 'project',
      title: 'Project Source',
      icon: <Scan size={14} />,
      defaultOpen: true,
      fields: [
        {
          key: 'projectId',
          label: 'Project',
          type: 'select' as const,
          options: [
            { value: '', label: '— Select project —' },
            ...projects.map(p => ({ value: p.id, label: p.name })),
          ],
        },
      ],
    },
    {
      id: 'mode',
      title: 'Simulation Mode',
      icon: <Settings2 size={14} />,
      defaultOpen: true,
      fields: [
        {
          key: 'mode',
          label: 'Resolution Mode',
          type: 'select' as const,
          options: [
            { value: 'fast', label: 'Fast  (20³ grid, 50 iter)' },
            { value: 'balanced', label: 'Balanced  (30³, 200 iter)' },
            { value: 'engineering', label: 'Engineering  (50³, 500 iter)' },
          ],
        },
      ],
    },
    {
      id: 'grid',
      title: 'Grid & Domain',
      icon: <Layers size={14} />,
      defaultOpen: false,
      fields: [
        { key: 'gridSizeX', label: 'Grid X', type: 'number' as const, min: 5, max: 80, step: 1 },
        { key: 'gridSizeY', label: 'Grid Y', type: 'number' as const, min: 5, max: 80, step: 1 },
        { key: 'gridSizeZ', label: 'Grid Z', type: 'number' as const, min: 5, max: 40, step: 1 },
        { key: 'gridResolution', label: 'Cell Size', type: 'number' as const, unit: 'm', min: 0.05, max: 1, step: 0.05 },
      ],
    },
    {
      id: 'environment',
      title: 'Environment',
      icon: SECTION_ICONS.thermal,
      defaultOpen: true,
      fields: [
        { key: 'ambientTempC', label: 'Ambient Temp', type: 'number' as const, unit: '°C', min: 10, max: 50, step: 0.5 },
        { key: 'ambientHumidityRatio', label: 'Ambient ω', type: 'number' as const, unit: 'kg/kg', min: 0, max: 0.03, step: 0.0001 },
        { key: 'iterations', label: 'Iterations', type: 'number' as const, min: 10, max: 2000, step: 10 },
        { key: 'timeStep', label: 'Time Step', type: 'number' as const, unit: 's', min: 0.01, max: 2, step: 0.01 },
      ],
    },
    {
      id: 'view',
      title: 'Visualization',
      icon: <Box size={14} />,
      defaultOpen: true,
      fields: [
        {
          key: 'activeView',
          label: 'View Mode',
          type: 'select' as const,
          options: [
            { value: 'temperature', label: 'Temperature' },
            { value: 'velocity', label: 'Velocity' },
            { value: 'pressure', label: 'Pressure' },
            { value: 'humidity', label: 'Humidity' },
          ],
        },
        { key: 'selectedSliceZ', label: 'Height Slice', type: 'range' as const, min: 0, max: 20, step: 1 },
        { key: 'showHotspots', label: 'Show Hotspots', type: 'toggle' as const },
        { key: 'showAirflow', label: 'Show Particles', type: 'toggle' as const },
      ],
    },
  ], [projects]);
}

/* ── Main Page ─────────────────────────────────────────────────── */

export default function SimulationWorkspacePage() {
  const store = useSimulationStore();
  const {
    config, result, isRunning,
    racks, hvacUnits, tiles,
    activeView, showHotspots, showAirflow, selectedSliceZ,
    setConfig, setMode,
    autoDetectFromProject,
    runSimulation,
  } = store;

  // ── Project picker state ────────────────────────────────
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [detectSummary, setDetectSummary] = useState<string[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  // Fetch project list on mount
  useEffect(() => {
    authFetch('/api/projects')
      .then(r => r.ok ? r.json() : { projects: [] })
      .then(data => {
        setProjects((data.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      })
      .catch(() => setProjects([]));
  }, []);

  const handleAutoDetect = useCallback(async () => {
    if (!selectedProjectId) return;
    setIsDetecting(true);
    const summary = await autoDetectFromProject(selectedProjectId);
    setDetectSummary(summary);
    setIsDetecting(false);
  }, [selectedProjectId, autoDetectFromProject]);

  const sections = useInputSections(projects);

  /* Flatten store values → input panel */
  const inputValues = useMemo(() => ({
    projectId: selectedProjectId,
    mode: config.mode ?? 'balanced',
    gridSizeX: config.gridSizeX,
    gridSizeY: config.gridSizeY,
    gridSizeZ: config.gridSizeZ,
    gridResolution: config.gridResolution,
    ambientTempC: config.ambientTempC,
    ambientHumidityRatio: config.ambientHumidityRatio ?? 0.0093,
    iterations: config.iterations,
    timeStep: config.timeStep,
    activeView,
    selectedSliceZ,
    showHotspots,
    showAirflow,
  }), [selectedProjectId, config, activeView, selectedSliceZ, showHotspots, showAirflow]);

  const handleInputChange = useCallback((key: string, value: string | number | boolean) => {
    // Project selection
    if (key === 'projectId') {
      setSelectedProjectId(value as string);
      return;
    }
    // UI state
    if (key === 'activeView') {
      store.setActiveView(value as 'temperature' | 'velocity' | 'pressure' | 'humidity');
      return;
    }
    if (key === 'selectedSliceZ') {
      store.setSelectedSliceZ(Number(value));
      return;
    }
    if (key === 'showHotspots') {
      store.setShowHotspots(!!value);
      return;
    }
    if (key === 'showAirflow') {
      store.setShowAirflow(!!value);
      return;
    }
    if (key === 'mode') {
      setMode(value as 'fast' | 'balanced' | 'engineering');
      return;
    }
    // Config values
    setConfig({ [key]: value });
  }, [store, setConfig, setMode]);

  const handleRun = useCallback(() => {
    void runSimulation(selectedProjectId || 'workspace', 'default');
  }, [runSimulation, selectedProjectId]);

  /* ── Viewer tabs ─────────────────────────────────────────────── */
  const viewerTabs: ViewerTab[] = useMemo(() => {
    const tabs: ViewerTab[] = [
      {
        id: '3d',
        label: '3D Airflow',
        icon: <Wind size={14} />,
        content: result ? (
          <div className="h-full">
            <AirflowViewer3D
              result={result}
              racks={racks}
              hvacUnits={hvacUnits}
              showHotspots={showHotspots}
              showAirflow={showAirflow}
              selectedSliceZ={selectedSliceZ}
              viewMode={activeView}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Box size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Run a simulation to visualize airflow</p>
            </div>
          </div>
        ),
      },
      {
        id: 'psychrometric',
        label: 'Psychrometric',
        icon: <Droplets size={14} />,
        content: (
          <div className="p-4 h-full flex items-center justify-center">
            <PsychrometricChart
              points={result ? (() => {
                const wToRh = (w: number, tC: number) => {
                  const ps = 610.78 * Math.exp(17.27 * tC / (237.3 + tC));
                  const ws = 0.622 * ps / (101325 - ps);
                  return Math.min(100, Math.round(w / ws * 100));
                };
                const supplyT = config.ambientTempC - 10;
                const supplyW = (config.ambientHumidityRatio ?? 0.0093) * 0.7;
                const returnT = result.metrics.avgTemperature;
                const returnW = result.metrics.avgHumidityRatio ?? 0.0093;
                const ambientT = config.ambientTempC;
                const ambientW = config.ambientHumidityRatio ?? 0.0093;
                return [
                  { label: 'Supply', temp: supplyT, rh: wToRh(supplyW, supplyT), color: '#2dd4bf' },
                  { label: 'Return', temp: returnT, rh: wToRh(returnW, returnT), color: '#f59e0b' },
                  { label: 'Ambient', temp: ambientT, rh: wToRh(ambientW, ambientT), color: '#94a3b8' },
                ];
              })() : []}
              showComfortZone
              width={580}
              height={420}
            />
          </div>
        ),
      },
    ];
    return tabs;
  }, [result, racks, hvacUnits, showHotspots, showAirflow, selectedSliceZ, activeView, config]);

  /* ── Results sections ────────────────────────────────────────── */
  const resultSections: ResultSection[] = useMemo(() => {
    if (!result) {
      return [{
        id: 'empty',
        title: 'No Results',
        metrics: [{ key: 'hint', label: 'Run a simulation to see metrics', value: '—' }],
      }];
    }
    const m = result.metrics;
    return [
      {
        id: 'thermal',
        title: 'Thermal Performance',
        metrics: [
          { key: 'maxTemp', label: 'Max Temperature', value: m.maxTemperature, unit: '°C', status: m.maxTemperature > 35 ? 'critical' : m.maxTemperature > 30 ? 'warn' : 'ok' },
          { key: 'avgTemp', label: 'Avg Temperature', value: m.avgTemperature, unit: '°C' },
          { key: 'minTemp', label: 'Min Temperature', value: m.minTemperature, unit: '°C' },
          { key: 'pue', label: 'PUE', value: m.pue, status: m.pue > 2 ? 'critical' : m.pue > 1.6 ? 'warn' : 'ok' },
        ],
      },
      {
        id: 'airflow',
        title: 'Airflow',
        metrics: [
          { key: 'maxVel', label: 'Max Velocity', value: m.maxVelocity, unit: 'm/s' },
          { key: 'avgVel', label: 'Avg Velocity', value: m.avgVelocity, unit: 'm/s' },
        ],
      },
      {
        id: 'humidity',
        title: 'Humidity',
        metrics: [
          { key: 'maxW', label: 'Max ω', value: m.maxHumidityRatio ?? 0, unit: 'kg/kg' },
          { key: 'avgW', label: 'Avg ω', value: m.avgHumidityRatio ?? 0, unit: 'kg/kg' },
          { key: 'minW', label: 'Min ω', value: m.minHumidityRatio ?? 0, unit: 'kg/kg' },
        ],
      },
      {
        id: 'convergence',
        title: 'Solver',
        metrics: [
          { key: 'iter', label: 'Iterations', value: result.iteration },
          { key: 'converged', label: 'Converged', value: (() => { const h = result.convergenceHistory; return h.length > 0 && h[h.length - 1] < 1e-4; })() ? 'Yes' : 'No', status: (() => { const h = result.convergenceHistory; return h.length > 0 && h[h.length - 1] < 1e-4; })() ? 'ok' : 'warn' },
          { key: 'cfl', label: 'Effective dt', value: result.effectiveTimeStep ?? config.timeStep, unit: 's' },
        ],
      },
      {
        id: 'hotspots',
        title: 'Hotspots',
        metrics: m.hotspots.map((h, i) => ({
          key: `hs-${i}`,
          label: `(${h.position.x.toFixed(0)},${h.position.y.toFixed(0)},${h.position.z.toFixed(0)})`,
          value: h.temperature,
          unit: '°C',
          status: h.severity === 'emergency' ? 'critical' as const : h.severity === 'critical' ? 'warn' as const : 'ok' as const,
        })),
      },
    ];
  }, [result, config.timeStep]);

  const alerts = useMemo(() => {
    if (!result) return [];
    const a: { label: string; severity: 'ok' | 'warn' | 'critical' }[] = [];
    const h = result.convergenceHistory;
    const converged = h.length > 0 && h[h.length - 1] < 1e-4;
    if (converged) a.push({ label: 'Converged', severity: 'ok' });
    else a.push({ label: 'Not Converged', severity: 'warn' });
    if (result.metrics.hotspots.length === 0) a.push({ label: 'No Hotspots', severity: 'ok' });
    else a.push({ label: `${result.metrics.hotspots.length} Hotspot(s)`, severity: 'critical' });
    if (result.metrics.pue <= 1.6) a.push({ label: `PUE ${result.metrics.pue.toFixed(2)}`, severity: 'ok' });
    else a.push({ label: `PUE ${result.metrics.pue.toFixed(2)}`, severity: 'warn' });
    return a;
  }, [result]);

  /* ── Toolbar ─────────────────────────────────────────────────── */
  const viewerToolbar = useMemo(() => (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px]">
        {racks.length} racks
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {hvacUnits.length} HVAC
      </Badge>
      {result && (
        <Badge variant="accent" className="text-[10px]">
          Iter {result.iteration}
        </Badge>
      )}
    </div>
  ), [racks.length, hvacUnits.length, result]);

  /* ── Status bar ──────────────────────────────────────────────── */
  const statusBar = useMemo(() => {
    if (!result) return <span>Ready</span>;
    return (
      <>
        <span>Grid: {config.gridSizeX}×{config.gridSizeY}×{config.gridSizeZ}</span>
        <span>Res: {config.gridResolution}m</span>
        <span>Mode: {config.mode ?? 'balanced'}</span>
        <span>CFL dt: {result.effectiveTimeStep?.toFixed(4) ?? '—'}s</span>
      </>
    );
  }, [result, config]);

  /* ── Workspace header ────────────────────────────────────────── */
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl border border-border/70 bg-card/65 p-2 text-accent">
          <Box size={16} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Simulation Command Deck</p>
          <h1 className="mt-0.5 text-sm font-semibold text-foreground">CFD Simulation Workspace</h1>
          <p className="text-[11px] text-muted-foreground">Data-center airflow analysis and thermal compliance inspection.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">Mode {config.mode ?? 'balanced'}</Badge>
        <Badge variant="outline" className="text-[10px]">
          Grid {config.gridSizeX}x{config.gridSizeY}x{config.gridSizeZ}
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => setConfig({
          ambientTempC: 24,
          iterations: 200,
        })}>
          <RotateCcw size={14} className="mr-1" /> Reset
        </Button>
      </div>
    </div>
  );

  /* ── Footer status ───────────────────────────────────────────── */
  const footer = (
    <div className="flex items-center justify-between gap-3">
      <span>{isRunning ? 'Simulation running…' : result ? `Completed in ${result.iteration} iterations` : 'Idle'}</span>
      <span className="text-muted-foreground">{new Date().toLocaleTimeString()}</span>
    </div>
  );

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <WorkspaceLayout
      header={header}
      footer={footer}
      inputPanel={
        <InputPanel
          title="Configuration"
          subtitle="Simulation parameters and domain setup"
          sections={sections}
          values={inputValues}
          onChange={handleInputChange}
          onRun={handleRun}
          runLabel={isRunning ? 'Running…' : 'Run Simulation'}
          running={isRunning}
          footer={
            <div className="space-y-2">
              {/* Auto-detect button */}
              <Button
                size="sm"
                variant="secondary"
                className="w-full text-xs"
                onClick={handleAutoDetect}
                disabled={!selectedProjectId || isDetecting}
              >
                <Scan size={12} className="mr-1.5" />
                {isDetecting ? 'Detecting…' : 'Auto-Detect Racks & Tiles'}
              </Button>

              {/* Equipment summary */}
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Server size={10} /> {racks.length} rack(s)
                  <Fan size={10} className="ml-2" /> {hvacUnits.length} HVAC unit(s)
                  <Grid3x3 size={10} className="ml-2" /> {tiles.length} tile(s)
                </div>
                {detectSummary.length > 0 && (
                  <div className="mt-1 max-h-20 overflow-auto rounded-lg border border-border/70 bg-card/60 p-1.5 text-[9px] leading-relaxed">
                    {detectSummary.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          }
        />
      }
      viewerPanel={
        <ViewerPanel
          tabs={viewerTabs}
          defaultTab="3d"
          toolbar={viewerToolbar}
          statusBar={statusBar}
        />
      }
      resultsPanel={
        <ResultsPanel
          title="Results"
          subtitle={result ? 'Simulation complete' : 'Awaiting run'}
          sections={resultSections}
          alerts={alerts}
          footer={
            result && (
              <Button size="sm" variant="secondary" className="w-full text-xs">
                <BarChart3 size={12} className="mr-1.5" /> Export Report
              </Button>
            )
          }
        />
      }
    />
  );
}
