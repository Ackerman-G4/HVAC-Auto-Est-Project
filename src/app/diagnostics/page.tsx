'use client';

import { useState, useCallback, useEffect } from 'react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import {
  Stethoscope,
  Play,
  RotateCcw,
  Thermometer,
  Wind,
  Droplets,
  Wrench,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleDot,
  Shield,
  Zap,
  Clock,
  CircleDollarSign,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { authFetch } from '@/lib/api-client';
import type {
  DiagnosticInput,
  DiagnosticResult,
  DiagnosticFault,
  FaultDomain,
  Severity,
  ConfidenceLevel,
  CostLevel,
  RepairLevel,
} from '@/types/diagnostic';

// ── Project shape ────────────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  name: string;
  clientName: string;
  status: string;
  buildingType: string;
  outdoorDB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  floors: {
    rooms: {
      name: string;
      area: number;
      coolingLoad?: { trValue: number; btuPerHour: number; cfmSupply: number } | null;
      selectedEquipment?: { equipment: { type: string; refrigerant: string } }[];
    }[];
  }[];
}

// ── Lookups ──────────────────────────────────────────────────────────────

const SYSTEM_TYPES = [
  { value: 'split', label: 'Split' },
  { value: 'window', label: 'Window' },
  { value: 'ducted', label: 'Ducted' },
  { value: 'central', label: 'Chiller' },
  { value: 'vrf', label: 'VRF' },
];

const APP_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'light_commercial', label: 'Light Commercial' },
  { value: 'commercial', label: 'Commercial' },
];

const REFRIGERANTS = [
  { value: '', label: 'Unknown' },
  { value: 'R32', label: 'R-32' },
  { value: 'R410A', label: 'R-410A' },
  { value: 'R22', label: 'R-22' },
  { value: 'R134a', label: 'R-134a' },
  { value: 'R407C', label: 'R-407C' },
];

const domainColors: Record<FaultDomain, { bg: string; text: string; label: string }> = {
  airflow: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Airflow' },
  refrigeration: { bg: 'bg-cyan-500/10', text: 'text-cyan-500', label: 'Refrigeration' },
  humidity: { bg: 'bg-teal-500/10', text: 'text-teal-500', label: 'Humidity' },
  controls: { bg: 'bg-purple-500/10', text: 'text-purple-500', label: 'Controls' },
  design: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Design' },
  combined: { bg: 'bg-rose-500/10', text: 'text-rose-500', label: 'Combined' },
};

const severityConfig: Record<Severity, { variant: 'destructive' | 'warning' | 'accent' | 'default'; label: string }> = {
  critical: { variant: 'destructive', label: 'Critical' },
  high: { variant: 'warning', label: 'High' },
  moderate: { variant: 'accent', label: 'Moderate' },
  low: { variant: 'default', label: 'Low' },
};

const confidenceConfig: Record<ConfidenceLevel, { variant: 'destructive' | 'warning' | 'accent' | 'default'; label: string }> = {
  very_high: { variant: 'destructive', label: 'Very High' },
  high: { variant: 'warning', label: 'High' },
  medium: { variant: 'accent', label: 'Medium' },
  low: { variant: 'default', label: 'Low' },
};

const costConfig: Record<CostLevel, string> = { low: '₱', moderate: '₱₱', high: '₱₱₱' };
const repairConfig: Record<RepairLevel, string> = { maintenance: 'Maint.', component_repair: 'Repair', major_repair: 'Major', redesign: 'Redesign' };

// ── Defaults ─────────────────────────────────────────────────────────────

const defaultInput: DiagnosticInput = {
  systemType: 'split',
  applicationType: 'residential',
  refrigerantType: 'R32',
  symptomDescription: '',
  unevenCooling: true,
  weakAirflow: false,
  highHumidity: false,
  noisyOperation: false,
  iceFormation: false,
  shortCycling: false,
  highEnergyBills: false,
};

