'use client';

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/* ─── Types ──────────────────────────────────────────────────────── */

export interface MetricDef {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  status?: 'ok' | 'warn' | 'critical';
  tooltip?: string;
}

export interface ResultSection {
  id: string;
  title: string;
  metrics: MetricDef[];
}

export interface ResultsPanelProps {
  /** Panel title */
  title: string;
  subtitle?: string;
  /** Sections of metrics / results */
  sections: ResultSection[];
  /** Alert / compliance badges */
  alerts?: { label: string; severity: 'ok' | 'warn' | 'critical' }[];
  /** Footer content (export buttons, etc.) */
  footer?: React.ReactNode;
}

/* ─── Metric Card ────────────────────────────────────────────────── */

function MetricRow({ metric }: { metric: MetricDef }) {
  const statusColor =
    metric.status === 'critical'
      ? 'text-destructive'
      : metric.status === 'warn'
        ? 'text-warning'
        : 'text-foreground';

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 transition-colors hover:bg-secondary/35">
      <span className="text-[11px] text-muted-foreground truncate mr-2">
        {metric.label}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <span className={`text-sm font-semibold tabular-nums ${statusColor}`}>
          {typeof metric.value === 'number' ? metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : metric.value}
        </span>
        {metric.unit && (
          <span className="text-[10px] text-muted-foreground">{metric.unit}</span>
        )}
        {metric.trend === 'up' && <TrendingUp size={12} className="text-success ml-1" />}
        {metric.trend === 'down' && <TrendingDown size={12} className="text-destructive ml-1" />}
      </div>
    </div>
  );
}

/* ─── Section ────────────────────────────────────────────────────── */

function ResultSectionBlock({ section }: { section: ResultSection }) {
  return (
    <div className="border-b border-border/70 px-3 py-3 last:border-b-0">
      <h3 className="px-1 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {section.title}
      </h3>
      <div className="space-y-1.5">
        {section.metrics.map((m) => (
          <MetricRow key={m.key} metric={m} />
        ))}
      </div>
    </div>
  );
}

/* ─── Alert Badge ────────────────────────────────────────────────── */

function AlertBadge({ label, severity }: { label: string; severity: 'ok' | 'warn' | 'critical' }) {
  const Icon = severity === 'ok' ? CheckCircle2 : severity === 'warn' ? AlertTriangle : AlertTriangle;
  const variant = severity === 'ok' ? 'success' : severity === 'warn' ? 'warning' : 'destructive';

  return (
    <Badge variant={variant as 'default'} className="gap-1 text-[10px]">
      <Icon size={10} />
      {label}
    </Badge>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */

export function ResultsPanel({
  title,
  subtitle,
  sections,
  alerts,
  footer,
}: ResultsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/70 bg-card/45 px-4 pb-3 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Output Deck</p>
        <h2 className="display-heading mt-1 text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}

        {/* Alerts */}
        {alerts && alerts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {alerts.map((a, i) => (
              <AlertBadge key={i} label={a.label} severity={a.severity} />
            ))}
          </div>
        )}
      </div>

      {/* Scrollable results */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <ResultSectionBlock key={section.id} section={section} />
        ))}
      </div>

      {/* Footer */}
      {footer && (
        <div className="shrink-0 border-t border-border/70 bg-card/45 p-3">
          {footer}
        </div>
      )}
    </div>
  );
}
