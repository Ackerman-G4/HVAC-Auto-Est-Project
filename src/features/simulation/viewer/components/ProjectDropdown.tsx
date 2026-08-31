'use client';

import React, { useId } from 'react';
import type { Project } from '@/types/project';

export function ProjectDropdown({ projects, onSelect, selectedId }: ProjectDropdownProps) {
  // useId rather than a literal: this panel can appear more than once, and a
  // duplicated id silently points every label at the first control.
  const selectId = useId();

  return (
    <div className="panel-glass mb-6 rounded-md border border-border/70 bg-card p-4 shadow-sm">
      <label htmlFor={selectId} className="mb-1.5 block text-[11px] font-semibold font-display text-muted-foreground">Choose Project</label>
      <select
        id={selectId}
        className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm"
        value={selectedId}
        onChange={e => onSelect(e.target.value)}
        aria-label="Choose Project"
      >
        {projects.map((p: Project) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

interface ProjectDropdownProps {
  projects: Project[];
  onSelect: (id: string) => void;
  selectedId: string;
}
// Project dropdown now fetches from API
