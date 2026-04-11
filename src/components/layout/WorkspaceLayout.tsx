'use client';

import React, { useCallback } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';

type ViewportMode = 'desktop' | 'tablet' | 'compact';

function detectViewportMode(width: number): ViewportMode {
  if (width >= 1400) return 'desktop';
  if (width >= 920) return 'tablet';
  return 'compact';
}

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

  const [viewportMode, setViewportMode] = React.useState<ViewportMode>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return detectViewportMode(window.innerWidth);
  });

  React.useEffect(() => {
    const applyMode = () => setViewportMode(detectViewportMode(window.innerWidth));
    applyMode();
    window.addEventListener('resize', applyMode);
    return () => window.removeEventListener('resize', applyMode);
  }, []);

  if (viewportMode === 'compact') {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {header && (
          <div className="shrink-0 border-b border-border bg-card/70 px-4 py-2">
            {header}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-(--space-component-gap) overflow-auto py-1">
          <section className="glass-card min-h-72 overflow-hidden rounded-2xl border border-border/70">
            <div className="workspace-panel h-full overflow-y-auto">{inputPanel}</div>
          </section>

          <section className="glass-card min-h-80 overflow-hidden rounded-2xl border border-border/70">
            <div className="workspace-panel h-full overflow-y-auto">{viewerPanel}</div>
          </section>

          <section className="glass-card min-h-72 overflow-hidden rounded-2xl border border-border/70">
            <div className="workspace-panel h-full overflow-y-auto">{resultsPanel}</div>
          </section>
        </div>

        {footer && (
          <div className="shrink-0 border-t border-border bg-card/70 px-4 py-1.5 text-xs text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    );
  }

  if (viewportMode === 'tablet') {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {header && (
          <div className="shrink-0 border-b border-border bg-card/70 px-4 py-2">
            {header}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,34%)_minmax(0,1fr)] gap-(--space-component-gap)">
          <section className="glass-card min-h-0 overflow-hidden rounded-2xl border border-border/70">
            <div className="workspace-panel h-full overflow-y-auto">{inputPanel}</div>
          </section>

          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(220px,36%)] gap-(--space-component-gap)">
            <div className="glass-card min-h-0 overflow-hidden rounded-2xl border border-border/70">
              <div className="workspace-panel h-full overflow-y-auto">{viewerPanel}</div>
            </div>

            <div className="glass-card min-h-0 overflow-hidden rounded-2xl border border-border/70">
              <div className="workspace-panel h-full overflow-y-auto">{resultsPanel}</div>
            </div>
          </section>
        </div>

        {footer && (
          <div className="shrink-0 border-t border-border bg-card/70 px-4 py-1.5 text-xs text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
          minSize={18}
          maxSize={35}
          collapsible
          collapsedSize={0}
          className="overflow-hidden"
        >
          <div className="workspace-panel glass-card h-full overflow-y-auto rounded-l-2xl border-r border-border/70">
            {inputPanel}
          </div>
        </Panel>

        <ResizeHandle />

        {/* Center — Viewer Panel */}
        <Panel
          defaultSize={defaultLayout[1]}
          minSize={34}
          className="overflow-hidden"
        >
          <div className="workspace-panel h-full overflow-y-auto bg-background">
            {viewerPanel}
          </div>
        </Panel>

        <ResizeHandle />

        {/* Right — Results Panel */}
        <Panel
          defaultSize={defaultLayout[2]}
          minSize={18}
          maxSize={40}
          collapsible
          collapsedSize={0}
          className="overflow-hidden"
        >
          <div className="workspace-panel glass-card h-full overflow-y-auto rounded-r-2xl border-l border-border/70">
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
