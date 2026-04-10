'use client';

import { useState, useEffect } from 'react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { showToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { Save, RotateCcw, Thermometer, Building2, PhilippinePeso, Snowflake, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { authFetch } from '@/lib/api-client';

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const canManageSettings = user?.role === 'admin';

  const [settings, setSettings] = useState({
    // Design Defaults
    defaultIndoorDB: 24,
    defaultIndoorRH: 50,
    defaultSafetyFactor: 1.1,
    defaultDiversityFactor: 1.0,
    defaultCeilingHeight: 2.7,
    defaultLightingDensity: 15,
    defaultEquipmentLoad: 500,

    // Cost Defaults
    laborMultiplier: 0.35,
    overheadPercent: 0.15,
    vatRate: 0.12,
    contingencyPercent: 0.05,
    defaultBudgetLevel: 'mid-range',

    // Units
    temperatureUnit: 'celsius',
    areaUnit: 'sqm',
    lengthUnit: 'meters',
    currencySymbol: '₱',

    // System
    autoCalculate: true,
    autoSaveInterval: 30,
  });

  // Unit Placement Rules — user-defined rules for which AC type goes where
  const [placementRules, setPlacementRules] = useState<{
    id: number;
    spaceType: string;
    maxTR: number;
    preferredUnit: string;
    wallMountHeight: number;
    outdoorPlacement: string;
    notes: string;
  }[]>([
    { id: 1, spaceType: 'office', maxTR: 3, preferredUnit: 'wall_split', wallMountHeight: 2.1, outdoorPlacement: 'rooftop', notes: '' },
    { id: 2, spaceType: 'conference_room', maxTR: 5, preferredUnit: 'ceiling_cassette', wallMountHeight: 0, outdoorPlacement: 'rooftop', notes: '' },
    { id: 3, spaceType: 'server_room', maxTR: 10, preferredUnit: 'floor_standing', wallMountHeight: 0, outdoorPlacement: 'ground_level', notes: 'Precision cooling required' },
    { id: 4, spaceType: 'lobby', maxTR: 8, preferredUnit: 'ducted_split', wallMountHeight: 0, outdoorPlacement: 'rooftop', notes: '' },
    { id: 5, spaceType: 'retail', maxTR: 5, preferredUnit: 'ceiling_cassette', wallMountHeight: 0, outdoorPlacement: 'rooftop', notes: '' },
  ]);

  // Load settings from DB on mount, fallback to localStorage
  useEffect(() => {
    authFetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
          if (data.settings.placementRules) {
            setPlacementRules(data.settings.placementRules);
          }
        }
      })
      .catch(() => {
        // Fallback to localStorage
        const saved = localStorage.getItem('hvac-settings');
        if (saved) {
          const parsed = safeJsonParse<Record<string, unknown>>(saved);
          if (parsed) {
            setSettings((prev) => ({ ...prev, ...parsed }));
          }
        }
        const savedRules = localStorage.getItem('hvac-placement-rules');
        if (savedRules) {
          const parsedRules = safeJsonParse<typeof placementRules>(savedRules);
          if (Array.isArray(parsedRules)) {
            setPlacementRules(parsedRules);
          }
        }
      });
  }, []);

  const addPlacementRule = () => {
    if (!canManageSettings) return;

    const newId = Math.max(0, ...placementRules.map((r) => r.id)) + 1;
    setPlacementRules([...placementRules, {
      id: newId,
      spaceType: 'office',
      maxTR: 3,
      preferredUnit: 'wall_split',
      wallMountHeight: 2.1,
      outdoorPlacement: 'rooftop',
      notes: '',
    }]);
  };

  const removePlacementRule = (id: number) => {
    if (!canManageSettings) return;
    setPlacementRules(placementRules.filter((r) => r.id !== id));
  };

  const updatePlacementRule = (id: number, field: string, value: string | number) => {
    if (!canManageSettings) return;
    setPlacementRules(placementRules.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleChange = (field: string, value: string | number | boolean) => {
    if (!canManageSettings) return;
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!canManageSettings) {
      showToast('warning', 'Read-only access', 'Only admins can update settings.');
      return;
    }

    const payload = { ...settings, placementRules };
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('success', 'Settings saved');
    } catch {
      localStorage.setItem('hvac-settings', JSON.stringify(settings));
      localStorage.setItem('hvac-placement-rules', JSON.stringify(placementRules));
      showToast('warning', 'Saved locally (DB unavailable)');
    }
  };

  const handleReset = async () => {
    if (!canManageSettings) {
      showToast('warning', 'Read-only access', 'Only admins can reset settings.');
      return;
    }

    const defaults = {
      defaultIndoorDB: 24,
      defaultIndoorRH: 50,
      defaultSafetyFactor: 1.1,
      defaultDiversityFactor: 1.0,
      defaultCeilingHeight: 2.7,
      defaultLightingDensity: 15,
      defaultEquipmentLoad: 500,
      laborMultiplier: 0.35,
      overheadPercent: 0.15,
      vatRate: 0.12,
      contingencyPercent: 0.05,
      defaultBudgetLevel: 'mid-range',
      temperatureUnit: 'celsius',
      areaUnit: 'sqm',
      lengthUnit: 'meters',
      currencySymbol: '₱',
      autoCalculate: true,
      autoSaveInterval: 30,
    };
    const defaultRules = [
      { id: 1, spaceType: 'office', maxTR: 3, preferredUnit: 'wall_split', wallMountHeight: 2.1, outdoorPlacement: 'rooftop', notes: '' },
      { id: 2, spaceType: 'conference_room', maxTR: 5, preferredUnit: 'ceiling_cassette', wallMountHeight: 0, outdoorPlacement: 'rooftop', notes: '' },
      { id: 3, spaceType: 'server_room', maxTR: 10, preferredUnit: 'floor_standing', wallMountHeight: 0, outdoorPlacement: 'ground_level', notes: 'Precision cooling required' },
    ];
    setSettings(defaults);
    setPlacementRules(defaultRules);
    localStorage.removeItem('hvac-settings');
    localStorage.removeItem('hvac-placement-rules');
    // Reset in DB too
    try {
      await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...defaults, placementRules: defaultRules }),
      });
    } catch { /* ignore */ }
    showToast('info', 'Settings reset to defaults');
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Settings"
        description="Configure default values and system preferences"
      />

      <Card className="mb-6 border-border bg-accent/5">
        <CardContent className="py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Configuration Workspace</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                Tune default design assumptions, costing factors, and unit-placement rules to match your firm standards.
              </p>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {placementRules.length} placement rule{placementRules.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      {!canManageSettings && (
        <Card className="mb-6 border-[rgba(206,161,74,0.45)] bg-[rgba(206,161,74,0.12)]">
          <CardContent className="py-3">
            <div className="flex items-start gap-2 text-sm text-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-accent" />
              <p>
                Read-only mode: settings updates are restricted to admin accounts.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Design Defaults */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Design Defaults</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Indoor Dry Bulb (°C)"
                type="number"
                step={0.5}
                min={16}
                max={30}
                unit="°C"
                value={settings.defaultIndoorDB}
                onChange={(e) => handleChange('defaultIndoorDB', parseFloat(e.target.value))}
                disabled={!canManageSettings}
              />
              <Input
                label="Indoor RH (%)"
                type="number"
                step={5}
                min={30}
                max={70}
                unit="%"
                value={settings.defaultIndoorRH}
                onChange={(e) => handleChange('defaultIndoorRH', parseInt(e.target.value))}
                disabled={!canManageSettings}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Safety Factor"
                type="number"
                step={0.05}
                min={1.0}
                max={1.5}
                unit="x"
                value={settings.defaultSafetyFactor}
                onChange={(e) => handleChange('defaultSafetyFactor', parseFloat(e.target.value))}
                hint="Typically 1.05-1.15"
                disabled={!canManageSettings}
              />
              <Input
                label="Diversity Factor"
                type="number"
                step={0.05}
                min={0.5}
                max={1.0}
                unit="x"
                value={settings.defaultDiversityFactor}
                onChange={(e) => handleChange('defaultDiversityFactor', parseFloat(e.target.value))}
                hint="0.7-1.0 typical"
                disabled={!canManageSettings}
              />
            </div>
            <Input
              label="Default Ceiling Height (m)"
              type="number"
              step={0.1}
              min={2.2}
              max={6}
              unit="m"
              value={settings.defaultCeilingHeight}
              onChange={(e) => handleChange('defaultCeilingHeight', parseFloat(e.target.value))}
              disabled={!canManageSettings}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Lighting Density (W/m²)"
                type="number"
                step={1}
                min={5}
                max={40}
                unit="W/m²"
                value={settings.defaultLightingDensity}
                onChange={(e) => handleChange('defaultLightingDensity', parseFloat(e.target.value))}
                disabled={!canManageSettings}
              />
              <Input
                label="Equipment Load (W)"
                type="number"
                step={100}
                min={0}
                max={10000}
                unit="W"
                value={settings.defaultEquipmentLoad}
                onChange={(e) => handleChange('defaultEquipmentLoad', parseFloat(e.target.value))}
                disabled={!canManageSettings}
              />
            </div>
          </CardContent>
        </Card>

        {/* Cost Defaults */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PhilippinePeso className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Cost Defaults</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Labor Multiplier"
              type="number"
              step={0.05}
              min={0}
              max={1}
              unit="x"
              value={settings.laborMultiplier}
              onChange={(e) => handleChange('laborMultiplier', parseFloat(e.target.value))}
              hint="35% of material cost = 0.35"
              disabled={!canManageSettings}
            />
            <Input
              label="Overhead & Profit (%)"
              type="number"
              step={0.01}
              min={0}
              max={0.5}
              unit="ratio"
              value={settings.overheadPercent}
              onChange={(e) => handleChange('overheadPercent', parseFloat(e.target.value))}
              hint="15% = 0.15"
              disabled={!canManageSettings}
            />
            <Input
              label="VAT Rate"
              type="number"
              step={0.01}
              min={0}
              max={0.2}
              unit="ratio"
              value={settings.vatRate}
              onChange={(e) => handleChange('vatRate', parseFloat(e.target.value))}
              hint="12% Philippine VAT = 0.12"
              disabled={!canManageSettings}
            />
            <Input
              label="Contingency (%)"
              type="number"
              step={0.01}
              min={0}
              max={0.2}
              unit="ratio"
              value={settings.contingencyPercent}
              onChange={(e) => handleChange('contingencyPercent', parseFloat(e.target.value))}
              hint="5% = 0.05"
              disabled={!canManageSettings}
            />
            <Select
              label="Default Budget Level"
              value={settings.defaultBudgetLevel}
              onChange={(e) => handleChange('defaultBudgetLevel', e.target.value)}
              disabled={!canManageSettings}
              options={[
                { value: 'economy', label: 'Economy' },
                { value: 'mid-range', label: 'Mid-Range' },
                { value: 'premium', label: 'Premium' },
              ]}
            />
          </CardContent>
        </Card>

        {/* System */}
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle>System Preferences</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Select
                label="Temperature Unit"
                value={settings.temperatureUnit}
                onChange={(e) => handleChange('temperatureUnit', e.target.value)}
                disabled={!canManageSettings}
                options={[
                  { value: 'celsius', label: 'Celsius (°C)' },
                  { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
                ]}
              />
              <Select
                label="Area Unit"
                value={settings.areaUnit}
                onChange={(e) => handleChange('areaUnit', e.target.value)}
                disabled={!canManageSettings}
                options={[
                  { value: 'sqm', label: 'Square Meters (m²)' },
                  { value: 'sqft', label: 'Square Feet (ft²)' },
                ]}
              />
              <Select
                label="Length Unit"
                value={settings.lengthUnit}
                onChange={(e) => handleChange('lengthUnit', e.target.value)}
                disabled={!canManageSettings}
                options={[
                  { value: 'meters', label: 'Meters (m)' },
                  { value: 'feet', label: 'Feet (ft)' },
                ]}
              />
              <Input
                label="Currency Symbol"
                value={settings.currencySymbol}
                onChange={(e) => handleChange('currencySymbol', e.target.value)}
                disabled={!canManageSettings}
              />
            </div>
          </CardContent>
        </Card>

        {/* Unit Placement Rules */}
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-muted-foreground" />
                <CardTitle>Unit Placement Rules</CardTitle>
              </div>
              {canManageSettings && (
                <Button variant="secondary" size="sm" onClick={addPlacementRule}>
                  <Plus className="w-4 h-4 mr-1" /> Add Rule
                </Button>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Define which AC unit types should be placed in specific space types, with sizing limits and mounting preferences.</p>
          </CardHeader>
          <CardContent>
            {placementRules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No placement rules defined. Click &quot;Add Rule&quot; to create one.</p>
            ) : (
              <div className="space-y-4">
                {placementRules.map((rule) => (
                  <div key={rule.id} className="space-y-4 rounded-lg border border-border bg-background p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Rule #{rule.id}</span>
                      {canManageSettings && (
                        <Button variant="ghost" size="sm" onClick={() => removePlacementRule(rule.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                      <Select
                        label="Space Type"
                        value={rule.spaceType}
                        onChange={(e) => updatePlacementRule(rule.id, 'spaceType', e.target.value)}
                        disabled={!canManageSettings}
                        options={[
                          { value: 'office', label: 'Office' },
                          { value: 'conference_room', label: 'Conference' },
                          { value: 'lobby', label: 'Lobby' },
                          { value: 'retail', label: 'Retail' },
                          { value: 'restaurant', label: 'Restaurant' },
                          { value: 'kitchen', label: 'Kitchen' },
                          { value: 'server_room', label: 'Server Room' },
                          { value: 'residential', label: 'Residential' },
                          { value: 'classroom', label: 'Classroom' },
                          { value: 'hospital_ward', label: 'Hospital Ward' },
                          { value: 'gym', label: 'Gym' },
                          { value: 'warehouse', label: 'Warehouse' },
                        ]}
                      />
                      <Input
                        label="Max TR"
                        type="number"
                        step={0.5}
                        min={0.5}
                        max={50}
                        unit="TR"
                        value={rule.maxTR}
                        onChange={(e) => updatePlacementRule(rule.id, 'maxTR', e.target.value === '' ? '' : parseFloat(e.target.value) || rule.maxTR)}
                        onBlur={() => { if (!rule.maxTR) updatePlacementRule(rule.id, 'maxTR', 3); }}
                        disabled={!canManageSettings}
                      />
                      <Select
                        label="Preferred Unit"
                        value={rule.preferredUnit}
                        onChange={(e) => updatePlacementRule(rule.id, 'preferredUnit', e.target.value)}
                        disabled={!canManageSettings}
                        options={[
                          { value: 'wall_split', label: 'Wall Split' },
                          { value: 'ceiling_cassette', label: 'Ceiling Cassette' },
                          { value: 'ducted_split', label: 'Ducted Split' },
                          { value: 'floor_standing', label: 'Floor Standing' },
                          { value: 'vrf_indoor', label: 'VRF Indoor' },
                          { value: 'window_type', label: 'Window Type' },
                          { value: 'chilled_water_fcu', label: 'Chilled Water FCU' },
                          { value: 'ahu', label: 'AHU' },
                        ]}
                      />
                      <Input
                        label="Mount Height (m)"
                        type="number"
                        step={0.1}
                        min={0}
                        max={6}
                        unit="m"
                        value={rule.wallMountHeight}
                        onChange={(e) => updatePlacementRule(rule.id, 'wallMountHeight', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                        onBlur={() => { if ((rule.wallMountHeight as unknown) === '' || rule.wallMountHeight == null) updatePlacementRule(rule.id, 'wallMountHeight', 0); }}
                        disabled={!canManageSettings}
                      />
                      <Select
                        label="Outdoor Unit"
                        value={rule.outdoorPlacement}
                        onChange={(e) => updatePlacementRule(rule.id, 'outdoorPlacement', e.target.value)}
                        disabled={!canManageSettings}
                        options={[
                          { value: 'rooftop', label: 'Rooftop' },
                          { value: 'ground_level', label: 'Ground Level' },
                          { value: 'wall_bracket', label: 'Wall Bracket' },
                          { value: 'balcony', label: 'Balcony' },
                          { value: 'mechanical_room', label: 'Mechanical Room' },
                        ]}
                      />
                      <Input
                        label="Notes"
                        value={rule.notes}
                        onChange={(e) => updatePlacementRule(rule.id, 'notes', e.target.value)}
                        disabled={!canManageSettings}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border bg-background">
            {canManageSettings ? (
              <>
                <Button variant="ghost" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset to Defaults
                </Button>
                <Button variant="accent" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Viewing current standards in read-only mode.
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </PageWrapper>
  );
}
