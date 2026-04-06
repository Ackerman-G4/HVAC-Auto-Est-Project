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
      <div className="no-print flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-border/70 bg-[rgba(255,255,255,0.82)] p-1.5 shadow-[0_18px_30px_-24px_rgba(19,32,51,0.58)] backdrop-blur-md">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'group relative flex items-center gap-2.5 whitespace-nowrap rounded-xl border px-4 py-2.5 text-[13px] font-semibold tracking-[0.01em] transition-all duration-300 hover:-translate-y-px',
              activeTab === tab.id
                ? 'border-[rgba(15,139,141,0.34)] bg-[rgba(15,139,141,0.14)] text-[color:var(--accent-dark)] shadow-[0_12px_22px_-16px_rgba(15,139,141,0.95)]'
                : 'border-transparent text-[color:var(--muted-foreground)] hover:border-[color:var(--border)] hover:bg-secondary/85 hover:text-[color:var(--foreground)] hover:shadow-[0_12px_20px_-18px_rgba(19,32,51,0.74)]'
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
                'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                activeTab === tab.id
                  ? 'border-[rgba(15,139,141,0.32)] bg-[rgba(15,139,141,0.2)] text-[color:var(--accent-dark)]'
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
          className="pt-6"
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

