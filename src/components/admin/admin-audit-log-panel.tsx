'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ScrollText, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface AuditLog {
  id: string;
  projectId: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  previousValue: string;
  newValue: string;
  createdAt: string;
}

const ENTITY_OPTIONS = [
  { value: '', label: 'All entities' },
  { value: 'project', label: 'Project' },
  { value: 'boq', label: 'BOQ' },
  { value: 'boq_item', label: 'BOQ Item' },
  { value: 'equipment_price', label: 'Equipment Price' },
  { value: 'cooling_load', label: 'Cooling Load' },
  { value: 'settings', label: 'Settings' },
  { value: 'material', label: 'Material' },
  { value: 'supplier', label: 'Supplier' },
];

const DANGER_ACTIONS = new Set(['access_denied', 'tamper_detected', 'permanently_deleted', 'deleted']);

function formatTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function prettyJson(raw: string): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function AdminAuditLogPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (entity) params.set('entity', entity);
      if (action.trim()) params.set('action', action.trim());
      if (search.trim()) params.set('search', search.trim());
      const res = await authFetch(`/api/admin/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load audit logs');
      const data = await res.json();
      setLogs((data.logs as AuditLog[]) ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [entity, action, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Select
            label="Entity"
            options={ENTITY_OPTIONS}
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Input
            label="Action"
            placeholder="e.g. price_override"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            showRangeHint={false}
          />
        </div>
        <div className="w-56">
          <Input
            label="Search"
            placeholder="Search details"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            showRangeHint={false}
          />
        </div>
        <Button onClick={load} variant="outline" size="sm" className="ml-auto">
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : error ? (
        <EmptyState
          icon={<ScrollText size={28} />}
          title="Could not load audit logs"
          description={error}
          action={
            <Button onClick={load} variant="outline">
              <RefreshCw size={16} /> Retry
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing {logs.length} of {total} matching {total === 1 ? 'entry' : 'entries'}.
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold" />
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Entity</th>
                      <th className="px-4 py-3 font-semibold">Entity ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {logs.map((log) => {
                      const isOpen = expanded === log.id;
                      return (
                        <Fragment key={log.id}>
                          <tr
                            onClick={() => setExpanded(isOpen ? null : log.id)}
                            className="cursor-pointer transition-colors hover:bg-secondary/40"
                          >
                            <td className="px-4 py-3 text-muted-foreground">
                              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-muted-foreground">
                              {formatTime(log.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={DANGER_ACTIONS.has(log.action) ? 'destructive' : 'outline'} size="sm">
                                {log.action || '—'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-foreground">{log.entity || '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {log.entityId ? `${log.entityId.slice(0, 16)}${log.entityId.length > 16 ? '…' : ''}` : '—'}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-secondary/25">
                              <td colSpan={5} className="px-4 py-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                  {(['details', 'previousValue', 'newValue'] as const).map((field) => {
                                    const value = prettyJson(log[field]);
                                    if (!value) return null;
                                    return (
                                      <div key={field}>
                                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                          {field}
                                        </p>
                                        <pre className="overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-foreground">
                                          {value}
                                        </pre>
                                      </div>
                                    );
                                  })}
                                  {log.projectId && (
                                    <p className="text-xs text-muted-foreground">
                                      Project: <span className="font-mono">{log.projectId}</span>
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                          No audit entries match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
