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
  AlertTriangle,
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
    fetch('/api/projects?status=all')
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
      const res = await fetch(`/api/projects/${pid}`);
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

  const toggleFault = (id: string) => setExpandedFaults((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const updateInput = useCallback(<K extends keyof DiagnosticInput>(k: K, v: DiagnosticInput[K]) => setInput((p) => ({ ...p, [k]: v })), []);
  const updateNum = useCallback((k: keyof DiagnosticInput, raw: string) => setInput((p) => ({ ...p, [k]: raw === '' ? undefined : parseFloat(raw) })), []);
  const toggleSym = useCallback((k: keyof DiagnosticInput) => setInput((p) => ({ ...p, [k]: !p[k] })), []);

  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
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
      className={cn('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all',
        input[field] ? 'bg-accent/12 border-accent/30 text-accent' : 'bg-card border-border/50 text-muted-foreground hover:text-foreground hover:border-border')}>
      <I size={12} />{label}
    </button>
  );

  const NumField = ({ label, field, unit, ph }: { label: string; field: keyof DiagnosticInput; unit: string; ph?: string }) => (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">{label}</label>
      <div className="relative">
        <Input type="number" step="any" value={input[field] != null ? String(input[field]) : ''} onChange={(e) => updateNum(field, e.target.value)} placeholder={ph ?? '—'} className="pr-9 h-8 text-xs" />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit}</span>
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
            <Button variant="ghost" size="sm" onClick={reset}><RotateCcw size={13} className="mr-1" />Reset</Button>
            <Button size="sm" onClick={run} disabled={loading}>
              {loading ? <span className="animate-pulse text-xs">Analysing…</span> : <><Play size={13} className="mr-1" />Diagnose</>}
            </Button>
          </div>
        }
      />

      {/* ── INPUT SECTION ── */}
      <div className="space-y-3">

        {/* Row 1: Project + System Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 -mt-1 pl-0.5">
            <Stethoscope size={11} className="text-accent" />
            {projectContext}
          </p>
        )}

        {/* Row 2: Symptoms */}
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Symptoms</p>
            <div className="flex flex-wrap gap-1.5">
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
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors pl-0.5">
          <Gauge size={13} />
          Field Measurements
          <span className="text-[10px] text-muted-foreground/60">(optional)</span>
          {showMeasurements ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showMeasurements && (
          <Card>
            <CardContent className="py-3 px-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-3 gap-y-2">
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
        <div className="mt-6 space-y-4">
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Analysis Results</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2">
              <CardContent className="py-3 px-4">
                <p className="text-sm font-semibold text-foreground">{result.summaryTitle}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{result.summaryDescription}</p>
                <div className="mt-2 p-2 rounded-md bg-secondary/50 border border-border/40">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Client Explanation</p>
                  <p className="text-xs text-foreground leading-relaxed">{result.clientExplanation}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              {result.deltaT && (
                <Card>
                  <CardContent className="py-2.5 px-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground">ΔT</p>
                      <p className="text-lg font-bold tabular-nums">{result.deltaT.measured}°C</p>
                      <p className="text-[10px] text-muted-foreground">Range: {result.deltaT.expected.min}–{result.deltaT.expected.max}°C</p>
                    </div>
                    <Badge variant={result.deltaT.status === 'normal' ? 'success' : result.deltaT.status === 'low' ? 'warning' : 'destructive'}>
                      {result.deltaT.status}
                    </Badge>
                  </CardContent>
                </Card>
              )}
              {result.sensibleHeatRatio && (
                <Card>
                  <CardContent className="py-2.5 px-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground">SHR</p>
                      <p className="text-lg font-bold tabular-nums">{result.sensibleHeatRatio.value}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug max-w-[180px]">{result.sensibleHeatRatio.interpretation}</p>
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
          <Card>
            <CardContent className="py-2.5 px-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Immediate Actions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {result.immediateActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <CheckCircle2 size={12} className="text-success mt-0.5 shrink-0" />
                    <span className="text-foreground">{a}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Faults */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{result.faults.length} Faults Identified</p>
            <div className="space-y-2">
              {result.faults.map((f) => (
                <FaultRow key={f.id} fault={f} expanded={expandedFaults.has(f.id)} onToggle={() => toggleFault(f.id)} />
              ))}
            </div>
          </div>

          {/* Preventive */}
          <Card>
            <CardContent className="py-2.5 px-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Preventive Maintenance</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {result.preventiveActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <Shield size={12} className="text-accent mt-0.5 shrink-0" />
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
          <Stethoscope size={32} className="opacity-30 mb-2" />
          <p className="text-xs">Select symptoms and click <strong>Diagnose</strong></p>
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
    <Card padding="none" className="overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary/40 transition-colors">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-[10px] font-bold shrink-0">{fault.rank}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{fault.title}</p>
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
        <div className="border-t border-border/50 px-3 py-3 space-y-3 text-xs">
          {/* Root cause */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Root Cause</p>
            <p className="text-foreground leading-relaxed">{fault.mechanismDescription}</p>
            <p className="text-muted-foreground mt-1"><strong className="text-foreground">Uneven cooling:</strong> {fault.whyCoolingIsUneven}</p>
          </div>

          {/* Symptoms */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Symptoms</p>
            <div className="flex flex-wrap gap-1">
              {fault.symptoms.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary/50 text-foreground">
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Diagnostic Steps</p>
            <ol className="space-y-1">
              {fault.diagnosticSteps.map((st) => (
                <li key={st.order} className="flex gap-2">
                  <span className="text-[10px] font-bold text-accent w-4 text-right shrink-0">{st.order}.</span>
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Corrective Actions</p>
            <div className="space-y-1.5">
              {fault.correctiveActions.map((ca, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Wrench size={11} className="text-muted-foreground mt-0.5 shrink-0" />
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
