'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const MotionDiv = dynamic(() => import('framer-motion').then((mod) => mod.motion.div), { ssr: true });
const MotionSection = dynamic(() => import('framer-motion').then((mod) => mod.motion.section), { ssr: true });

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
import { projectsApi } from '@/lib/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ProjectListItem {
  id: string;
  name: string;
  clientName: string;
  buildingType: string;
  status: string;
  location: string;
  city: string;
  totalFloorArea: number;
  createdAt: string;
  updatedAt: string;
  floors: { rooms: { coolingLoad?: { trValue: number } | null }[] }[];
  _count: { selectedEquipment: number; boqItems: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectListItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | number>>({
    name: '',
    clientName: '',
    buildingType: 'commercial',
    location: '',
    city: 'Manila',
    totalFloorArea: 0,
    floorsAboveGrade: 1,
    floorsBelowGrade: 0,
    outdoorDB: 35,
    outdoorRH: 50,
    indoorDB: 24,
    indoorRH: 50,
    safetyFactor: 1.1,
    diversityFactor: 0.85,
    notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const router = useRouter();
  const cityOptions = getCityOptions();

  const fetchProjects = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter !== 'all') params.status = statusFilter;

    projectsApi.list(params)
      .then((data) => {
        setProjects(data.projects as ProjectListItem[] || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, [statusFilter]);

  const handleSearch = () => fetchProjects();

  const openEdit = (project: ProjectListItem) => {
    // Fetch full project data for the form
    projectsApi.get(project.id)
      .then((data: any) => {
        const p = data.project || data;
        setEditForm({
          name: p.name || '',
          clientName: p.clientName || '',
          buildingType: p.buildingType || 'commercial',
          location: p.location || '',
          city: p.city || 'Manila',
          totalFloorArea: p.totalFloorArea || 0,
          floorsAboveGrade: p.floorsAboveGrade || 1,
          floorsBelowGrade: p.floorsBelowGrade || 0,
          outdoorDB: p.outdoorDB || 35,
          outdoorRH: p.outdoorRH || 50,
          indoorDB: p.indoorDB || 24,
          indoorRH: p.indoorRH || 50,
          safetyFactor: p.safetyFactor || 1.1,
          diversityFactor: p.diversityFactor || 0.85,
          notes: p.notes || '',
        });
        setEditTarget(project);
      })
      .catch(() => showToast('error', 'Failed to load project details'));
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!String(editForm.name).trim()) {
      showToast('error', 'Project name is required');
      return;
    }
    setEditSaving(true);
    try {
      await projectsApi.update(editTarget.id, editForm);
      showToast('success', 'Project updated successfully');
      setEditTarget(null);
      fetchProjects();
    } catch {
      showToast('error', 'Failed to update');
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditChange = (field: string, value: string | number) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditNumChange = (field: string, raw: string) => {
    setEditForm((prev) => ({ ...prev, [field]: raw }));
  };

  const handleEditNumBlur = (field: string, fallback: number) => {
    setEditForm((prev) => {
      const v = prev[field];
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return { ...prev, [field]: isNaN(n as number) || v === '' ? fallback : n };
    });
  };

  const handleArchive = async (project: ProjectListItem) => {
    try {
      await projectsApi.update(project.id, { status: 'archived' });
      showToast('success', 'Project archived');
      fetchProjects();
    } catch {
      showToast('error', 'Failed to archive project');
    }
  };

  const handleRestore = async (project: ProjectListItem) => {
    try {
      await projectsApi.update(project.id, { status: 'draft' });
      showToast('success', 'Project restored');
      fetchProjects();
    } catch {
      showToast('error', 'Failed to restore project');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await projectsApi.delete(deleteTarget.id, true);
      showToast('success', 'Project permanently deleted');
      fetchProjects();
    } catch {
      showToast('error', 'Failed to delete project');
    }
    setDeleteTarget(null);
  };

  const handleSoftDelete = async (project: ProjectListItem) => {
    try {
      await projectsApi.delete(project.id, false);
      showToast('success', 'Project moved to trash');
      fetchProjects();
    } catch {
      showToast('error', 'Failed to delete project');
    }
  };

  const statusColor: Record<string, 'default' | 'success' | 'warning' | 'accent' | 'destructive'> = {
    draft: 'default',
    active: 'accent',
    completed: 'success',
    archived: 'warning',
    deleted: 'destructive',
  };

  const statuses = ['all', 'draft', 'active', 'completed', 'archived', 'deleted'];
  const draftCount = projects.filter((p) => p.status === 'draft').length;
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;
  const archivedCount = projects.filter((p) => p.status === 'archived').length;
  const deletedCount = projects.filter((p) => p.status === 'deleted').length;
  const totalEquipment = projects.reduce((sum, p) => sum + (p._count?.selectedEquipment || 0), 0);
  const totalBOQItems = projects.reduce((sum, p) => sum + (p._count?.boqItems || 0), 0);

  return (
    <PageWrapper>
      <PageHeader
        title="Projects"
        description="Manage your HVAC estimation projects"
        actions={
          <Link href="/projects/new">
            <Button variant="accent" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          <Card className="mb-6 border-accent/20 bg-linear-to-r from-accent/10 via-primary/5 to-secondary/40">
            <CardContent className="py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Project Workspace</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">Manage active jobs, updates, and archival lifecycle in one view.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span className="tabular-nums">{loading ? '—' : projects.length} total projects</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
              className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4"
            >
              {projects.map((project) => {
                const projectTR = project.floors?.reduce(
                  (fSum, f) => fSum + f.rooms.reduce((rSum, r) => rSum + (r.coolingLoad?.trValue || 0), 0),
                  0
                ) || 0;
                const roomCount = project.floors?.reduce((sum, f) => sum + f.rooms.length, 0) || 0;

                return (
                  <motion.div key={project.id} variants={cardItemVariants}>
                    <Card>
                      <CardContent className="p-5">
                        <div
                          onClick={() => router.push(`/projects/${project.id}`)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="text-sm font-semibold text-foreground truncate flex-1 pr-2">
                              {project.name}
                            </h3>
                            <Badge
                              variant={statusColor[project.status] || 'default'}
                              size="sm"
                            >
                              {project.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {project.clientName || 'No client'}
                          </p>
                          <p className="text-xs text-muted-foreground mb-4">
                            {project.buildingType} · {project.city || project.location || '—'}
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-secondary/60 rounded-lg py-2">
                              <p className="text-lg font-semibold tabular-nums text-foreground">
                                {roomCount}
                              </p>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Rooms</p>
                            </div>
                            <div className="bg-secondary/60 rounded-lg py-2">
                              <p className="text-lg font-semibold tabular-nums text-foreground">
                                {projectTR.toFixed(1)}
                              </p>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">TR</p>
                            </div>
                            <div className="bg-secondary/60 rounded-lg py-2">
                              <p className="text-lg font-semibold tabular-nums text-foreground">
                                {project._count?.selectedEquipment || 0}
                              </p>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Equip</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 border-t border-border/40 pt-3 mt-4">
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
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-accent" />
                <h3 className="text-[13px] font-semibold text-foreground">Portfolio Snapshot</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Draft</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : draftCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Active</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : activeCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Completed</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : completedCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Archived</p>
                  <p className="text-xl font-semibold tabular-nums">{loading ? '—' : archivedCount}</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-red-400">Trash</p>
                  <p className="text-xl font-semibold tabular-nums text-red-400">{loading ? '—' : deletedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-foreground">Capacity & BOQ</h3>
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-3">
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Selected Equipment</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{loading ? '—' : totalEquipment}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-3">
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">BOQ Line Items</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{loading ? '—' : totalBOQItems}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Project Dialog */}
      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Project"
        description="Update project details, design conditions, and calculation parameters."
        size="xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Project Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Project Details</h3>
            <Input
              label="Project Name *"
              placeholder="e.g., ABC Office Tower HVAC"
              value={editForm.name}
              onChange={(e) => handleEditChange('name', e.target.value)}
            />
            <Input
              label="Client Name"
              placeholder="e.g., ABC Corporation"
              value={editForm.clientName}
              onChange={(e) => handleEditChange('clientName', e.target.value)}
            />
            <Select
              label="Building Type"
              value={editForm.buildingType}
              onChange={(e) => handleEditChange('buildingType', e.target.value)}
              options={[
                { value: 'commercial', label: 'Commercial' },
                { value: 'residential', label: 'Residential' },
                { value: 'industrial', label: 'Industrial' },
                { value: 'institutional', label: 'Institutional' },
                { value: 'healthcare', label: 'Healthcare' },
                { value: 'hospitality', label: 'Hospitality' },
                { value: 'retail', label: 'Retail' },
                { value: 'mixed_use', label: 'Mixed Use' },
              ]}
            />
            <Input
              label="Location / Address"
              placeholder="e.g., Makati CBD"
              value={editForm.location}
              onChange={(e) => handleEditChange('location', e.target.value)}
            />
            <Select
              label="City"
              value={editForm.city}
              onChange={(e) => handleEditChange('city', e.target.value)}
              options={cityOptions.map((c) => ({ value: c.value, label: c.label }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Floors Above Grade"
                type="number"
                min={1}
                value={editForm.floorsAboveGrade}
                onChange={(e) => handleEditNumChange('floorsAboveGrade', e.target.value)}
                onBlur={() => handleEditNumBlur('floorsAboveGrade', 1)}
              />
              <Input
                label="Floors Below Grade"
                type="number"
                min={0}
                value={editForm.floorsBelowGrade}
                onChange={(e) => handleEditNumChange('floorsBelowGrade', e.target.value)}
                onBlur={() => handleEditNumBlur('floorsBelowGrade', 0)}
              />
            </div>
            <Input
              label="Total Floor Area (sqm)"
              type="number"
              min={0}
              value={editForm.totalFloorArea}
              onChange={(e) => handleEditNumChange('totalFloorArea', e.target.value)}
              onBlur={() => handleEditNumBlur('totalFloorArea', 0)}
            />
          </div>

          {/* Right Column: Design Conditions & Parameters */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Design Conditions</h3>
            <div className="p-3 bg-secondary rounded-lg">
              <p className="text-xs text-muted-foreground">
                Carrier Psychrometric Chart — WB, dew point, humidity ratio, and enthalpy are auto-computed from DB & RH.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Outdoor Dry Bulb (°C)"
                type="number"
                step={0.1}
                value={editForm.outdoorDB}
                onChange={(e) => handleEditNumChange('outdoorDB', e.target.value)}
                onBlur={() => handleEditNumBlur('outdoorDB', 35)}
              />
              <Input
                label="Outdoor RH (%)"
                type="number"
                step={1}
                min={10}
                max={100}
                value={editForm.outdoorRH}
                onChange={(e) => handleEditNumChange('outdoorRH', e.target.value)}
                onBlur={() => handleEditNumBlur('outdoorRH', 50)}
              />
            </div>
            {/* Psychrometric Summary — auto-computed */}
            {(() => {
              const ps = psychrometricState(Number(editForm.outdoorDB) || 35, Number(editForm.outdoorRH) || 50);
              return (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 rounded-lg py-1.5 px-1">
                    <p className="text-sm font-semibold tabular-nums">{ps.wetBulb}°C</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Wet Bulb</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-1.5 px-1">
                    <p className="text-sm font-semibold tabular-nums">{ps.dewPoint}°C</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Dew Point</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-1.5 px-1">
                    <p className="text-sm font-semibold tabular-nums">{(ps.humidityRatio * 1000).toFixed(1)} g/kg</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Humidity Ratio</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-1.5 px-1">
                    <p className="text-sm font-semibold tabular-nums">{ps.enthalpy} kJ/kg</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Enthalpy</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-1.5 px-1">
                    <p className="text-sm font-semibold tabular-nums">{ps.specificVolume} m³/kg</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sp. Volume</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-1.5 px-1">
                    <p className="text-sm font-semibold tabular-nums">{ps.density} kg/m³</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Density</p>
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Indoor Dry Bulb (°C)"
                type="number"
                step={0.1}
                value={editForm.indoorDB}
                onChange={(e) => handleEditNumChange('indoorDB', e.target.value)}
                onBlur={() => handleEditNumBlur('indoorDB', 24)}
              />
              <Input
                label="Indoor RH (%)"
                type="number"
                step={1}
                min={30}
                max={70}
                value={editForm.indoorRH}
                onChange={(e) => handleEditNumChange('indoorRH', e.target.value)}
                onBlur={() => handleEditNumBlur('indoorRH', 50)}
              />
            </div>

            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider pt-2">Calculation Parameters</h3>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Safety Factor"
                type="number"
                step={0.05}
                min={1}
                max={2}
                value={editForm.safetyFactor}
                onChange={(e) => handleEditNumChange('safetyFactor', e.target.value)}
                onBlur={() => handleEditNumBlur('safetyFactor', 1.1)}
              />
              <Input
                label="Diversity Factor"
                type="number"
                step={0.05}
                min={0.5}
                max={1}
                value={editForm.diversityFactor}
                onChange={(e) => handleEditNumChange('diversityFactor', e.target.value)}
                onBlur={() => handleEditNumBlur('diversityFactor', 0.85)}
              />
            </div>
            <Input
              label="Notes"
              placeholder="Additional project notes..."
              value={editForm.notes}
              onChange={(e) => handleEditChange('notes', e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" onClick={handleEditSave} isLoading={editSaving}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </Dialog>

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
