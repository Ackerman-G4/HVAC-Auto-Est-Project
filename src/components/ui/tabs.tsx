'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { tabContentVariants } from '@/animations/shared';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, children, className }: TabsProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="no-print flex w-fit max-w-full gap-2 overflow-x-auto rounded-2xl border border-[color:var(--border)] bg-[linear-gradient(125deg,color-mix(in_oklab,var(--card)_92%,transparent),color-mix(in_oklab,var(--secondary)_58%,transparent))] p-2 shadow-[0_18px_30px_-24px_rgba(31,63,98,0.6)] backdrop-blur-md">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'group relative flex items-center gap-3 whitespace-nowrap rounded-xl border px-5 py-3 text-sm font-semibold tracking-[0.01em] transition-all duration-300 hover:-translate-y-px',
              activeTab === tab.id
                ? 'border-[rgba(20,134,115,0.36)] bg-[linear-gradient(125deg,rgba(20,134,115,0.16),rgba(31,63,98,0.08))] text-[color:var(--accent-dark)] shadow-[0_14px_24px_-16px_rgba(20,134,115,0.9)]'
                : 'border-transparent text-[color:var(--muted-foreground)] hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)]/84 hover:text-[color:var(--foreground)] hover:shadow-[0_12px_20px_-18px_rgba(31,63,98,0.74)]'
            )}
          >
            {tab.icon && (
              <span
                className={cn(
                  'transition-colors',
                  activeTab === tab.id
                    ? 'text-[color:var(--accent)]'
                    : 'text-[color:var(--silver)] group-hover:text-[color:var(--accent)]'
                )}
              >
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-bold',
                activeTab === tab.id
                  ? 'border-[rgba(20,134,115,0.32)] bg-[rgba(20,134,115,0.18)] text-[color:var(--accent-dark)]'
                  : 'border-border/55 bg-[color:var(--secondary)] text-[color:var(--muted-foreground)]'
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          variants={tabContentVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="pt-8"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Simple TabPanel wrapper
interface TabPanelProps {
  tabId: string;
  activeTab: string;
  children: React.ReactNode;
}

export function TabPanel({ tabId, activeTab, children }: TabPanelProps) {
  if (tabId !== activeTab) return null;
  return <>{children}</>;
}

