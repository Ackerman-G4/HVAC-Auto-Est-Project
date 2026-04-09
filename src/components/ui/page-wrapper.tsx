'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { pageVariants } from '@/animations/page-transitions';
import { cn } from '@/lib/utils/cn';
import { useUIStore } from '@/stores/ui-store';

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn('w-full space-y-8', className)}
    >
      {children}
    </motion.div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  const workspaceMode = useUIStore((state) => state.workspaceMode);

  return (
    <div className="mb-12 lg:mb-14 animate-fade-rise">
      {breadcrumbs && (
        <nav className="mb-5 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-[color:var(--silver)]">/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="transition-colors hover:text-[color:var(--accent-dark)]">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-[color:var(--foreground)]">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="relative flex flex-col gap-7 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[linear-gradient(130deg,color-mix(in_oklab,var(--card)_94%,transparent),color-mix(in_oklab,var(--secondary)_58%,transparent))] px-6 py-6 shadow-[0_20px_34px_-28px_rgba(31,63,98,0.7)] sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(20,134,115,0.5),transparent)]" />
        <div>
          <h1 className="display-heading text-[2.25rem] font-black tracking-[-0.04em] text-[color:var(--foreground)] lg:text-[2.85rem]">{title}</h1>
          <div className="mt-3 inline-flex items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]/75 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
            {workspaceMode === 'beginner' ? 'Beginner Mode: Guided Inputs' : 'Professional Mode: Full Controls'}
          </div>
          {description && (
            <p className="mt-3 max-w-3xl text-[1.03rem] font-medium leading-relaxed text-[color:var(--muted-foreground)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-4">{actions}</div>}
      </div>
    </div>
  );
}
