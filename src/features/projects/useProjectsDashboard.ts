'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { showToast } from '@/components/ui/toast';
import { getCityOptions } from '@/constants/climate-data';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { authFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type { ProjectListItem } from './types';

const DASHBOARD_PREFS_KEY = 'hvac-projects-dashboard:v1';
const DASHBOARD_STATUSES = ['all', 'draft', 'active', 'completed', 'archived', 'deleted'] as const;
const DASHBOARD_SORT_FIELDS = [
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'createdAt', label: 'Created Date' },
  { value: 'name', label: 'Project Name' },
] as const;

/**
 * State, effects and handlers for the projects dashboard.
 *
 * Lifted out of projects/page.tsx verbatim — the persisted filter/sort
 * preferences and the archive/restore/soft-delete handlers are order-sensitive
 * enough that re-deriving them by hand is how regressions get introduced. The
 * page keeps the same local names by destructuring, so its JSX is untouched.
 */
export function useProjectsDashboard() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<(typeof DASHBOARD_SORT_FIELDS)[number]['value']>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [prefsHydrated, setPrefsHydrated] = useState(false);
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
  const user = useAuthStore((state) => state.user);
  const authInitialized = useAuthStore((state) => state.initialized);
  const cityOptions = getCityOptions();

  const fetchProjects = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);

    authFetch(`/api/projects?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(DASHBOARD_PREFS_KEY);
    const parsed = safeJsonParse<{
      search?: string;
      statusFilter?: string;
      sortBy?: string;
      sortOrder?: string;
    }>(raw);

    if (!parsed) {
      setPrefsHydrated(true);
      return;
    }

    if (typeof parsed.search === 'string') setSearch(parsed.search);
    if (typeof parsed.statusFilter === 'string' && DASHBOARD_STATUSES.includes(parsed.statusFilter as typeof DASHBOARD_STATUSES[number])) {
      setStatusFilter(parsed.statusFilter);
    }
    if (typeof parsed.sortBy === 'string' && DASHBOARD_SORT_FIELDS.some((f) => f.value === parsed.sortBy)) {
      setSortBy(parsed.sortBy as (typeof DASHBOARD_SORT_FIELDS)[number]['value']);
    }
    if (parsed.sortOrder === 'asc' || parsed.sortOrder === 'desc') {
      setSortOrder(parsed.sortOrder);
    }

    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!prefsHydrated || typeof window === 'undefined') return;

    window.localStorage.setItem(
      DASHBOARD_PREFS_KEY,
      JSON.stringify({
        search,
        statusFilter,
        sortBy,
        sortOrder,
      }),
    );
  }, [search, statusFilter, sortBy, sortOrder, prefsHydrated]);

  useEffect(() => {
    if (!prefsHydrated || !user) return;
    fetchProjects();
  }, [fetchProjects, prefsHydrated, user]);

  useEffect(() => {
    if (authInitialized && !user) {
      setLoading(false);
      router.replace('/auth/login');
    }
  }, [authInitialized, user, router]);

  const handleSearch = () => fetchProjects();

  const openEdit = (project: ProjectListItem) => {
    // Fetch full project data for the form
    authFetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((data) => {
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
      const res = await authFetch(`/api/projects/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        showToast('success', 'Project updated successfully');
        setEditTarget(null);
        fetchProjects();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to update');
      }
    } catch {
      showToast('error', 'Network error');
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
      const res = await authFetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      if (res.ok) {
        showToast('success', 'Project archived');
        fetchProjects();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to archive project');
      }
    } catch {
      showToast('error', 'Network error while archiving');
    }
  };

  const handleRestore = async (project: ProjectListItem) => {
    try {
      const res = await authFetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      if (res.ok) {
        showToast('success', 'Project restored');
        fetchProjects();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to restore project');
      }
    } catch {
      showToast('error', 'Network error while restoring');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/api/projects/${deleteTarget.id}?permanent=true`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', 'Project permanently deleted');
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to delete project');
      }
    } catch {
      showToast('error', 'Network error while deleting');
    }
    setDeleteTarget(null);
    fetchProjects();
  };

  const handleSoftDelete = async (project: ProjectListItem) => {
    try {
      const res = await authFetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', 'Project moved to trash');
        fetchProjects();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to delete project');
      }
    } catch {
      showToast('error', 'Network error while deleting');
    }
  };

  const statusColor: Record<string, 'default' | 'success' | 'warning' | 'accent' | 'destructive'> = {
    draft: 'default',
    active: 'accent',
    completed: 'success',
    archived: 'warning',
    deleted: 'destructive',
  };

  const statusProgress: Record<string, { percent: number; color: string }> = {
    draft: { percent: 15, color: 'bg-muted-foreground' },
    active: { percent: 50, color: 'bg-primary' },
    completed: { percent: 100, color: 'bg-success' },
    archived: { percent: 100, color: 'bg-muted-foreground/50' },
    deleted: { percent: 0, color: 'bg-destructive' },
  };

  const statuses = DASHBOARD_STATUSES;
  const draftCount = projects.filter((p) => p.status === 'draft').length;
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;
  const archivedCount = projects.filter((p) => p.status === 'archived').length;
  const deletedCount = projects.filter((p) => p.status === 'deleted').length;
  const totalEquipment = projects.reduce((sum, p) => sum + (p._count?.selectedEquipment || 0), 0);
  const totalBOQItems = projects.reduce((sum, p) => sum + (p._count?.boqItems || 0), 0);
  return {
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
  };
}
