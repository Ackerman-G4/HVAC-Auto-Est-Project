'use client';

import { FileText, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DualValueExplainer } from '@/components/ui/dual-value-explainer';
import { formatPHP } from '@/lib/utils/format-currency';
import type { BoqVerification, PricingDraftState, ProjectData } from '../types';

interface BoqTabProps {
  project: ProjectData;
  boqVerification: BoqVerification | null;
  boqVerified: boolean;
  boqTampered: boolean;
  boqTotal: number;
  boqDraftPrices: Record<string, string>;
  boqSavingItemId: string | null;
  generatingBOQ: boolean;
  pricingDraft: PricingDraftState;
  pricingFinal: {
    laborMultiplier: number;
    overheadPercent: number;
    contingencyPercent: number;
    vatRate: number;
  };
  pricingSaving: boolean;
  pricingHasInvalidInput: boolean;
  pricingHasChanges: boolean;
  handlePricingDraftChange: (field: keyof PricingDraftState, value: string) => void;
  handlePricingResetDraft: () => void;
  handlePricingSave: () => void;
  generateBOQ: () => void;
  handleBoqDraftChange: (itemId: string, value: string) => void;
  handleBoqItemSave: (item: ProjectData['boqItems'][number]) => void;
  handleBoqUseSuggested: (item: ProjectData['boqItems'][number]) => void;
}

