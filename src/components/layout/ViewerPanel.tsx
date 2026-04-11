'use client';

import React, { useState } from 'react';
import { TabPanel } from '@/components/ui/tabs';

/* ─── Types ──────────────────────────────────────────────────────── */

export interface ViewerTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

export interface ViewerPanelProps {
  /** Available viewer tabs (e.g. 3D, Psychrometric, Charts) */
  tabs: ViewerTab[];
  /** Initially active tab id */
  defaultTab?: string;
  /** Toolbar rendered above the tab content */
  toolbar?: React.ReactNode;
  /** Status bar below the viewer */
  statusBar?: React.ReactNode;
}

/* ─── Component ──────────────────────────────────────────────────── */

export function ViewerPanel({
  tabs,
  defaultTab,
  toolbar,
  statusBar,
}: ViewerPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? '');

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar + optional toolbar */}
      <div className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === t.id
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          {toolbar && (
            <div className="flex items-center gap-2 shrink-0">{toolbar}</div>
          )}
        </div>
      </div>

      {/* Viewer content */}
      <div className="flex-1 overflow-hidden relative">
        {tabs.map((t) => (
          <TabPanel key={t.id} tabId={t.id} activeTab={activeTab}>
            <div className="h-full">{t.content}</div>
          </TabPanel>
        ))}
      </div>

      {/* Status bar */}
      {statusBar && (
        <div className="shrink-0 border-t border-border bg-card/60 backdrop-blur-sm px-4 py-1.5 text-[11px] text-muted-foreground flex items-center gap-4">
          {statusBar}
        </div>
      )}
    </div>
  );
}
