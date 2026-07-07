'use client';

/**
 * LoadBreakdownBar (plan §6.3) — a stacked horizontal bar of the cooling-load
 * components that assembles left-to-right on first calc. The single most
 * persuasive visual in a client demo: it shows where the heat comes from.
 * Respects prefers-reduced-motion (segments fade instead of growing).
 *
 * Generic over the data source: pass `segments` directly, or use one of the
 * adapter helpers ({@link coolingLoadSegments}) to build them from a result.
 */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { CoolingLoadResult } from '@/types/calculation';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/ui/motion';
import { cn } from '@/lib/utils/cn';

export interface LoadSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Build segments (Watts) from a CoolingLoadResult. */
export function coolingLoadSegments(r: CoolingLoadResult): LoadSegment[] {
  return [
    { key: 'wall', label: 'Walls', value: r.wallLoad, color: '#3b82f6' },
    { key: 'roof', label: 'Roof', value: r.roofLoad, color: '#6366f1' },
    { key: 'glassSolar', label: 'Solar (glass)', value: r.glassSolarLoad, color: '#f59e0b' },
    { key: 'glassCond', label: 'Glass cond.', value: r.glassConductionLoad, color: '#eab308' },
    { key: 'lighting', label: 'Lights', value: r.lightingLoad, color: '#fbbf24' },
    { key: 'people', label: 'People', value: r.peopleLoadSensible + r.peopleLoadLatent, color: '#10b981' },
    { key: 'equipment', label: 'Equipment', value: r.equipmentLoadSensible, color: '#14b8a6' },
    { key: 'ventilation', label: 'Ventilation', value: r.ventilationLoadSensible + r.ventilationLoadLatent, color: '#0ea5e9' },
    { key: 'infiltration', label: 'Infiltration', value: r.infiltrationLoadSensible + r.infiltrationLoadLatent, color: '#64748b' },
  ].filter((s) => s.value > 0);
}

const DEFAULT_PALETTE = [
  '#3b82f6', '#6366f1', '#f59e0b', '#eab308', '#fbbf24',
  '#10b981', '#14b8a6', '#0ea5e9', '#64748b', '#a855f7',
];

/** Build segments from plain label/value pairs, auto-assigning colors. */
export function segmentsFromEntries(entries: Array<{ label: string; value: number }>): LoadSegment[] {
  return entries
    .filter((e) => e.value > 0)
    .map((e, i) => ({ key: e.label, label: e.label, value: e.value, color: DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] }));
}

interface LoadBreakdownBarProps {
  segments: LoadSegment[];
  /** Unit suffix for absolute values (e.g. "BTU/h"); Watts auto-format to kW. */
  unit?: 'W' | string;
  totalLabel?: string;
  totalSuffix?: string;
  className?: string;
}

export default function LoadBreakdownBar({
  segments,
  unit = 'W',
  totalLabel = 'Total cooling load',
  totalSuffix,
  className,
}: LoadBreakdownBarProps) {
  const reduceMotion = useReducedMotion();
  const total = useMemo(() => segments.reduce((s, x) => s + x.value, 0), [segments]);

  if (total <= 0) {
    return <p className={cn('text-xs text-muted-foreground', className)}>No load components to display.</p>;
  }

  const fmt = (v: number) => {
    if (unit === 'W') return v >= 1000 ? `${(v / 1000).toFixed(2)} kW` : `${Math.round(v)} W`;
    return `${Math.round(v).toLocaleString()} ${unit}`;
  };
  const pct = (v: number) => (v / total) * 100;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-secondary" role="img" aria-label="Load component breakdown">
        {segments.map((seg, i) => (
          <motion.div
            key={seg.key}
            className="h-full"
            style={{ backgroundColor: seg.color }}
            title={`${seg.label}: ${fmt(seg.value)} (${pct(seg.value).toFixed(0)}%)`}
            initial={reduceMotion ? { opacity: 0, width: `${pct(seg.value)}%` } : { width: 0 }}
            animate={reduceMotion ? { opacity: 1, width: `${pct(seg.value)}%` } : { width: `${pct(seg.value)}%` }}
            transition={{
              duration: MOTION_DURATION.panel,
              ease: MOTION_EASE,
              delay: reduceMotion ? 0 : i * 0.04, // left-to-right assembly
            }}
          />
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        {segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="ml-auto font-mono tabular-nums">{pct(seg.value).toFixed(0)}%</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
        <span className="text-muted-foreground">{totalLabel}</span>
        <span className="font-mono font-semibold">
          {fmt(total)}{totalSuffix ? ` · ${totalSuffix}` : ''}
        </span>
      </div>
    </div>
  );
}
