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
      <div className="flex gap-1 p-1 bg-slate-100/80 backdrop-blur-md rounded-xl p-1.5 overflow-x-auto no-print w-fit border border-slate-200/60 shadow-inner">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative flex items-center gap-2.5 px-5 py-2.5 text-[14px] font-bold tracking-tight whitespace-nowrap transition-all duration-300 rounded-lg',
              activeTab === tab.id
                ? 'bg-white text-blue-700 shadow-md shadow-slate-200/50 scale-[1.02]'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            )}
          >
            {tab.icon && (
              <span className={cn("transition-colors", activeTab === tab.id ? 'text-blue-600' : 'text-slate-400')}>
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-bold',
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
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

