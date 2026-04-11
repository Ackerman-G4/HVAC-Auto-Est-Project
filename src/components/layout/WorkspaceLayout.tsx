'use client';

import React, { useCallback } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';

/* ─── Resize Handle ─────────────────────────────────────────────── */

function ResizeHandle({ direction = 'vertical' }: { direction?: 'vertical' | 'horizontal' }) {
  const isVertical = direction === 'vertical';

  return (
    <PanelResizeHandle
      className={`group relative flex items-center justify-center ${
        isVertical ? 'w-1.5' : 'h-1.5'
      } transition-colors hover:bg-accent/20 active:bg-accent/30`}
    >
      {/* Track */}
      <div
        className={`${
          isVertical ? 'h-8 w-0.5' : 'w-8 h-0.5'
        } rounded-full bg-border group-hover:bg-accent/60 group-active:bg-accent transition-colors`}
      />
    </PanelResizeHandle>
  );
}

/* ─── Props ──────────────────────────────────────────────────────── */

export interface WorkspaceLayoutProps {
  /** Left panel — config / inputs */
  inputPanel: React.ReactNode;
  /** Center panel — 3D viewer / charts */
  viewerPanel: React.ReactNode;
  /** Right panel — results / metrics */
  resultsPanel: React.ReactNode;
  /** Optional header bar above the panels */
  header?: React.ReactNode;
  /** Optional footer / status bar below the panels */
  footer?: React.ReactNode;
  /** Default percentage widths [left, center, right]. Must sum to 100. */
  defaultLayout?: [number, number, number];
  /** Callback when user resizes */
  onLayoutChange?: (sizes: number[]) => void;
}

/* ─── Component ──────────────────────────────────────────────────── */

export function WorkspaceLayout({
  inputPanel,
  viewerPanel,
  resultsPanel,
  header,
  footer,
  defaultLayout = [22, 50, 28],
  onLayoutChange,
}: WorkspaceLayoutProps) {
  const handleLayout = useCallback(
    (sizes: number[]) => {
      onLayoutChange?.(sizes);
    },
    [onLayoutChange],
  );

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {/* Optional header */}
      {header && (
        <div className="shrink-0 border-b border-border bg-card/60 backdrop-blur-sm px-4 py-2">
          {header}
        </div>
      )}

      {/* Panels */}
      <PanelGroup
        direction="horizontal"
        onLayout={handleLayout}
        autoSaveId="hvac-workspace-layout"
        className="flex-1"
      >
        {/* Left — Input Panel */}
        <Panel
          defaultSize={defaultLayout[0]}
          minSize={14}
          maxSize={35}
          collapsible
          collapsedSize={0}
          className="overflow-hidden"
        >
          <div className="h-full overflow-y-auto bg-card border-r border-border">
            {inputPanel}
          </div>
        </Panel>

        <ResizeHandle />

        {/* Center — Viewer Panel */}
        <Panel
          defaultSize={defaultLayout[1]}
          minSize={30}
          className="overflow-hidden"
        >
          <div className="h-full overflow-y-auto bg-background">
            {viewerPanel}
          </div>
        </Panel>

        <ResizeHandle />

        {/* Right — Results Panel */}
        <Panel
          defaultSize={defaultLayout[2]}
          minSize={14}
          maxSize={40}
          collapsible
          collapsedSize={0}
          className="overflow-hidden"
        >
          <div className="h-full overflow-y-auto bg-card border-l border-border">
            {resultsPanel}
          </div>
        </Panel>
      </PanelGroup>

      {/* Optional footer / status bar */}
      {footer && (
        <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-4 py-1.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
