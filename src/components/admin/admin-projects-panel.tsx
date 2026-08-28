'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, RefreshCw, Search } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface AdminProject {
  id: string;
  name: string;
  buildingType: string;
  status: string;
  ownerId?: string;
  createdBy?: string;
  updatedAt?: string;
  _count?: { boqItems: number; selectedEquipment: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'warning' | 'destructive'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
  deleted: 'destructive',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function shortId(value?: string): string {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

export function AdminProjectsPanel() {
  const router = useRouter();
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/projects?status=all');
      if (!res.ok) throw new Error('Failed to load projects');
      const data = await res.json();
      setProjects((data.projects as AdminProject[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [projects, status, query]);

  if (loading) return <TableSkeleton rows={6} cols={5} />;

  if (error) {
    return (
      <EmptyState
        icon={<FolderKanban size={28} />}
        title="Could not load projects"
        description={error}
        action={
          <Button onClick={load} variant="outline">
            <RefreshCw size={16} /> Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            showRangeHint={false}
          />
        </div>
        <div className="w-44">
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        <Button onClick={load} variant="outline" size="sm" className="ml-auto">
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs font-display text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">BOQ Items</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="cursor-pointer transition-colors hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{project.name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {shortId(project.ownerId || project.createdBy)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{project.buildingType || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[project.status] ?? 'outline'} size="sm">
                        {project.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {project._count?.boqItems ?? 0}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatDate(project.updatedAt)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No projects match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
