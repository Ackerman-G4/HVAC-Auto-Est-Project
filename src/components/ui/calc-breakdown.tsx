'use client';

/**
 * CalcBreakdown (overhaul-v3 Phase 4.4) — "explain the numbers".
 * A small info affordance next to a computed figure that opens a read-only
 * breakdown of how it was derived: label → formula expression → result, taken
 * straight from the engine's own formula trace. Engines are unchanged; this is
 * a view over existing intermediates.
 */
import { useState } from 'react';
import { Info } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

export interface CalcFormulaRow {
  label: string;
  expression: string;
  value: string;
}

interface CalcBreakdownProps {
  title: string;
  formulas: CalcFormulaRow[];
  /** Optional plain-language note shown under the rows. */
  note?: string;
  /** Accessible label for the trigger; defaults to `Explain {title}`. */
  triggerLabel?: string;
}

export function CalcBreakdown({ title, formulas, note, triggerLabel }: CalcBreakdownProps) {
  const [open, setOpen] = useState(false);

  if (formulas.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel ?? `Explain ${title}`}
        title={triggerLabel ?? `Explain ${title}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Info size={13} aria-hidden="true" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={title} description="How this figure is derived" size="lg">
        <div className="space-y-3">
          {formulas.map((f) => (
            <div key={f.label} className="rounded-sm border border-border bg-secondary/60 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-foreground">{f.label}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{f.expression}</p>
              <p className="mt-1.5 text-xs font-semibold text-accent tabular-nums">{f.value}</p>
            </div>
          ))}
          {note && <p className="pt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
        </div>
      </Dialog>
    </>
  );
}
