'use client';

import { Package, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DualValueExplainer } from '@/components/ui/dual-value-explainer';
import { TermHint } from '@/components/ui/term-hint';
import { formatPHP } from '@/lib/utils/format-currency';
import { parsePricingDraftValue } from '../helpers';
import type { EquipmentDraftState, ProjectData } from '../types';

interface EquipmentTabProps {
  project: ProjectData;
  equipmentDrafts: Record<string, EquipmentDraftState>;
  equipmentSavingId: string | null;
  autoSizing: boolean;
  equipmentCost: number;
  autoSizeEquipment: () => void;
  handleEquipmentDraftChange: (selectionId: string, field: keyof EquipmentDraftState, value: string) => void;
  handleEquipmentSave: (equipment: ProjectData['selectedEquipment'][number]) => void;
  handleEquipmentUseSuggested: (equipment: ProjectData['selectedEquipment'][number]) => void;
}

export function EquipmentTab({
  project,
  equipmentDrafts,
  equipmentSavingId,
  autoSizing,
  equipmentCost,
  autoSizeEquipment,
  handleEquipmentDraftChange,
  handleEquipmentSave,
  handleEquipmentUseSuggested,
}: EquipmentTabProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Selected Equipment</h3>

      </div>
      {project.selectedEquipment.length === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title="No equipment selected"
          description="Run auto-sizing to select equipment for all rooms"
          action={
            <Button variant="accent" size="sm" onClick={autoSizeEquipment} isLoading={autoSizing}>
              <Zap className="w-4 h-4 mr-1" /> Auto-Size
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand / Model</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capacity</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <TermHint
                    term="EER"
                    definition="Energy Efficiency Ratio. Higher EER indicates better efficiency at rated operating conditions."
                  />
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit Price</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {project.selectedEquipment.map((eq) => {
                const draft = equipmentDrafts[eq.id] ?? { quantity: '', unitPrice: '' };
                const quantityParsed = parsePricingDraftValue(draft.quantity);
                const unitPriceParsed = parsePricingDraftValue(draft.unitPrice);
                const hasInvalidQuantity =
                  quantityParsed.value !== null && !Number.isInteger(quantityParsed.value);
                const hasInvalid =
                  !quantityParsed.valid ||
                  !unitPriceParsed.valid ||
                  hasInvalidQuantity ||
                  (quantityParsed.value !== null && quantityParsed.value < 0) ||
                  (unitPriceParsed.value !== null && unitPriceParsed.value < 0);
                const isDirty =
                  quantityParsed.value !== (eq.userQuantityOverride ?? null) ||
                  unitPriceParsed.value !== (eq.userUnitPriceOverride ?? null);
                const isSaving = equipmentSavingId === eq.id;
                const previewQuantity =
                  quantityParsed.valid
                    ? (quantityParsed.value ?? (eq.suggestedQuantity ?? eq.quantity))
                    : eq.quantity;
                const previewUnitPrice =
                  unitPriceParsed.valid
                    ? (unitPriceParsed.value ?? (eq.suggestedUnitPrice ?? eq.unitPrice))
                    : eq.unitPrice;
                const previewTotal = previewQuantity * previewUnitPrice;

                return [
                  <tr key={`${eq.id}-main`} className="border-b border-border">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{eq.brand}</div>
                      <div className="text-sm text-muted-foreground">{eq.model}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge size="sm">{eq.type.replace(/_/g, ' ')}</Badge>
                      {eq.isInverter && <Badge size="sm" variant="success" className="ml-1">INV</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge size="sm" variant={eq.isOverridden ? 'accent' : 'secondary'}>
                        {eq.isOverridden ? 'Override' : 'Suggested'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">{eq.capacityTR.toFixed(1)} TR</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end">
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={draft.quantity}
                          onChange={(event) => handleEquipmentDraftChange(eq.id, 'quantity', event.target.value)}
                          placeholder={String(eq.suggestedQuantity ?? eq.quantity)}
                          className="w-20 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm"
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Suggested: {eq.suggestedQuantity ?? eq.quantity}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right">{eq.eer.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.unitPrice}
                          onChange={(event) => handleEquipmentDraftChange(eq.id, 'unitPrice', event.target.value)}
                          placeholder={String(eq.suggestedUnitPrice ?? eq.unitPrice)}
                          className="w-28 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm"
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Suggested: {formatPHP(eq.suggestedUnitPrice ?? eq.unitPrice)}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatPHP(previewTotal)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={isSaving}
                          disabled={isSaving || hasInvalid || !isDirty}
                          onClick={() => handleEquipmentSave(eq)}
                        >
                          Save
                        </Button>
                        {eq.isOverridden && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSaving}
                            onClick={() => handleEquipmentUseSuggested(eq)}
                          >
                            Use Suggested
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  <tr key={`${eq.id}-explain`} className="border-b border-border bg-secondary/20">
                    <td colSpan={9} className="px-4 pb-3 pt-2">
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <DualValueExplainer
                          compact
                          title="Quantity Decision"
                          suggested={eq.suggestedQuantity ?? eq.quantity}
                          override={eq.userQuantityOverride}
                          final={previewQuantity}
                          formula="Final quantity = override quantity when provided, otherwise suggested quantity."
                        />
                        <DualValueExplainer
                          compact
                          title="Unit Price Decision"
                          suggested={formatPHP(eq.suggestedUnitPrice ?? eq.unitPrice)}
                          override={
                            eq.userUnitPriceOverride !== null && eq.userUnitPriceOverride !== undefined
                              ? formatPHP(eq.userUnitPriceOverride)
                              : null
                          }
                          final={formatPHP(previewUnitPrice)}
                          formula="Final unit price = override price when provided, otherwise suggested catalog price."
                          note="Line total preview = final quantity × final unit price."
                        />
                      </div>
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={8} className="px-4 py-2.5 text-right">Equipment Subtotal:</td>
                <td className="px-4 py-2.5 text-right">{formatPHP(equipmentCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
