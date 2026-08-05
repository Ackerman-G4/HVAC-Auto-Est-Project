'use client';

/**
 * WorkflowRail (overhaul-v3 Phase 4.2) — the golden path made visible.
 * A horizontal pipeline across the top of a project:
 *   Floorplan → Loads → Equipment → Ducting → BOQ → Quotation → Reports
 * Each stage shows live status and is a navigation target, so the user
 * always knows where they are and what comes next. Status is derived
 * from data the caller already has — this component computes nothing.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  PencilRuler,
  Calculator,
  Boxes,
  Fan,
  FileSpreadsheet,
  ReceiptText,
  FileText,
  Check,
  CircleDashed,
  CircleDot,
  TriangleAlert,
} from 'lucide-react';
import { microTransition, pageTransition, usePrefersReducedMotion } from '@/lib/ui/motion';
import { cn } from '@/lib/utils/cn';

export type StageStatus = 'not_started' | 'in_progress' | 'done' | 'stale';

export type WorkflowStageId =
  | 'floorplan'
  | 'loads'
  | 'equipment'
  | 'ducting'
  | 'boq'
  | 'quotation'
  | 'reports';

export interface WorkflowStageState {
  status: StageStatus;
  /** Optional one-line detail, e.g. "12 rooms traced" or "Loads changed after selection". */
  detail?: string;
}

interface WorkflowRailProps {
  projectId: string;
  stages: Partial<Record<WorkflowStageId, WorkflowStageState>>;
  /** Highlight the stage matching the current page. */
  activeStage?: WorkflowStageId;
  className?: string;
}

const STAGE_DEFS: Array<{
  id: WorkflowStageId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  href: (projectId: string) => string;
}> = [
  { id: 'floorplan', label: 'Floorplan', icon: PencilRuler, href: (id) => `/projects/${id}/floorplan` },
  { id: 'loads', label: 'Loads', icon: Calculator, href: () => '/load-calculation' },
  { id: 'equipment', label: 'Equipment', icon: Boxes, href: () => '/equipment-selection' },
  { id: 'ducting', label: 'Ducting', icon: Fan, href: () => '/airflow-duct-design' },
  { id: 'boq', label: 'BOQ', icon: FileSpreadsheet, href: (id) => `/projects/${id}` },
  { id: 'quotation', label: 'Quotation', icon: ReceiptText, href: () => '/quotation' },
  { id: 'reports', label: 'Reports', icon: FileText, href: () => '/reports' },
];

const STATUS_META: Record<
  StageStatus,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }
> = {
  not_started: {
    label: 'Not started',
    icon: CircleDashed,
    tone: 'text-muted-foreground/70',
  },
  in_progress: {
    label: 'In progress',
    icon: CircleDot,
    tone: 'text-primary',
  },
  done: {
    label: 'Done',
    icon: Check,
    tone: 'text-accent',
  },
  stale: {
    label: 'Needs re-run',
    icon: TriangleAlert,
    tone: 'text-warning',
  },
};

export function WorkflowRail({ projectId, stages, activeStage, className }: WorkflowRailProps) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();

  const doneCount = STAGE_DEFS.filter((s) => stages[s.id]?.status === 'done').length;
  const progressPct = Math.round((doneCount / STAGE_DEFS.length) * 100);

  return (
    <nav
      aria-label="Project workflow"
      className={cn(
        'panel-glass relative overflow-hidden rounded-lg border border-border/70 p-3',
        className,
      )}
    >
      {/* Progress track under the stages */}
      <div className="absolute inset-x-3 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-border/50" aria-hidden="true">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={reduced ? { duration: 0 } : pageTransition}
        />
      </div>

      <ol className="flex items-stretch gap-1.5 overflow-x-auto pb-2" role="list">
        {STAGE_DEFS.map((stage, index) => {
          const state = stages[stage.id] ?? { status: 'not_started' as const };
          const meta = STATUS_META[state.status];
          const StatusIcon = meta.icon;
          const StageIcon = stage.icon;
          const isActive = activeStage === stage.id;

          return (
            <li key={stage.id} className="flex min-w-0 flex-1 items-center" role="listitem">
              <motion.button
                type="button"
                onClick={() => router.push(stage.href(projectId))}
                whileTap={reduced ? undefined : { scale: 0.98 }}
                transition={microTransition}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`${stage.label}: ${meta.label}${state.detail ? ` — ${state.detail}` : ''}`}
                title={state.detail}
                className={cn(
                  'group flex w-full min-w-[6.5rem] flex-col gap-1.5 rounded-md border px-3 py-2.5 text-left transition-all duration-150',
                  isActive
                    ? 'border-accent/50 bg-accent/10 shadow-[0_6px_16px_color-mix(in_oklab,var(--accent)_18%,transparent)]'
                    : 'border-transparent hover:border-border/70 hover:bg-secondary/50',
                )}
              >
                <span className="flex items-center gap-2">
                  <StageIcon
                    size={15}
                    className={cn(
                      'shrink-0',
                      isActive ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  <span
                    className={cn(
                      'truncate text-xs font-semibold',
                      isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    {stage.label}
                  </span>
                </span>
                <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', meta.tone)}>
                  <StatusIcon size={12} className="shrink-0" />
                  <span className="truncate">{meta.label}</span>
                </span>
              </motion.button>

              {index < STAGE_DEFS.length - 1 && (
                <span
                  className="mx-0.5 h-px w-3 shrink-0 bg-border/70"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Derive stage states from commonly-available project data.
 * Pure function so it is trivially testable.
 */
export function deriveWorkflowStages(input: {
  roomCount: number;
  loadsCalculated: boolean;
  equipmentSelected: boolean;
  ductsSized: boolean;
  boqItemCount: number;
  quotationGenerated: boolean;
  reportsGenerated: boolean;
  /** Set when upstream data changed after a downstream stage last ran. */
  staleStages?: WorkflowStageId[];
}): Partial<Record<WorkflowStageId, WorkflowStageState>> {
  const stale = new Set(input.staleStages ?? []);
  const s = (id: WorkflowStageId, done: boolean, started: boolean, detail?: string): WorkflowStageState => ({
    status: stale.has(id) ? 'stale' : done ? 'done' : started ? 'in_progress' : 'not_started',
    detail,
  });

  return {
    floorplan: s(
      'floorplan',
      input.roomCount > 0,
      false,
      input.roomCount > 0 ? `${input.roomCount} room${input.roomCount === 1 ? '' : 's'} traced` : 'Trace rooms to begin',
    ),
    loads: s('loads', input.loadsCalculated, input.roomCount > 0),
    equipment: s('equipment', input.equipmentSelected, input.loadsCalculated),
    ducting: s('ducting', input.ductsSized, input.equipmentSelected),
    boq: s(
      'boq',
      input.boqItemCount > 0,
      input.equipmentSelected,
      input.boqItemCount > 0 ? `${input.boqItemCount} line items` : undefined,
    ),
    quotation: s('quotation', input.quotationGenerated, input.boqItemCount > 0),
    reports: s('reports', input.reportsGenerated, input.quotationGenerated),
  };
}
