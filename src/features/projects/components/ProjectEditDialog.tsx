'use client';

import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { psychrometricState } from '@/lib/functions/psychrometric';
import type { ProjectListItem } from '../types';

interface ProjectEditDialogProps {
  editTarget: ProjectListItem | null;
  setEditTarget: (project: ProjectListItem | null) => void;
  editForm: Record<string, string | number>;
  editSaving: boolean;
  cityOptions: { value: string; label: string }[];
  handleEditChange: (field: string, value: string | number) => void;
  handleEditNumChange: (field: string, raw: string) => void;
  handleEditNumBlur: (field: string, fallback: number) => void;
  handleEditSave: () => void;
}

/**
 * The project edit dialog, lifted verbatim out of projects/page.tsx.
 *
 * Moved by line range rather than retyped: it is 200 lines of form JSX with
 * per-field blur coercion, and re-deriving that by hand is how subtle input
 * regressions get introduced.
 */
export function ProjectEditDialog({
  editTarget,
  setEditTarget,
  editForm,
  editSaving,
  cityOptions,
  handleEditChange,
  handleEditNumChange,
  handleEditNumBlur,
  handleEditSave,
}: ProjectEditDialogProps) {
  return (
    <Dialog
      open={!!editTarget}
      onClose={() => setEditTarget(null)}
      title="Edit Project"
      description="Update project details, design conditions, and calculation parameters."
      size="xl"
    >
      <div className="mb-5 rounded-md border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
        Changes here tune psychrometric assumptions and project metadata used by downstream room loads, equipment sizing, and BOQ generation.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Project Details */}
        <div className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold font-display text-foreground">Project Details</h3>
          <Input
            label="Project Name *"
            placeholder="e.g., ABC Office Tower HVAC"
            value={editForm.name}
            onChange={(e) => handleEditChange('name', e.target.value)}
          />
          <Input
            label="Client Name"
            placeholder="e.g., ABC Corporation"
            value={editForm.clientName}
            onChange={(e) => handleEditChange('clientName', e.target.value)}
          />
          <Select
            label="Building Type"
            value={editForm.buildingType}
            onChange={(e) => handleEditChange('buildingType', e.target.value)}
            options={[
              { value: 'commercial', label: 'Commercial' },
              { value: 'residential', label: 'Residential' },
              { value: 'industrial', label: 'Industrial' },
              { value: 'institutional', label: 'Institutional' },
              { value: 'healthcare', label: 'Healthcare' },
              { value: 'hospitality', label: 'Hospitality' },
              { value: 'retail', label: 'Retail' },
              { value: 'mixed_use', label: 'Mixed Use' },
            ]}
          />
          <Input
            label="Location / Address"
            placeholder="e.g., Makati CBD"
            value={editForm.location}
            onChange={(e) => handleEditChange('location', e.target.value)}
          />
          <Select
            label="City"
            value={editForm.city}
            onChange={(e) => handleEditChange('city', e.target.value)}
            options={cityOptions.map((c) => ({ value: c.value, label: c.label }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Floors Above Grade"
              type="number"
              min={1}
              value={editForm.floorsAboveGrade}
              onChange={(e) => handleEditNumChange('floorsAboveGrade', e.target.value)}
              onBlur={() => handleEditNumBlur('floorsAboveGrade', 1)}
            />
            <Input
              label="Floors Below Grade"
              type="number"
              min={0}
              value={editForm.floorsBelowGrade}
              onChange={(e) => handleEditNumChange('floorsBelowGrade', e.target.value)}
              onBlur={() => handleEditNumBlur('floorsBelowGrade', 0)}
            />
          </div>
          <Input
            label="Total Floor Area (sqm)"
            type="number"
            min={0}
            value={editForm.totalFloorArea}
            onChange={(e) => handleEditNumChange('totalFloorArea', e.target.value)}
            onBlur={() => handleEditNumBlur('totalFloorArea', 0)}
          />
        </div>

        {/* Right Column: Design Conditions & Parameters */}
        <div className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold font-display text-foreground">Design Conditions</h3>
          <div className="rounded-sm border border-border bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">
              Carrier Psychrometric Chart — WB, dew point, humidity ratio, and enthalpy are auto-computed from DB & RH.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Outdoor Dry Bulb (°C)"
              type="number"
              step={0.1}
              value={editForm.outdoorDB}
              onChange={(e) => handleEditNumChange('outdoorDB', e.target.value)}
              onBlur={() => handleEditNumBlur('outdoorDB', 35)}
            />
            <Input
              label="Outdoor RH (%)"
              type="number"
              step={1}
              min={10}
              max={100}
              value={editForm.outdoorRH}
              onChange={(e) => handleEditNumChange('outdoorRH', e.target.value)}
              onBlur={() => handleEditNumBlur('outdoorRH', 50)}
            />
          </div>
          {/* Psychrometric Summary — auto-computed */}
          {(() => {
            const ps = psychrometricState(Number(editForm.outdoorDB) || 35, Number(editForm.outdoorRH) || 50);
            return (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-sm border border-border bg-background px-1 py-1.5 shadow-sm">
                  <p className="text-sm font-semibold tabular-nums">{ps.wetBulb}°C</p>
                  <p className="text-[9px] font-display text-muted-foreground">Wet Bulb</p>
                </div>
                <div className="rounded-sm border border-border bg-background px-1 py-1.5 shadow-sm">
                  <p className="text-sm font-semibold tabular-nums">{ps.dewPoint}°C</p>
                  <p className="text-[9px] font-display text-muted-foreground">Dew Point</p>
                </div>
                <div className="rounded-sm border border-border bg-background px-1 py-1.5 shadow-sm">
                  <p className="text-sm font-semibold tabular-nums">{(ps.humidityRatio * 1000).toFixed(1)} g/kg</p>
                  <p className="text-[9px] font-display text-muted-foreground">Humidity Ratio</p>
                </div>
                <div className="rounded-sm border border-border bg-background px-1 py-1.5 shadow-sm">
                  <p className="text-sm font-semibold tabular-nums">{ps.enthalpy} kJ/kg</p>
                  <p className="text-[9px] font-display text-muted-foreground">Enthalpy</p>
                </div>
                <div className="rounded-sm border border-border bg-background px-1 py-1.5 shadow-sm">
                  <p className="text-sm font-semibold tabular-nums">{ps.specificVolume} m³/kg</p>
                  <p className="text-[9px] font-display text-muted-foreground">Sp. Volume</p>
                </div>
                <div className="rounded-sm border border-border bg-background px-1 py-1.5 shadow-sm">
                  <p className="text-sm font-semibold tabular-nums">{ps.density} kg/m³</p>
                  <p className="text-[9px] font-display text-muted-foreground">Density</p>
                </div>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Indoor Dry Bulb (°C)"
              type="number"
              step={0.1}
              value={editForm.indoorDB}
              onChange={(e) => handleEditNumChange('indoorDB', e.target.value)}
              onBlur={() => handleEditNumBlur('indoorDB', 24)}
            />
            <Input
              label="Indoor RH (%)"
              type="number"
              step={1}
              min={30}
              max={70}
              value={editForm.indoorRH}
              onChange={(e) => handleEditNumChange('indoorRH', e.target.value)}
              onBlur={() => handleEditNumBlur('indoorRH', 50)}
            />
          </div>

          <h3 className="pt-2 text-sm font-semibold font-display text-foreground">Calculation Parameters</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Safety Factor"
              type="number"
              step={0.05}
              min={1}
              max={2}
              value={editForm.safetyFactor}
              onChange={(e) => handleEditNumChange('safetyFactor', e.target.value)}
              onBlur={() => handleEditNumBlur('safetyFactor', 1.1)}
            />
            <Input
              label="Diversity Factor"
              type="number"
              step={0.05}
              min={0.5}
              max={1}
              value={editForm.diversityFactor}
              onChange={(e) => handleEditNumChange('diversityFactor', e.target.value)}
              onBlur={() => handleEditNumBlur('diversityFactor', 0.85)}
            />
          </div>
          <Input
            label="Notes"
            placeholder="Additional project notes..."
            value={editForm.notes}
            onChange={(e) => handleEditChange('notes', e.target.value)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex justify-end gap-3 border-t border-border bg-card pt-5">
        <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)}>
          Cancel
        </Button>
        <Button variant="accent" size="sm" onClick={handleEditSave} isLoading={editSaving}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </Dialog>
  );
}
