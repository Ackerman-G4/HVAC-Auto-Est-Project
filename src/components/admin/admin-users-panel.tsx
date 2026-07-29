'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw, Search, Lock, Unlock, ShieldCheck, ShieldOff } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';

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

type PendingMutation =
  | { kind: 'disable'; user: AdminUser }
  | { kind: 'enable'; user: AdminUser }
  | { kind: 'setRole'; user: AdminUser; role: 'admin' | 'engineer' };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function isDestructiveMutation(mutation: PendingMutation): boolean {
  return mutation.kind === 'disable' || (mutation.kind === 'setRole' && mutation.role === 'engineer');
}

function mutationCopy(mutation: PendingMutation): { title: string; description: string; confirmText: string } {
  if (mutation.kind === 'disable') {
    return {
      title: 'Disable this account?',
      description: `${mutation.user.email} will be immediately signed out and unable to log in until re-enabled.`,
      confirmText: 'Disable account',
    };
  }
  if (mutation.kind === 'enable') {
    return {
      title: 'Enable this account?',
      description: `${mutation.user.email} will be able to log in again.`,
      confirmText: 'Enable account',
    };
  }
  return {
    title: mutation.role === 'admin' ? 'Promote to admin?' : 'Remove admin access?',
    description:
      mutation.role === 'admin'
        ? `${mutation.user.email} will gain full admin portal access.`
        : `${mutation.user.email} will lose admin portal access and become a regular engineer.`,
    confirmText: mutation.role === 'admin' ? 'Promote' : 'Demote',
  };
}

export function AdminUsersPanel() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mode, setMode] = useState<'firebase' | 'local'>('firebase');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [mutating, setMutating] = useState(false);

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

  const confirmMutation = useCallback(async () => {
    if (!pendingMutation) return;
    setMutating(true);
    try {
      const body =
        pendingMutation.kind === 'setRole'
          ? { action: 'setRole', role: pendingMutation.role }
          : { action: pendingMutation.kind };

      const res = await authFetch(`/api/admin/users/${pendingMutation.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.description || data?.error || 'Failed to update user');
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === pendingMutation.user.id ? { ...u, ...data.user } : u)),
      );
      showToast('success', 'User updated', `${pendingMutation.user.email} was updated.`);
      setPendingMutation(null);
    } catch (err) {
      showToast('error', 'Update failed', err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setMutating(false);
    }
  }, [pendingMutation]);

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
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((user) => {
                  const isSelf = user.id === currentUserId;
                  return (
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
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            onClick={() =>
                              setPendingMutation({
                                kind: user.disabled ? 'enable' : 'disable',
                                user,
                              })
                            }
                            variant="outline"
                            size="sm"
                            disabled={isSelf}
                            title={isSelf ? 'You cannot change your own account' : undefined}
                          >
                            {user.disabled ? <Unlock size={14} /> : <Lock size={14} />}
                            {user.disabled ? 'Enable' : 'Disable'}
                          </Button>
                          <Button
                            onClick={() =>
                              setPendingMutation({
                                kind: 'setRole',
                                user,
                                role: user.role === 'admin' ? 'engineer' : 'admin',
                              })
                            }
                            variant="outline"
                            size="sm"
                            disabled={isSelf}
                            title={isSelf ? 'You cannot change your own account' : undefined}
                          >
                            {user.role === 'admin' ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                            {user.role === 'admin' ? 'Demote' : 'Promote'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
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
        Password resets and new-account provisioning are still handled via the admin CLI in this
        release.
      </p>

      {pendingMutation && (
        <ConfirmDialog
          open={Boolean(pendingMutation)}
          onClose={() => setPendingMutation(null)}
          onConfirm={confirmMutation}
          isLoading={mutating}
          variant={isDestructiveMutation(pendingMutation) ? 'destructive' : 'default'}
          {...mutationCopy(pendingMutation)}
        />
      )}
    </div>
  );
}
