'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { showToast } from '@/components/ui/toast';
import { authFetch } from '@/lib/api-client';
import { TermHint } from '@/components/ui/term-hint';
import { getCityOptions } from '@/constants/climate-data';
import { psychrometricState } from '@/lib/functions/psychrometric';
import { Save, ArrowLeft } from 'lucide-react';
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
  {
    term: 'WB',
    definition: 'Wet-bulb temperature: indicates evaporative cooling potential and moisture influence.',
    formatValue: (state) => `${state.wetBulb}°C`,
  },
  {
    term: 'Dew Pt',
    definition: 'Dew point temperature: point where air becomes saturated and condensation begins.',
    formatValue: (state) => `${state.dewPoint}°C`,
  },
  {
    term: 'W (g/kg)',
    definition: 'Humidity ratio: grams of water vapor per kilogram of dry air.',
    formatValue: (state) => `${(state.humidityRatio * 1000).toFixed(1)} g/kg`,
  },
  {
    term: 'h (kJ/kg)',
    definition: 'Specific enthalpy: total heat content per kilogram of dry air.',
    formatValue: (state) => `${state.enthalpy} kJ/kg`,
  },
  {
    term: 'v (m3/kg)',
    definition: 'Specific volume: air volume occupied by one kilogram of dry air.',
    formatValue: (state) => `${state.specificVolume} m³/kg`,
  },
  {
    term: 'rho (kg/m3)',
    definition: 'Air density: mass of air per unit volume at current conditions.',
    formatValue: (state) => `${state.density} kg/m³`,
  },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | number>>({
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
  });

  const cityOptions = getCityOptions();
  const outdoorDbValue = Number(form.outdoorDB) || 35;
  const indoorDbValue = Number(form.indoorDB) || 24;
  const crossFieldError =
    outdoorDbValue <= indoorDbValue
      ? 'Outdoor dry bulb should be greater than indoor dry bulb for cooling design calculations.'
      : undefined;

  const handleChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNumChange = (field: string, raw: string) => {
    setForm((prev) => ({ ...prev, [field]: raw }));
  };

  const handleNumBlur = (field: string, fallback: number) => {
    setForm((prev) => {
      const v = prev[field];
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return { ...prev, [field]: isNaN(n as number) || v === '' ? fallback : n };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(form.name).trim()) {
      showToast('error', 'Project name is required', 'Enter a project name before creating the project.');
      return;
    }

    if (crossFieldError) {
      showToast('error', 'Invalid design temperatures', crossFieldError);
      return;
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
        showToast('success', 'Project created successfully');
        router.push(`/projects/${data.project.id}`);
      } else {
        showToast(
          'error',
          data.error || 'Failed to create project',
          data.description || 'Check the form values and try again. If the issue persists, check server logs.'
        );
      }
    } catch {
      showToast('error', 'Network error', 'Unable to reach the server. Make sure the app is running and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        title="New Project"
        description="Create a new HVAC estimation project"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: 'New Project' },
        ]}
      />

      <Card className="panel-glass mb-6 border-border/70 shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project Setup Workspace</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                Define design conditions, building profile, and psychrometric inputs before room modeling.
              </p>
            </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums text-muted-foreground">
              Draft mode · unsaved
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-7 xl:grid-cols-2">
          {/* Project Details */}
          <Card className="panel-glass border-border/70 bg-card shadow-sm">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Project Name *"
                placeholder="e.g., ABC Office Tower HVAC"
                value={form.name}
                hint="Use a unique, client-facing project identifier"
                onChange={(e) => handleChange('name', e.target.value)}
              />
              <Input
                label="Client Name"
                placeholder="e.g., ABC Corporation"
                value={form.clientName}
                onChange={(e) => handleChange('clientName', e.target.value)}
              />
              <Select
                label="Building Type"
                value={form.buildingType}
                onChange={(e) => handleChange('buildingType', e.target.value)}
                options={BUILDING_TYPES}
              />
              <Input
                label="Location / Address"
                placeholder="e.g., Makati CBD"
                value={form.location}
                onChange={(e) => handleChange('location', e.target.value)}
              />
              <Select
                label="City"
                value={form.city}
                onChange={(e) => handleChange('city', e.target.value)}
                options={cityOptions.map((c) => ({ value: c.value, label: c.label }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Floors Above Grade"
                  type="number"
                  min={1}
                  max={200}
                  unit="floors"
                  value={form.floorsAboveGrade}
                  onChange={(e) => handleNumChange('floorsAboveGrade', e.target.value)}
                  onBlur={() => handleNumBlur('floorsAboveGrade', 1)}
                />
                <Input
                  label="Floors Below Grade"
                  type="number"
                  min={0}
                  max={20}
                  unit="floors"
                  value={form.floorsBelowGrade}
                  onChange={(e) => handleNumChange('floorsBelowGrade', e.target.value)}
                  onBlur={() => handleNumBlur('floorsBelowGrade', 0)}
                />
              </div>
              <Input
                label="Total Floor Area (sqm)"
                type="number"
                min={0}
                max={500000}
                unit="m²"
                value={form.totalFloorArea}
                onChange={(e) => handleNumChange('totalFloorArea', e.target.value)}
                onBlur={() => handleNumBlur('totalFloorArea', 0)}
              />
            </CardContent>
          </Card>

          {/* Design Conditions */}
          <Card className="panel-glass border-border/70 bg-card shadow-sm">
            <CardHeader>
              <CardTitle>Design Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Carrier Psychrometric Chart
                </p>
                <p className="text-sm text-muted-foreground">
                  Set outdoor DB & RH — wet-bulb, dew point, humidity ratio, and enthalpy are auto-computed.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Outdoor Dry Bulb (°C)"
                  type="number"
                  step={0.1}
                  min={20}
                  max={50}
                  unit="°C"
                  error={crossFieldError}
                  value={form.outdoorDB}
                  onChange={(e) => handleNumChange('outdoorDB', e.target.value)}
                  onBlur={() => handleNumBlur('outdoorDB', 35)}
                />
                <Input
                  label="Outdoor RH (%)"
                  type="number"
                  step={1}
                  min={10}
                  max={100}
                  unit="%"
                  value={form.outdoorRH}
                  onChange={(e) => handleNumChange('outdoorRH', e.target.value)}
                  onBlur={() => handleNumBlur('outdoorRH', 50)}
                />
              </div>
              {/* Live Psychrometric Summary */}
              {(() => {
                const ps = psychrometricState(Number(form.outdoorDB) || 35, Number(form.outdoorRH) || 50);
                return (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {NEW_PROJECT_PSYCHRO_METRICS.map((metric) => (
                      <div
                        key={metric.term}
                        className="rounded-lg border border-border bg-background px-2 py-2 shadow-sm"
                      >
                        <p className="text-sm font-semibold tabular-nums">{metric.formatValue(ps)}</p>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          <TermHint
                            term={metric.term}
                            definition={metric.definition}
                            compact
                            className="justify-center"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Indoor Dry Bulb (°C)"
                  type="number"
                  step={0.1}
                  min={16}
                  max={30}
                  unit="°C"
                  value={form.indoorDB}
                  onChange={(e) => handleNumChange('indoorDB', e.target.value)}
                  onBlur={() => handleNumBlur('indoorDB', 24)}
                />
                <Input
                  label="Indoor RH (%)"
                  type="number"
                  step={1}
                  min={30}
                  max={70}
                  unit="%"
                  value={form.indoorRH}
                  onChange={(e) => handleNumChange('indoorRH', e.target.value)}
                  onBlur={() => handleNumBlur('indoorRH', 50)}
                />
              </div>
              <Input
                label="Notes"
                placeholder="Additional project notes..."
                value={form.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
              />
            </CardContent>
            <CardFooter className="flex justify-between border-t border-border bg-card">
              <Link href="/projects">
                <Button variant="ghost" type="button">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </Link>
              <Button variant="accent" type="submit" isLoading={saving}>
                <Save className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>
    </PageWrapper>
  );
}
