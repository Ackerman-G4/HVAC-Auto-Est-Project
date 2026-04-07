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
      className={cn('w-full', className)}
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
    <div className="mb-10 lg:mb-12">
      {breadcrumbs && (
        <nav className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
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
      <div className="flex flex-col gap-6 rounded-2xl border border-transparent pb-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-[-0.03em] text-[color:var(--foreground)] lg:text-4xl">{title}</h1>
          <div className="mt-2 inline-flex items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            {workspaceMode === 'beginner' ? 'Beginner Mode: Guided Inputs' : 'Professional Mode: Full Controls'}
          </div>
          {description && (
            <p className="mt-2 max-w-3xl text-base font-medium text-[color:var(--muted-foreground)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
