'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw, Search } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'engineer';
  disabled: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mode, setMode] = useState<'firebase' | 'local'>('firebase');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers((data.users as AdminUser[]) ?? []);
      setMode(data.mode === 'local' ? 'local' : 'firebase');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle),
    );
  }, [users, query]);

  if (loading) return <TableSkeleton rows={6} cols={6} />;

  if (error) {
    return (
      <EmptyState
        icon={<Users size={28} />}
        title="Could not load users"
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            showRangeHint={false}
          />
        </div>
        <div className="flex items-center gap-3">
          {mode === 'local' && (
            <Badge variant="warning" size="sm">
              Local auth — limited data
            </Badge>
          )}
          <Button onClick={load} variant="outline" size="sm">
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">MFA</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-secondary/40">
                    <td className="px-4 py-3 font-medium text-foreground">{user.email || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.name || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={user.role === 'admin' ? 'warning' : 'outline'} size="sm">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.mfaEnabled ? 'success' : 'outline'} size="sm">
                        {user.mfaEnabled ? 'On' : 'Off'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.disabled ? 'destructive' : 'success'} size="sm">
                        {user.disabled ? 'Disabled' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatDate(user.lastLoginAt)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No users match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        User management actions (role changes, password resets, deactivation) are provisioned via the
        admin CLI in this release.
      </p>
    </div>
  );
}
