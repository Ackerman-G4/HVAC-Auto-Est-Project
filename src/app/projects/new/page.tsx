'use client';

/**
 * Guided project wizard (overhaul-v3 Phase 4.1).
 * A 4-step stepper — Basics → Building → Design conditions → Review — where each
 * step validates before advancing and the draft is persisted to localStorage so
 * a refresh never loses work. Creating the project routes to its detail page,
 * where the WorkflowRail guides the user into rooms/loads/BOQ.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { showToast } from '@/components/ui/toast';
import { authFetch } from '@/lib/api-client';
import { TermHint } from '@/components/ui/term-hint';
import { getCityOptions } from '@/constants/climate-data';
import { psychrometricState } from '@/lib/functions/psychrometric';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { cn } from '@/lib/utils/cn';
import { Save, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

const BUILDING_TYPES = [
  { value: 'commercial', label: 'Commercial' },
  { value: 'residential', label: 'Residential' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'retail', label: 'Retail' },
  { value: 'mixed_use', label: 'Mixed Use' },
];

type PsychrometricSnapshot = ReturnType<typeof psychrometricState>;

const NEW_PROJECT_PSYCHRO_METRICS: Array<{
  term: string;
  definition: string;
  formatValue: (state: PsychrometricSnapshot) => string;
}> = [
  { term: 'WB', definition: 'Wet-bulb temperature: indicates evaporative cooling potential and moisture influence.', formatValue: (s) => `${s.wetBulb}°C` },
  { term: 'Dew Pt', definition: 'Dew point temperature: point where air becomes saturated and condensation begins.', formatValue: (s) => `${s.dewPoint}°C` },
  { term: 'W (g/kg)', definition: 'Humidity ratio: grams of water vapor per kilogram of dry air.', formatValue: (s) => `${(s.humidityRatio * 1000).toFixed(1)} g/kg` },
  { term: 'h (kJ/kg)', definition: 'Specific enthalpy: total heat content per kilogram of dry air.', formatValue: (s) => `${s.enthalpy} kJ/kg` },
  { term: 'v (m3/kg)', definition: 'Specific volume: air volume occupied by one kilogram of dry air.', formatValue: (s) => `${s.specificVolume} m³/kg` },
  { term: 'rho (kg/m3)', definition: 'Air density: mass of air per unit volume at current conditions.', formatValue: (s) => `${s.density} kg/m³` },
];

type FormState = Record<string, string | number>;

const DEFAULT_FORM: FormState = {
  name: '',
  clientName: '',
  buildingType: 'commercial',
  location: '',
  city: 'Manila',
  totalFloorArea: 0,
  floorsAboveGrade: 1,
  floorsBelowGrade: 0,
  outdoorDB: 35,
  outdoorRH: 50,
  indoorDB: 24,
  indoorRH: 50,
  notes: '',
};

const DRAFT_KEY = 'hvac-new-project-draft:v1';

const STEPS = ['Basics', 'Building', 'Conditions', 'Review'] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hydrated, setHydrated] = useState(false);

  // Restore the draft once on mount so a refresh doesn't lose progress.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parsed = safeJsonParse<FormState>(window.localStorage.getItem(DRAFT_KEY));
    if (parsed && typeof parsed === 'object') {
      setForm({ ...DEFAULT_FORM, ...parsed });
    }
    setHydrated(true);
  }, []);

  // Persist the draft after hydration.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form, hydrated]);

  const cityOptions = getCityOptions();
  const outdoorDbValue = Number(form.outdoorDB) || 35;
  const indoorDbValue = Number(form.indoorDB) || 24;
  const crossFieldError =
    outdoorDbValue <= indoorDbValue
      ? 'Outdoor dry bulb should be greater than indoor dry bulb for cooling design calculations.'
      : undefined;

  const handleChange = (field: string, value: string | number) => setForm((prev) => ({ ...prev, [field]: value }));
  const handleNumChange = (field: string, raw: string) => setForm((prev) => ({ ...prev, [field]: raw }));
  const handleNumBlur = (field: string, fallback: number) => {
    setForm((prev) => {
      const v = prev[field];
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return { ...prev, [field]: isNaN(n as number) || v === '' ? fallback : n };
    });
  };

  // Per-step validation gate.
  const stepError = (s: number): string | null => {
    if (s === 0 && !String(form.name).trim()) return 'Enter a project name to continue.';
    if (s === 2 && crossFieldError) return crossFieldError;
    return null;
  };

  const goNext = () => {
    const err = stepError(step);
    if (err) {
      showToast('warning', 'Complete this step', err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleCreate = async () => {
    for (let s = 0; s < STEPS.length; s += 1) {
      const err = stepError(s);
      if (err) {
        setStep(s);
        showToast('error', 'Fix before creating', err);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await authFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.localStorage.removeItem(DRAFT_KEY);
        showToast('success', 'Project created successfully');
        router.push(`/projects/${data.project.id}`);
      } else {
        showToast('error', data.error || 'Failed to create project', data.description || 'Check the values and try again.');
      }
    } catch {
      showToast('error', 'Network error', 'Unable to reach the server. Make sure the app is running and try again.');
    } finally {
      setSaving(false);
    }
  };

  const ps = psychrometricState(outdoorDbValue, Number(form.outdoorRH) || 50);

  return (
    <PageWrapper>
      <PageHeader
        title="New Project"
        description="Set up a new HVAC estimation project in a few guided steps"
        breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'New Project' }]}
      />

      {/* Stepper */}
      <ol className="mb-6 flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active ? 'border-accent/50 bg-accent/10 text-accent'
                    : done ? 'border-border bg-card text-foreground hover:bg-secondary'
                    : 'border-border/60 bg-card text-muted-foreground/60',
                )}
              >
                <span className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  active ? 'bg-accent text-accent-foreground' : done ? 'bg-accent/20 text-accent' : 'bg-secondary text-muted-foreground',
                )}>
                  {done ? <Check size={11} /> : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <Card className="panel-glass border-border/70 bg-card shadow-sm">
        <CardContent className="space-y-4 py-6">
          {step === 0 && (
            <>
              <Input label="Project Name *" placeholder="e.g., ABC Office Tower HVAC" value={form.name} hint="Use a unique, client-facing project identifier" onChange={(e) => handleChange('name', e.target.value)} />
              <Input label="Client Name" placeholder="e.g., ABC Corporation" value={form.clientName} onChange={(e) => handleChange('clientName', e.target.value)} />
              <Select label="Building Type" value={form.buildingType} onChange={(e) => handleChange('buildingType', e.target.value)} options={BUILDING_TYPES} />
              <Input label="Location / Address" placeholder="e.g., Makati CBD" value={form.location} onChange={(e) => handleChange('location', e.target.value)} />
              <Select label="City" value={form.city} onChange={(e) => handleChange('city', e.target.value)} options={cityOptions.map((c) => ({ value: c.value, label: c.label }))} />
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Floors Above Grade" type="number" min={1} max={200} unit="floors" value={form.floorsAboveGrade} onChange={(e) => handleNumChange('floorsAboveGrade', e.target.value)} onBlur={() => handleNumBlur('floorsAboveGrade', 1)} />
                <Input label="Floors Below Grade" type="number" min={0} max={20} unit="floors" value={form.floorsBelowGrade} onChange={(e) => handleNumChange('floorsBelowGrade', e.target.value)} onBlur={() => handleNumBlur('floorsBelowGrade', 0)} />
              </div>
              <Input label="Total Floor Area (sqm)" type="number" min={0} max={500000} unit="m²" value={form.totalFloorArea} onChange={(e) => handleNumChange('totalFloorArea', e.target.value)} onBlur={() => handleNumBlur('totalFloorArea', 0)} />
              <p className="text-xs text-muted-foreground">Rooms are added on the project page after creation — the workflow rail will guide you there.</p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="rounded-sm border border-border bg-secondary/40 p-3">
                <p className="mb-1 text-sm font-medium text-muted-foreground">Carrier Psychrometric Chart</p>
                <p className="text-sm text-muted-foreground">Set outdoor DB &amp; RH — wet-bulb, dew point, humidity ratio, and enthalpy are auto-computed.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Outdoor Dry Bulb (°C)" type="number" step={0.1} min={20} max={50} unit="°C" error={crossFieldError} value={form.outdoorDB} onChange={(e) => handleNumChange('outdoorDB', e.target.value)} onBlur={() => handleNumBlur('outdoorDB', 35)} />
                <Input label="Outdoor RH (%)" type="number" step={1} min={10} max={100} unit="%" value={form.outdoorRH} onChange={(e) => handleNumChange('outdoorRH', e.target.value)} onBlur={() => handleNumBlur('outdoorRH', 50)} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {NEW_PROJECT_PSYCHRO_METRICS.map((metric) => (
                  <div key={metric.term} className="rounded-sm border border-border bg-background px-2 py-2 shadow-sm">
                    <p className="text-sm font-semibold tabular-nums">{metric.formatValue(ps)}</p>
                    <div className="text-[10px] font-display text-muted-foreground">
                      <TermHint term={metric.term} definition={metric.definition} compact className="justify-center" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Indoor Dry Bulb (°C)" type="number" step={0.1} min={16} max={30} unit="°C" value={form.indoorDB} onChange={(e) => handleNumChange('indoorDB', e.target.value)} onBlur={() => handleNumBlur('indoorDB', 24)} />
                <Input label="Indoor RH (%)" type="number" step={1} min={30} max={70} unit="%" value={form.indoorRH} onChange={(e) => handleNumChange('indoorRH', e.target.value)} onBlur={() => handleNumBlur('indoorRH', 50)} />
              </div>
              <Input label="Notes" placeholder="Additional project notes..." value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} />
            </>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold font-display text-muted-foreground">Review</p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ['Project', form.name || '—'],
                  ['Client', form.clientName || '—'],
                  ['Building type', String(form.buildingType)],
                  ['City', String(form.city)],
                  ['Floors (above / below)', `${form.floorsAboveGrade} / ${form.floorsBelowGrade}`],
                  ['Total area', `${form.totalFloorArea} m²`],
                  ['Outdoor design', `${form.outdoorDB}°C / ${form.outdoorRH}%`],
                  ['Indoor design', `${form.indoorDB}°C / ${form.indoorRH}%`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-sm border border-border bg-secondary/40 px-3.5 py-2 text-sm">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium tabular-nums text-foreground">{v}</span>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between border-t border-border bg-card">
          {step === 0 ? (
            <Link href="/projects">
              <Button variant="ghost" type="button"><ArrowLeft className="mr-2 h-4 w-4" /> Cancel</Button>
            </Link>
          ) : (
            <Button variant="ghost" type="button" onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="accent" type="button" onClick={goNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
          ) : (
            <Button variant="accent" type="button" isLoading={saving} onClick={handleCreate}><Save className="mr-2 h-4 w-4" /> Create Project</Button>
          )}
        </CardFooter>
      </Card>
    </PageWrapper>
  );
}