export function BoqTab({
  project,
  boqVerification,
  boqVerified,
  boqTampered,
  boqTotal,
  boqDraftPrices,
  boqSavingItemId,
  generatingBOQ,
  pricingDraft,
  pricingFinal,
  pricingSaving,
  pricingHasInvalidInput,
  pricingHasChanges,
  handlePricingDraftChange,
  handlePricingResetDraft,
  handlePricingSave,
  generateBOQ,
  handleBoqDraftChange,
  handleBoqItemSave,
  handleBoqUseSuggested,
}: BoqTabProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Bill of Quantities</h3>

        <div className="flex items-center gap-2">
          {boqTampered ? (
            <Badge variant="destructive" size="sm">
              <AlertTriangle className="mr-1 h-3 w-3" /> Integrity check failed
            </Badge>
          ) : boqVerified ? (
            <Badge
              variant="success"
              size="sm"
              title={boqVerification?.lockedAt ? `Locked ${new Date(boqVerification.lockedAt).toLocaleString()}` : undefined}
            >
              <ShieldCheck className="mr-1 h-3 w-3" /> Verified
            </Badge>
          ) : boqVerification?.status === 'empty' || project.boqItems.length === 0 ? (
            <Badge variant="outline" size="sm">No BOQ yet</Badge>
          ) : (
            <Badge variant="warning" size="sm">Outdated — recalculate</Badge>
          )}
        </div>
      </div>

      <Card className="panel-glass mb-4 border border-border/70 bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pricing Policy Overrides</CardTitle>
          <CardDescription>
            Suggested values are system defaults. Enter an override to force a final value, or leave blank to use suggested.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Labor Multiplier</p>
            <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedLaborMultiplier ?? 1}</p>
            <input
              type="number"
              min={0}
              step="0.01"
              value={pricingDraft.laborMultiplier}
              onChange={(event) => handlePricingDraftChange('laborMultiplier', event.target.value)}
              placeholder="Use suggested"
              className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.laborMultiplier}</p>
          </div>

          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Overhead %</p>
            <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedOverheadPercent ?? 12}%</p>
            <input
              type="number"
              min={0}
              step="0.01"
              value={pricingDraft.overheadPercent}
              onChange={(event) => handlePricingDraftChange('overheadPercent', event.target.value)}
              placeholder="Use suggested"
              className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.overheadPercent}%</p>
          </div>

          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Contingency %</p>
            <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedContingencyPercent ?? 8}%</p>
            <input
              type="number"
              min={0}
              step="0.01"
              value={pricingDraft.contingencyPercent}
              onChange={(event) => handlePricingDraftChange('contingencyPercent', event.target.value)}
              placeholder="Use suggested"
              className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.contingencyPercent}%</p>
          </div>

          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">VAT %</p>
            <p className="mt-1 text-xs text-muted-foreground">Suggested: {project.suggestedVatRate ?? 12}%</p>
            <input
              type="number"
              min={0}
              step="0.01"
              value={pricingDraft.vatRate}
              onChange={(event) => handlePricingDraftChange('vatRate', event.target.value)}
              placeholder="Use suggested"
              className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <p className="mt-2 text-sm text-muted-foreground">Final: {pricingFinal.vatRate}%</p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={pricingSaving} onClick={handlePricingResetDraft}>
            Use Suggested Values
          </Button>
          <Button
            variant="accent"
            size="sm"
            isLoading={pricingSaving}
            disabled={pricingSaving || pricingHasInvalidInput || !pricingHasChanges}
            onClick={handlePricingSave}
          >
            Save Pricing Overrides
          </Button>
        </CardFooter>
      </Card>

      {project.boqItems.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="No BOQ generated"
          description="Select equipment first, then generate the Bill of Quantities"
          action={
            <Button variant="accent" size="sm" onClick={generateBOQ} isLoading={generatingBOQ}>
              {project.isBoqStale ? 'Regenerate BOQ' : 'Generate BOQ'}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Section</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit Price</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {project.boqItems.map((item) => {
                const draftValue = boqDraftPrices[item.id] ?? String(item.unitPrice);
                const parsedDraft = parseFloat(draftValue);
                const isDirty = Number.isFinite(parsedDraft) && Math.abs(parsedDraft - item.unitPrice) > 0.0001;
                const isSaving = boqSavingItemId === item.id;
                const suggestedUnitPrice = item.suggestedUnitPrice ?? item.unitPrice;
                const finalUnitPrice = item.finalUnitPrice ?? item.unitPrice;
                const suggestedTotalPrice = item.suggestedTotalPrice ?? suggestedUnitPrice * item.quantity;
                const finalTotalPrice = item.finalTotalPrice ?? item.totalPrice;

                return [
                  <tr key={`${item.id}-main`} className="border-b border-border">
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{item.section}</td>
                    <td className="px-4 py-2.5">{item.description}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        size="sm"
                        variant={item.isOverridden ? 'accent' : 'secondary'}
                      >
                        {item.isOverridden ? 'Override' : 'Suggested'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right">{item.unit}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draftValue}
                          onChange={(event) => handleBoqDraftChange(item.id, event.target.value)}
                          aria-label="Unit price"
                          className="w-28 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm"
                        />
                      </div>
                      {item.suggestedUnitPrice !== undefined && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Suggested: {formatPHP(item.suggestedUnitPrice)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatPHP(item.totalPrice)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isSaving || !isDirty}
                          isLoading={isSaving}
                          onClick={() => handleBoqItemSave(item)}
                        >
                          Save
                        </Button>
                        {item.isOverridden && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSaving}
                            onClick={() => handleBoqUseSuggested(item)}
                          >
                            Use Suggested
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  <tr key={`${item.id}-explain`} className="border-b border-border bg-secondary/20">
                    <td colSpan={8} className="px-4 pb-3 pt-2">
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <DualValueExplainer
                          compact
                          title="Unit Price Decision"
                          suggested={formatPHP(suggestedUnitPrice)}
                          override={
                            item.userUnitPriceOverride !== null && item.userUnitPriceOverride !== undefined
                              ? formatPHP(item.userUnitPriceOverride)
                              : null
                          }
                          final={formatPHP(finalUnitPrice)}
                          formula="Final unit price = override when provided, otherwise suggested unit price."
                        />
                        <DualValueExplainer
                          compact
                          title="Total Price Decision"
                          suggested={formatPHP(suggestedTotalPrice)}
                          override={
                            item.userTotalPriceOverride !== null && item.userTotalPriceOverride !== undefined
                              ? formatPHP(item.userTotalPriceOverride)
                              : null
                          }
                          final={formatPHP(finalTotalPrice)}
                          formula="Final total price is quantity × final unit price; override fields track source state."
                        />
                      </div>
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold text-lg">
                <td colSpan={7} className="px-4 py-3 text-right">Grand Total:</td>
                <td className="px-4 py-3 text-right">{formatPHP(boqTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
