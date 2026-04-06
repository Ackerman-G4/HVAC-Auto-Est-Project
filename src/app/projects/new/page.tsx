'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { showToast } from '@/components/ui/toast';
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

    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
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

      <Card className="mb-6 border-border/70 bg-[linear-gradient(162deg,rgba(206,161,74,0.15),rgba(255,255,255,0.92))] shadow-[0_14px_28px_-24px_rgba(19,32,51,0.68)]">
        <CardContent className="py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Project Setup Workspace</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                Define design conditions, building profile, and psychrometric inputs before room modeling.
              </p>
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              Draft mode · unsaved
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Project Details */}
          <Card className="border-border/65 bg-card/90 shadow-[0_14px_28px_-24px_rgba(19,32,51,0.66)]">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Project Name *"
                placeholder="e.g., ABC Office Tower HVAC"
                value={form.name}
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
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Floors Above Grade"
                  type="number"
                  min={1}
                  value={form.floorsAboveGrade}
                  onChange={(e) => handleNumChange('floorsAboveGrade', e.target.value)}
                  onBlur={() => handleNumBlur('floorsAboveGrade', 1)}
                />
                <Input
                  label="Floors Below Grade"
                  type="number"
                  min={0}
                  value={form.floorsBelowGrade}
                  onChange={(e) => handleNumChange('floorsBelowGrade', e.target.value)}
                  onBlur={() => handleNumBlur('floorsBelowGrade', 0)}
                />
              </div>
              <Input
                label="Total Floor Area (sqm)"
                type="number"
                min={0}
                value={form.totalFloorArea}
                onChange={(e) => handleNumChange('totalFloorArea', e.target.value)}
                onBlur={() => handleNumBlur('totalFloorArea', 0)}
              />
            </CardContent>
          </Card>

          {/* Design Conditions */}
          <Card className="border-border/65 bg-card/90 shadow-[0_14px_28px_-24px_rgba(19,32,51,0.66)]">
            <CardHeader>
              <CardTitle>Design Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/55 bg-secondary/45 p-3">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Carrier Psychrometric Chart
                </p>
                <p className="text-xs text-muted-foreground">
                  Set outdoor DB & RH — wet-bulb, dew point, humidity ratio, and enthalpy are auto-computed.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Outdoor Dry Bulb (°C)"
                  type="number"
                  step={0.1}
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
                  value={form.outdoorRH}
                  onChange={(e) => handleNumChange('outdoorRH', e.target.value)}
                  onBlur={() => handleNumBlur('outdoorRH', 50)}
                />
              </div>
              {/* Live Psychrometric Summary */}
              {(() => {
                const ps = psychrometricState(Number(form.outdoorDB) || 35, Number(form.outdoorRH) || 50);
                return (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-border/60 bg-background/90 px-1 py-1.5 shadow-[0_8px_16px_-18px_rgba(19,32,51,0.9)]">
                      <p className="text-sm font-semibold tabular-nums">{ps.wetBulb}°C</p>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Wet Bulb</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/90 px-1 py-1.5 shadow-[0_8px_16px_-18px_rgba(19,32,51,0.9)]">
                      <p className="text-sm font-semibold tabular-nums">{ps.dewPoint}°C</p>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Dew Point</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/90 px-1 py-1.5 shadow-[0_8px_16px_-18px_rgba(19,32,51,0.9)]">
                      <p className="text-sm font-semibold tabular-nums">{(ps.humidityRatio * 1000).toFixed(1)} g/kg</p>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Humidity Ratio</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/90 px-1 py-1.5 shadow-[0_8px_16px_-18px_rgba(19,32,51,0.9)]">
                      <p className="text-sm font-semibold tabular-nums">{ps.enthalpy} kJ/kg</p>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Enthalpy</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/90 px-1 py-1.5 shadow-[0_8px_16px_-18px_rgba(19,32,51,0.9)]">
                      <p className="text-sm font-semibold tabular-nums">{ps.specificVolume} m³/kg</p>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sp. Volume</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/90 px-1 py-1.5 shadow-[0_8px_16px_-18px_rgba(19,32,51,0.9)]">
                      <p className="text-sm font-semibold tabular-nums">{ps.density} kg/m³</p>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Density</p>
                    </div>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Indoor Dry Bulb (°C)"
                  type="number"
                  step={0.1}
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
            <CardFooter className="flex justify-between border-t border-border/55 bg-card/80">
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
