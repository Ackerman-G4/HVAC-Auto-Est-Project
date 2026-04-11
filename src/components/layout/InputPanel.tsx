'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Thermometer,
  Wind,
  Cpu,
  Sliders,
  Building2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

/* ─── Types ──────────────────────────────────────────────────────── */

export interface InputSection {
  id: string;
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  fields: InputFieldDef[];
}

export interface InputFieldDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select' | 'toggle' | 'range';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  tooltip?: string;
}

export interface InputPanelProps {
  /** Panel title */
  title: string;
  subtitle?: string;
  /** Grouped sections of input fields */
  sections: InputSection[];
  /** Current values keyed by field key */
  values: Record<string, string | number | boolean>;
  /** Called when any field value changes */
  onChange: (key: string, value: string | number | boolean) => void;
  /** Run / Calculate / Apply button */
  onRun?: () => void;
  runLabel?: string;
  running?: boolean;
  /** Optional footer actions */
  footer?: React.ReactNode;
}

/* ─── Section Collapse ───────────────────────────────────────────── */

function Section({
  section,
  values,
  onChange,
}: {
  section: InputSection;
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  const [open, setOpen] = useState(section.defaultOpen ?? true);

  return (
    <div className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-secondary/55"
      >
        <span className="text-muted-foreground">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {section.icon && <span className="text-accent">{section.icon}</span>}
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {section.title}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-3">
              {section.fields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={onChange}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Field Row ──────────────────────────────────────────────────── */

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: InputFieldDef;
  value: string | number | boolean | undefined;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  if (field.type === 'select' && field.options) {
    return (
      <div>
        <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">
          {field.label}
        </label>
        <Select
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          options={field.options}
        />
      </div>
    );
  }

  if (field.type === 'toggle') {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
        <span className="text-[11px] font-medium text-muted-foreground">{field.label}</span>
        <button
          type="button"
          onClick={() => onChange(field.key, !value)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
            value ? 'border-accent/40 bg-accent' : 'border-border bg-muted/70'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
              value ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </label>
    );
  }

  if (field.type === 'range') {
    const numVal = typeof value === 'number' ? value : Number(value) || field.min || 0;
    return (
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[11px] font-medium text-muted-foreground">{field.label}</label>
          <span className="text-[11px] font-mono text-accent tabular-nums">
            {numVal}{field.unit ? ` ${field.unit}` : ''}
          </span>
        </div>
        <input
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          value={numVal}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
          aria-label={field.label}
          className="w-full h-1.5 rounded-full bg-secondary appearance-none accent-accent cursor-pointer"
        />
      </div>
    );
  }

  // Default: number or text
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">
        {field.label}
        {field.unit && (
          <span className="ml-1 text-[10px] text-muted-foreground/70">({field.unit})</span>
        )}
      </label>
      <Input
        type={field.type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(e) =>
          onChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)
        }
        min={field.min}
        max={field.max}
        step={field.step}
      />
    </div>
  );
}

/* ─── Panel Icon map (convenience) ───────────────────────────────── */

export const SECTION_ICONS = {
  thermal: <Thermometer size={14} />,
  airflow: <Wind size={14} />,
  equipment: <Cpu size={14} />,
  overrides: <Sliders size={14} />,
  building: <Building2 size={14} />,
} as const;

/* ─── Main Component ─────────────────────────────────────────────── */

export function InputPanel({
  title,
  subtitle,
  sections,
  values,
  onChange,
  onRun,
  runLabel = 'Calculate',
  running = false,
  footer,
}: InputPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/70 bg-card/45 px-4 pb-3 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Input Deck</p>
        <h2 className="display-heading mt-1 text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <Section
            key={section.id}
            section={section}
            values={values}
            onChange={onChange}
          />
        ))}
      </div>

      {/* Footer / Run button */}
      <div className="shrink-0 space-y-2 border-t border-border/70 bg-card/45 p-3">
        {onRun && (
          <Button
            variant="accent"
            className="w-full"
            onClick={onRun}
            disabled={running}
          >
            {running ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Running…
              </span>
            ) : (
              runLabel
            )}
          </Button>
        )}
        {footer}
      </div>
    </div>
  );
}
