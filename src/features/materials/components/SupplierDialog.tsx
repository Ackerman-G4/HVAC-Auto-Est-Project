'use client';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import type { SupplierFormState } from '../types';

interface SupplierDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  form: SupplierFormState;
  setForm: React.Dispatch<React.SetStateAction<SupplierFormState>>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export function SupplierDialog({
  open,
  mode,
  form,
  setForm,
  submitting,
  onClose,
  onSubmit,
}: SupplierDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Add Supplier' : 'Edit Supplier'}
      description="Maintain supplier contacts and category coverage for procurement planning."
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Supplier Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            maxLength={120}
          />
          <Input
            label="Type"
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            maxLength={80}
          />
          <Input
            label="Location"
            value={form.location}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            maxLength={200}
          />
          <Input
            label="Website"
            value={form.website}
            onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))}
            maxLength={300}
            placeholder="example.com"
          />
        </div>

        <Textarea
          label="Contact Information"
          value={form.contactInfo}
          onChange={(event) => setForm((prev) => ({ ...prev, contactInfo: event.target.value }))}
          maxLength={500}
          placeholder="Phone numbers, emails, and points of contact"
        />

        <Input
          label="Coverage Area"
          value={form.coverageArea}
          onChange={(event) => setForm((prev) => ({ ...prev, coverageArea: event.target.value }))}
          maxLength={300}
          placeholder="NCR, Central Luzon, CALABARZON"
        />

        <Input
          label="Categories"
          value={form.categories}
          onChange={(event) => setForm((prev) => ({ ...prev, categories: event.target.value }))}
          maxLength={500}
          placeholder="ducting, refrigerant, controls"
          hint="Comma-separated values"
        />

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="accent" onClick={onSubmit} isLoading={submitting}>
            {mode === 'create' ? 'Create Supplier' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
