'use client';

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Info,
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
    <div className="flex items-center justify-between py-1.5 px-3 rounded hover:bg-secondary/30 transition-colors">
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
    <div className="border-b border-border/60 last:border-b-0 py-2">
      <h3 className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {section.title}
      </h3>
      <div>
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
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground display-heading">{title}</h2>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
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
        <div className="shrink-0 border-t border-border p-3">
          {footer}
        </div>
      )}
    </div>
  );
}