// ── Page ─────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const [input, setInput] = useState<DiagnosticInput>({ ...defaultInput });
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedFaults, setExpandedFaults] = useState<Set<string>>(new Set());
  const [showMeasurements, setShowMeasurements] = useState(false);

  // project selector
  const [projects, setProjects] = useState<{ id: string; name: string; clientName: string; status: string }[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectContext, setProjectContext] = useState('');

  useEffect(() => {
    authFetch('/api/projects?status=all')
      .then((r) => r.json())
      .then((d) => {
        setProjects((d.projects || []).filter((p: { status: string }) => p.status !== 'deleted'));
        setProjectsLoading(false);
      })
      .catch(() => setProjectsLoading(false));
  }, []);

  const handleProjectSelect = async (pid: string) => {
    setSelectedProjectId(pid);
    if (!pid) { setProjectContext(''); return; }

    try {
      const res = await authFetch(`/api/projects/${pid}`);
      if (!res.ok) throw new Error();
      const { project } = await res.json() as { project: ProjectOption };

      const rooms = project.floors.flatMap((f) => f.rooms);
      const equip = rooms.flatMap((r) => r.selectedEquipment || []);
      const tr = rooms.reduce((s, r) => s + (r.coolingLoad?.trValue || 0), 0);
      const cfm = rooms.reduce((s, r) => s + (r.coolingLoad?.cfmSupply || 0), 0);

      // infer system type
      const types = equip.map((e) => e.equipment.type);
      let sys: DiagnosticInput['systemType'] = 'split';
      if (types.some((t) => t.includes('ducted'))) sys = 'ducted';
      else if (types.some((t) => t.includes('vrf'))) sys = 'central';
      else if (types.some((t) => t.includes('window'))) sys = 'window';

      const bt = project.buildingType.toLowerCase();
      const app: DiagnosticInput['applicationType'] = bt.includes('residential') ? 'residential' : bt.includes('retail') ? 'light_commercial' : 'commercial';
      const ref = equip.length > 0 ? equip[0].equipment.refrigerant : 'R32';

      setInput((prev) => ({
        ...prev,
        systemType: sys,
        applicationType: app,
        refrigerantType: ref,
        outdoorTemp: project.outdoorDB,
        indoorRH: project.indoorRH,
        cfmDesign: cfm > 0 ? Math.round(cfm) : undefined,
      }));

      setProjectContext(`${rooms.length} rooms · ${tr.toFixed(1)} TR · ${equip.length} units`);
      showToast('success', `Loaded "${project.name}"`);
    } catch {
      showToast('error', 'Failed to load project');
    }
  };

  const toggleFault = (id: string) => setExpandedFaults((prev) => {
    const n = new Set(prev);
    if (n.has(id)) {
      n.delete(id);
    } else {
      n.add(id);
    }
    return n;
  });
  const updateInput = useCallback(<K extends keyof DiagnosticInput>(k: K, v: DiagnosticInput[K]) => setInput((p) => ({ ...p, [k]: v })), []);
  const updateNum = useCallback((k: keyof DiagnosticInput, raw: string) => setInput((p) => ({ ...p, [k]: raw === '' ? undefined : parseFloat(raw) })), []);
  const toggleSym = useCallback((k: keyof DiagnosticInput) => setInput((p) => ({ ...p, [k]: !p[k] })), []);

  const run = async () => {
    setLoading(true);
    try {
      const r = await authFetch('/api/diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed'); }
      const d = await r.json();
      setResult(d.result);
      setExpandedFaults(new Set([d.result.faults[0]?.id]));
      showToast('success', 'Analysis complete');
    } catch (e) { showToast('error', e instanceof Error ? e.message : 'Analysis failed'); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setInput({ ...defaultInput });
    setResult(null);
    setExpandedFaults(new Set());
    setSelectedProjectId('');
    setProjectContext('');
    setShowMeasurements(false);
  };

  // helpers
  const Pill = ({ label, field, icon: I }: { label: string; field: keyof DiagnosticInput; icon: React.ComponentType<{ size?: number }> }) => (
    <button type="button" onClick={() => toggleSym(field)}
      className={cn('inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all',
        input[field] ? 'bg-accent/12 border-accent/30 text-accent' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-border')}>
      <I size={14} />{label}
    </button>
  );

  const NumField = ({ label, field, unit, ph }: { label: string; field: keyof DiagnosticInput; unit: string; ph?: string }) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <Input type="number" step="any" value={input[field] != null ? String(input[field]) : ''} onChange={(e) => updateNum(field, e.target.value)} placeholder={ph ?? '—'} className="h-11 pr-11 text-sm" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );

  return (
    <PageWrapper>
      <PageHeader
        title="Diagnostics"
        description="Quick fault analysis for HVAC systems"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="md" onClick={reset}><RotateCcw size={15} className="mr-1.5" />Reset</Button>
            <Button size="md" onClick={run} disabled={loading}>
              {loading ? <span className="animate-pulse text-sm">Analysing…</span> : <><Play size={15} className="mr-1.5" />Diagnose</>}
            </Button>
          </div>
        }
      />

      {/* ── INPUT SECTION ── */}
      <div className="space-y-5">

        {/* Row 1: Project + System Config */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Project"
            value={selectedProjectId}
            onChange={(e) => handleProjectSelect(e.target.value)}
            options={[
              { value: '', label: projectsLoading ? 'Loading…' : 'No project' },
              ...projects.map((p) => ({ value: p.id, label: p.clientName ? `${p.name} — ${p.clientName}` : p.name })),
            ]}
          />
          <Select label="System" options={SYSTEM_TYPES} value={input.systemType} onChange={(e) => updateInput('systemType', e.target.value as DiagnosticInput['systemType'])} />
          <Select label="Application" options={APP_TYPES} value={input.applicationType} onChange={(e) => updateInput('applicationType', e.target.value as DiagnosticInput['applicationType'])} />
          <Select label="Refrigerant" options={REFRIGERANTS} value={input.refrigerantType ?? ''} onChange={(e) => updateInput('refrigerantType', e.target.value)} />
        </div>

        {/* Project context */}
        {projectContext && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Stethoscope size={13} className="text-accent" />
            {projectContext}
          </p>
        )}

        {/* Row 2: Symptoms */}
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="px-5 py-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Symptoms</p>
            <div className="flex flex-wrap gap-2">
              <Pill label="Uneven Cooling" field="unevenCooling" icon={Thermometer} />
              <Pill label="Weak Airflow" field="weakAirflow" icon={Wind} />
              <Pill label="High Humidity" field="highHumidity" icon={Droplets} />
              <Pill label="Noisy" field="noisyOperation" icon={Zap} />
              <Pill label="Ice Formation" field="iceFormation" icon={Droplets} />
              <Pill label="Short Cycling" field="shortCycling" icon={Clock} />
              <Pill label="High Energy" field="highEnergyBills" icon={CircleDollarSign} />
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Measurements (collapsible) */}
        <button type="button" onClick={() => setShowMeasurements(!showMeasurements)}
          className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <Gauge size={15} />
          Field Measurements
          <span className="text-xs text-muted-foreground/60">(optional)</span>
          {showMeasurements ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showMeasurements && (
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="px-5 py-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                <NumField label="Supply (cold)" field="supplyTempCold" unit="°C" ph="14" />
                <NumField label="Supply (warm)" field="supplyTempWarm" unit="°C" ph="22" />
                <NumField label="Return air" field="returnAirTemp" unit="°C" ph="26" />
                <NumField label="Outdoor" field="outdoorTemp" unit="°C" ph="35" />
                <NumField label="Indoor RH" field="indoorRH" unit="%" ph="65" />
                <NumField label="Suction" field="suctionPressure" unit="psi" />
                <NumField label="Discharge" field="dischargePressure" unit="psi" />
                <NumField label="Superheat" field="superheat" unit="°F" />
                <NumField label="Sub-cool" field="subcooling" unit="°F" />
                <NumField label="Motor A" field="motorAmps" unit="A" />
                <NumField label="Rated A" field="ratedAmps" unit="A" />
                <NumField label="CFM meas." field="cfmMeasured" unit="CFM" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── RESULTS SECTION ── */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analysis Results</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 border-border bg-card shadow-sm">
              <CardContent className="px-5 py-5">
                <p className="text-sm font-semibold text-foreground">{result.summaryTitle}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{result.summaryDescription}</p>
                <div className="mt-3 rounded-lg border border-border bg-secondary/50 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Client Explanation</p>
                  <p className="text-sm leading-relaxed text-foreground">{result.clientExplanation}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              {result.deltaT && (
                <Card className="border-border bg-card shadow-sm">
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">ΔT</p>
                      <p className="text-lg font-bold tabular-nums">{result.deltaT.measured}°C</p>
                      <p className="text-xs text-muted-foreground">Range: {result.deltaT.expected.min}–{result.deltaT.expected.max}°C</p>
                    </div>
                    <Badge variant={result.deltaT.status === 'normal' ? 'success' : result.deltaT.status === 'low' ? 'warning' : 'destructive'}>
                      {result.deltaT.status}
                    </Badge>
                  </CardContent>
                </Card>
              )}
              {result.sensibleHeatRatio && (
                <Card className="border-border bg-card shadow-sm">
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">SHR</p>
                      <p className="text-lg font-bold tabular-nums">{result.sensibleHeatRatio.value}</p>
                      <p className="max-w-55 text-xs leading-snug text-muted-foreground">{result.sensibleHeatRatio.interpretation}</p>
                    </div>
                    <Badge variant={result.sensibleHeatRatio.status === 'normal' ? 'success' : 'warning'}>
                      {result.sensibleHeatRatio.status.replace('_', ' ')}
                    </Badge>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Immediate actions */}
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Immediate Actions</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {result.immediateActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
                    <span className="text-foreground">{a}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Faults */}
          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">{result.faults.length} Faults Identified</p>
            <div className="space-y-3">
              {result.faults.map((f) => (
                <FaultRow key={f.id} fault={f} expanded={expandedFaults.has(f.id)} onToggle={() => toggleFault(f.id)} />
              ))}
            </div>
          </div>

          {/* Preventive */}
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Preventive Maintenance</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {result.preventiveActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Shield size={14} className="mt-0.5 shrink-0 text-accent" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!result && (
        <div className="mt-8 flex flex-col items-center text-center text-muted-foreground">
          <Stethoscope size={36} className="mb-2 opacity-30" />
          <p className="text-sm">Select symptoms and click <strong>Diagnose</strong></p>
        </div>
      )}
    </PageWrapper>
  );
}

// ── Fault row ────────────────────────────────────────────────────────────

function FaultRow({ fault, expanded, onToggle }: { fault: DiagnosticFault; expanded: boolean; onToggle: () => void }) {
  const dom = domainColors[fault.domain];
  const sev = severityConfig[fault.severity];
  const conf = confidenceConfig[fault.probability];

  return (
    <Card className="overflow-hidden border-border bg-card p-0 shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{fault.rank}</span>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{fault.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={cn('inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded', dom.bg, dom.text)}>
              <CircleDot size={7} />{dom.label}
            </span>
            <Badge variant={sev.variant} size="sm">{sev.label}</Badge>
            <Badge variant={conf.variant} size="sm">{conf.label}</Badge>
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
          {/* Root cause */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Root Cause</p>
            <p className="text-foreground leading-relaxed">{fault.mechanismDescription}</p>
            <p className="text-muted-foreground mt-1"><strong className="text-foreground">Uneven cooling:</strong> {fault.whyCoolingIsUneven}</p>
          </div>

          {/* Symptoms */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Symptoms</p>
            <div className="flex flex-wrap gap-1">
              {fault.symptoms.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded bg-secondary/50 px-2 py-1 text-xs text-foreground">
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                    severityConfig[s.severity].variant === 'destructive' ? 'bg-red-500'
                    : severityConfig[s.severity].variant === 'warning' ? 'bg-amber-500'
                    : 'bg-accent')} />
                  {s.description}
                </span>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Diagnostic Steps</p>
            <ol className="space-y-1">
              {fault.diagnosticSteps.map((st) => (
                <li key={st.order} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right text-xs font-bold text-accent">{st.order}.</span>
                  <div className="flex-1">
                    <span className="text-foreground">{st.instruction}</span>
                    {st.toolRequired && <span className="text-muted-foreground ml-1">({st.toolRequired})</span>}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Fixes */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Corrective Actions</p>
            <div className="space-y-1.5">
              {fault.correctiveActions.map((ca, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Wrench size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <span className="text-foreground">{ca.action}</span>
                    <span className="ml-2 text-muted-foreground">
                      {repairConfig[ca.repairLevel]} · {costConfig[ca.costLevel]}{ca.estimatedTime ? ` · ${ca.estimatedTime}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
