'use client';

import React from 'react';
import type { Project } from '@/types/project';

export function ProjectDropdown({ projects, onSelect, selectedId }: ProjectDropdownProps) {
  return (
    <div className="panel-glass mb-6 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Choose Project</label>
      <select
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
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
