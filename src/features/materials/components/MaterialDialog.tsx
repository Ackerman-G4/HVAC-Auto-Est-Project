'use client';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { MaterialFormState } from '../types';

interface MaterialDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  form: MaterialFormState;
  setForm: React.Dispatch<React.SetStateAction<MaterialFormState>>;
  submitting: boolean;
  supplierOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSubmit: () => void;
}

export function MaterialDialog({
  open,
  mode,
  form,
  setForm,
  submitting,
  supplierOptions,
  onClose,
  onSubmit,
}: MaterialDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Add Tool' : 'Edit Tool'}
      description="Maintain catalog pricing and supplier linkage for takeoff and costing workflows."
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Tool / Material Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            maxLength={120}
          />
          <Input
            label="Category"
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            maxLength={80}
            placeholder="Mechanical, Electrical, Piping, etc."
          />
          <Input
            label="Unit"
            value={form.unit}
            onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
            maxLength={24}
          />
          <Input
            label="Unit Price (PHP)"
            type="number"
            min={0}
            step={0.01}
            value={form.unitPricePHP}
            onChange={(event) => setForm((prev) => ({ ...prev, unitPricePHP: event.target.value }))}
            showRangeHint={false}
          />
          <Input
            label="Location"
            value={form.location}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            maxLength={200}
            placeholder="Warehouse or site location"
          />
        </div>

        <Select
          label="Linked Supplier"
          value={form.supplierId}
          onChange={(event) => setForm((prev) => ({ ...prev, supplierId: event.target.value }))}
          options={supplierOptions}
        />

        <Textarea
          label="Specification"
          value={form.specification}
          onChange={(event) => setForm((prev) => ({ ...prev, specification: event.target.value }))}
          maxLength={500}
          placeholder="Optional specification details"
        />

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="accent" onClick={onSubmit} isLoading={submitting}>
            {mode === 'create' ? 'Create Tool' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
