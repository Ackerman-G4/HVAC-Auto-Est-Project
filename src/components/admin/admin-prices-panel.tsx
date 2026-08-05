'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw, Search, Pencil } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { showToast } from '@/components/ui/toast';
import { formatPHP } from '@/lib/utils/format-currency';

interface PriceRow {
  manufacturer: string;
  model: string;
  type: string;
  capacityTR: number;
  catalogPricePhp: number;
  overridePricePhp: number | null;
  effectivePricePhp: number;
  justification: string | null;
  setBy: string | null;
  updatedAt: string | null;
}

const MIN_JUSTIFICATION = 20;

export function AdminPricesPanel() {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [editing, setEditing] = useState<PriceRow | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState<PriceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/prices');
      if (!res.ok) throw new Error('Failed to load prices');
      const data = await res.json();
      setRows((data.prices as PriceRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.model.toLowerCase().includes(needle) || r.manufacturer.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const openEdit = (row: PriceRow) => {
    setEditing(row);
    setPriceInput(String(row.overridePricePhp ?? row.catalogPricePhp));
    setJustification('');
  };

  const capBand = editing
    ? {
        min: Math.round(editing.catalogPricePhp * 0.5),
        max: Math.round(editing.catalogPricePhp * 1.5),
      }
    : null;

  const justificationValid = justification.trim().length >= MIN_JUSTIFICATION;
  const priceValue = Number(priceInput);
  const priceValid = Number.isFinite(priceValue) && priceValue > 0;

  const submitOverride = async () => {
    if (!editing || !priceValid || !justificationValid) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/admin/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: editing.model,
          overridePricePhp: priceValue,
          justification: justification.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('error', 'Override rejected', data.description || data.error || 'Request failed');
        return;
      }
      showToast('success', 'Price override saved', `${editing.model} updated.`);
      setEditing(null);
      await load();
    } catch {
      showToast('error', 'Override failed', 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmClear = async () => {
    if (!clearing) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/admin/prices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: clearing.model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('error', 'Clear failed', data.description || data.error || 'Request failed');
        return;
      }
      showToast('success', 'Override cleared', `${clearing.model} reverted to catalog price.`);
      setClearing(null);
      await load();
    } catch {
      showToast('error', 'Clear failed', 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <TableSkeleton rows={8} cols={6} />;

  if (error) {
    return (
      <EmptyState
        icon={<Coins size={28} />}
        title="Could not load prices"
        description={error}
        action={
          <Button onClick={load} variant="outline">
            <RefreshCw size={16} /> Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search equipment"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            showRangeHint={false}
          />
        </div>
        <p className="text-xs text-muted-foreground">Overrides are capped at ±50% of catalog price.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs font-display text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Manufacturer</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold">TR</th>
                  <th className="px-4 py-3 font-semibold">Catalog</th>
                  <th className="px-4 py-3 font-semibold">Override</th>
                  <th className="px-4 py-3 font-semibold">Effective</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((row) => (
                  <tr key={row.model} className="transition-colors hover:bg-secondary/40">
                    <td className="px-4 py-3 text-muted-foreground">{row.manufacturer}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.model}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{row.capacityTR}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatPHP(row.catalogPricePhp)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.overridePricePhp !== null ? (
                        <Badge variant="warning" size="sm">
                          {formatPHP(row.overridePricePhp)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-warning">
                      {formatPHP(row.effectivePricePhp)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                          <Pencil size={14} /> Override
                        </Button>
                        {row.overridePricePhp !== null && (
                          <Button variant="ghost" size="sm" onClick={() => setClearing(row)}>
                            Clear
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No equipment matches your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Override price — ${editing.model}` : ''}
        description={
          capBand
            ? `Allowed range: ${formatPHP(capBand.min)} to ${formatPHP(capBand.max)}`
            : undefined
        }
      >
        <div className="space-y-4">
          <Input
            label="Override price (PHP)"
            type="number"
            min={capBand?.min}
            max={capBand?.max}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            prefix="₱"
          />
          <div>
            <Textarea
              label="Justification"
              placeholder="Explain why this price is being overridden (min 20 characters)"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {justification.trim().length}/{MIN_JUSTIFICATION} characters minimum
            </p>
          </div>
          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submitOverride}
              disabled={!priceValid || !justificationValid || submitting}
              isLoading={submitting}
            >
              Save Override
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={clearing !== null}
        onClose={() => setClearing(null)}
        onConfirm={confirmClear}
        title="Clear price override"
        description={
          clearing
            ? `Revert ${clearing.model} to its catalog price of ${formatPHP(clearing.catalogPricePhp)}?`
            : ''
        }
        confirmText="Clear override"
        variant="destructive"
        isLoading={submitting}
      />
    </div>
  );
}
