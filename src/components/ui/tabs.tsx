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
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;
    else return;
    e.preventDefault();
    onTabChange(tabs[nextIdx].id);
    (e.currentTarget.parentElement?.children[nextIdx] as HTMLElement)?.focus();
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="no-print flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-secondary/50 p-1.5 backdrop-blur-sm"
      >
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              'group relative flex items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-150',
              activeTab === tab.id
                ? 'border-border/80 bg-card text-foreground shadow-sm'
                : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-secondary/50 hover:text-foreground'
            )}
          >
            {tab.icon && (
              <span
                className={cn(
                  'transition-colors',
                  activeTab === tab.id
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-foreground'
                )}
              >
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'bg-secondary text-muted-foreground'
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
  return (
    <div role="tabpanel" id={`tabpanel-${tabId}`} aria-labelledby={`tab-${tabId}`}>
      {children}
    </div>
  );
}

