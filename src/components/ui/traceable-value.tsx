'use client';

import React, { useId, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A computed figure you can interrogate.
 *
 * Estimators defend their numbers to clients and bid committees, so "where did
 * this come from" is the question they get asked most. A traceable figure
 * carries a jade hairline underline — the app's one distinguishing mark,
 * deliberately used for nothing else — and reveals the inputs, method and
 * assumptions that produced it on hover or focus.
 *
 * Keyboard and pointer are equal citizens here: the trigger is a real
 * `<button>`, so the card opens on focus and closes on Escape. A hover-only
 * disclosure would put the derivation out of reach of anyone not using a mouse,
 * which for an audit trail is not acceptable.
 *
 * `TermHint` (a definition tooltip) and `DualValueExplainer` (a two-value
 * comparison) are the half-built ancestors of this idea and still have call
 * sites; this supersedes both, and they can be migrated onto it.
 */

export interface DerivationInput {
  label: string;
  value: string;
}

export interface TraceableValueProps {
  /** The figure itself, already formatted (e.g. "12,480" or "₱1,204,000"). */
  children: React.ReactNode;
  /** How it was produced, e.g. "ASHRAE RTS, 3% safety factor applied". */
  method: string;
  /** The inputs it was computed from. */
  inputs?: DerivationInput[];
  /** Assumptions in force, e.g. "Occupancy 0.1 person/m²". */
  assumptions?: string[];
  /** Unit rendered after the value, outside the underline. */
  unit?: string;
  className?: string;
}

export function TraceableValue({
  children,
  method,
  inputs,
  assumptions,
  unit,
  className,
}: TraceableValueProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const cardId = `derivation-${useId()}`;

  const show = open || pinned;

  return (
    <span className={cn('relative inline-flex items-baseline gap-1', className)}>
      <button
        type="button"
        aria-expanded={show}
        aria-controls={show ? cardId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setPinned((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && (open || pinned)) {
            // Stop here so Escape does not also close a dialog this sits inside.
            e.stopPropagation();
            setOpen(false);
            setPinned(false);
          }
        }}
        className={cn(
          'tabular-nums decoration-[color:var(--accent)] underline-offset-4',
          'underline decoration-1',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:rounded-sm',
          pinned && 'decoration-2',
        )}
      >
        {children}
      </button>
      {unit ? <span className="text-muted-foreground">{unit}</span> : null}

      {show ? (
        <span
          id={cardId}
          role="tooltip"
          className={cn(
            'absolute left-0 top-full z-30 mt-1.5 w-64 rounded-md p-3 text-left',
            'overlay-glass',
          )}
        >
          <span className="block text-[11px] font-medium font-display text-muted-foreground">
            Derivation
          </span>

          {inputs?.length ? (
            <span className="mt-1.5 block space-y-0.5">
              {inputs.map((i) => (
                <span key={i.label} className="flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{i.label}</span>
                  <span className="tabular-nums text-foreground">{i.value}</span>
                </span>
              ))}
            </span>
          ) : null}

          <span className="mt-2 block border-t border-border pt-2 text-xs text-foreground">
            {method}
          </span>

          {assumptions?.length ? (
            <span className="mt-2 block space-y-0.5">
              {assumptions.map((a) => (
                <span key={a} className="block text-[11px] text-muted-foreground">
                  {a}
                </span>
              ))}
            </span>
          ) : null}

          <span className="mt-2 block text-[10px] text-muted-foreground/70">
            {pinned ? 'Click to unpin' : 'Click to pin'}
          </span>
        </span>
      ) : null}
    </span>
  );
}
