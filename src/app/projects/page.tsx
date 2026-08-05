'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Building2,
  Archive,
  Trash2,
  RotateCcw,
  Pencil,
  Save,
  FolderKanban,
  ClipboardList,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';
import { getCityOptions } from '@/constants/climate-data';
import { psychrometricState } from '@/lib/functions/psychrometric';
import { cardGridVariants, cardItemVariants } from '@/animations/list-variants';
import { safeJsonParse } from '@/lib/utils/safe-json';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api-client';
import { useProjectsDashboard } from '@/features/projects/useProjectsDashboard';
import { ProjectEditDialog } from '@/features/projects/components/ProjectEditDialog';
import type { ProjectListItem } from '@/features/projects/types';



const DASHBOARD_PREFS_KEY = 'hvac-projects-dashboard:v1';
const DASHBOARD_STATUSES = ['all', 'draft', 'active', 'completed', 'archived', 'deleted'] as const;
const DASHBOARD_SORT_FIELDS = [
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'createdAt', label: 'Created Date' },
  { value: 'name', label: 'Project Name' },
] as const;

export default function ProjectsPage() {
  const {
    activeCount,
    archivedCount,
    cityOptions,
    completedCount,
    deleteTarget,
    deletedCount,
    draftCount,
    editForm,
    editSaving,
    editTarget,
    handleArchive,
    handleDelete,
    handleEditChange,
    handleEditNumBlur,
    handleEditNumChange,
    handleEditSave,
    handleRestore,
    handleSearch,
    handleSoftDelete,
    loading,
    openEdit,
    projects,
    router,
    search,
    setDeleteTarget,
    setEditTarget,
    setSearch,
    setSortBy,
    setSortOrder,
    setStatusFilter,
    sortBy,
    sortOrder,
    statusFilter,
    statuses,
    totalBOQItems,
    totalEquipment,
    statusColor,
    statusProgress,
  } = useProjectsDashboard();

  return (
    <PageWrapper>
      <PageHeader
        title="Projects"
        description="Manage your HVAC estimation projects"
        actions={
          <Link href="/projects/new">
            <Button variant="accent" size="md">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-7 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Card className="panel-glass mb-6 border-border/70 bg-accent/5 shadow-sm">
            <CardContent className="py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold font-display text-muted-foreground">Project Workspace</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">Manage active jobs, updates, and archival lifecycle in one view.</p>
                </div>
                <div className="rounded-sm border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                  <FolderKanban className="h-4 w-4" />
                  <span className="tabular-nums">{loading ? '—' : projects.length} total projects</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="panel-glass mb-6 flex flex-col gap-4 rounded-md border border-border/70 bg-card p-4 shadow-sm sm:p-5">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button variant="secondary" size="md" onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {statuses.map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? 'accent' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as (typeof DASHBOARD_SORT_FIELDS)[number]['value'])}
                aria-label="Sort by"
                className="h-10 rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground"
              >
                {DASHBOARD_SORT_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                aria-label="Sort order"
                className="h-10 rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>

          {/* Project Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              ghostPreview={!search}
              icon={<Building2 className="w-12 h-12" />}
              title="No projects found"
              description={search ? 'Try a different search term' : 'Create your first HVAC project'}
              action={
                <Link href="/projects/new">
                  <Button variant="accent" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                </Link>
              }
            />
          ) : (
            <motion.div
              variants={cardGridVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-(--space-component-gap)"
            >
              {projects.map((project) => {
                const projectTR = project.floors?.reduce(
                  (fSum, f) => fSum + f.rooms.reduce((rSum, r) => rSum + (r.coolingLoad?.trValue || 0), 0),
                  0
                ) || 0;
                const roomCount = project.floors?.reduce((sum, f) => sum + f.rooms.length, 0) || 0;

                return (
                  <motion.div key={project.id} variants={cardItemVariants}>
                    <Card className="panel-glass h-full border-border/70 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
                      <CardContent className="p-5">
                        {/*
                          Was a <div onClick> calling router.push, so opening a
                          project was mouse-only: no focus, no Enter, nothing in
                          the tab order, and no link target to open in a new tab.
                          A Link gives all of that for free.
                        */}
                        <Link
                          href={`/projects/${project.id}`}
                          className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="text-base font-semibold text-foreground truncate flex-1 pr-2">
                              {project.name}
                            </h3>
                            <Badge
                              variant={statusColor[project.status] || 'default'}
                              size="sm"
                            >
                              {project.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {project.clientName || 'No client'}
                          </p>
                          <p className="mb-4 text-sm text-muted-foreground">
                            {project.buildingType} · {project.city || project.location || '—'}
                          </p>
                          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                            <div className="rounded-md border border-border bg-secondary/50 py-2.5">
                              <p className="text-lg font-semibold tabular-nums text-foreground">
                                {roomCount}
                              </p>
                              <p className="text-xs font-medium font-display text-muted-foreground">Rooms</p>
                            </div>
                            <div className="rounded-md border border-border bg-secondary/50 py-2.5">
                              <p className="text-lg font-semibold tabular-nums text-foreground">
                                {projectTR.toFixed(1)}
                              </p>
                              <p className="text-xs font-medium font-display text-muted-foreground">TR</p>
                            </div>
                            <div className="rounded-md border border-border bg-secondary/50 py-2.5">
                              <p className="text-lg font-semibold tabular-nums text-foreground">
                                {project._count?.selectedEquipment || 0}
                              </p>
                              <p className="text-xs font-medium font-display text-muted-foreground">Equip</p>
                            </div>
                          </div>
                        </Link>
                        {/* Progress indicator */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                            <span className="capitalize">{project.status}</span>
                            <span className="tabular-nums">{statusProgress[project.status]?.percent ?? 0}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${statusProgress[project.status]?.color ?? 'bg-muted-foreground'}`}
                              style={{ width: `${statusProgress[project.status]?.percent ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1 border-t border-border pt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(project);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                          {/* Archive (only for non-archived, non-deleted) */}
                          {project.status !== 'archived' && project.status !== 'deleted' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchive(project);
                              }}
                            >
                              <Archive className="w-3.5 h-3.5 mr-1" />
                              Archive
                            </Button>
                          )}
                          {/* Restore (for archived or deleted) */}
                          {(project.status === 'archived' || project.status === 'deleted') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestore(project);
                              }}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Restore
                            </Button>
                          )}
                          {/* Soft delete (move to trash) for non-deleted */}
                          {project.status !== 'deleted' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSoftDelete(project);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                              Delete
                            </Button>
                          )}
                          {/* Permanent delete (only for deleted/archived) */}
                          {(project.status === 'deleted' || project.status === 'archived') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(project);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                              Permanently
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="panel-glass border-border/70 bg-accent/5 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-accent" />
                <h3 className="text-[13px] font-semibold text-foreground">Portfolio Snapshot</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-card p-4">
                  <p className="text-xs font-display text-muted-foreground">Draft</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : draftCount}</p>
                </div>
                <div className="rounded-md border border-border bg-card p-4">
                  <p className="text-xs font-display text-muted-foreground">Active</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : activeCount}</p>
                </div>
                <div className="rounded-md border border-border bg-card p-4">
                  <p className="text-xs font-display text-muted-foreground">Completed</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : completedCount}</p>
                </div>
                <div className="rounded-md border border-border bg-card p-4">
                  <p className="text-xs font-display text-muted-foreground">Archived</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : archivedCount}</p>
                </div>
                <div className="col-span-2 rounded-md border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-xs font-display text-red-400">Trash</p>
                  <p className="text-xl font-semibold tabular-nums text-red-400">{loading ? '—' : deletedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="panel-glass border-border/70 bg-card shadow-sm">
            <CardContent className="space-y-4 p-5">
              <h3 className="text-[13px] font-semibold text-foreground">Capacity & BOQ</h3>
              <div className="rounded-sm border border-border bg-secondary/50 p-4">
                <p className="text-xs font-display text-muted-foreground">Selected Equipment</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{loading ? '—' : totalEquipment}</p>
              </div>
              <div className="rounded-sm border border-border bg-secondary/50 p-4">
                <p className="text-xs font-display text-muted-foreground">BOQ Line Items</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{loading ? '—' : totalBOQItems}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Project Dialog */}
      <ProjectEditDialog
        editTarget={editTarget}
        setEditTarget={setEditTarget}
        editForm={editForm}
        editSaving={editSaving}
        cityOptions={cityOptions}
        handleEditChange={handleEditChange}
        handleEditNumChange={handleEditNumChange}
        handleEditNumBlur={handleEditNumBlur}
        handleEditSave={handleEditSave}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Project"
        description={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete Permanently"
        variant="destructive"
      />
    </PageWrapper>
  );
}
