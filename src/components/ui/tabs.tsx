'use client';

import React, { useState } from 'react';
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
      <div className="flex border-b border-border overflow-x-auto no-print">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-all duration-150 border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full',
                activeTab === tab.id ? 'bg-accent text-white' : 'bg-muted text-muted-foreground'
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
          className="pt-4"
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
