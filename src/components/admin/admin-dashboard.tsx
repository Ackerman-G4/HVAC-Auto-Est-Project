'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  FolderKanban,
  Activity,
  Coins,
  ShieldAlert,
  History,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatPHP } from '@/lib/utils/format-currency';
import { cn } from '@/lib/utils/cn';

interface SecurityAlert {
  id: string;
  label: string;
  severity: 'info' | 'warning' | 'critical';
}

interface ActivityEntry {
  id: string;
  projectId: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalProjects: number;
  activeProjects: number;
  archivedProjects: number;
  totalBoqValuePhp: number;
  boqSnapshotCount: number;
  loginFailures24h: number;
  recentActivity: ActivityEntry[];
  securityAlerts: SecurityAlert[];
}

const SEVERITY_STYLES: Record<SecurityAlert['severity'], string> = {
  info: 'border-border/70 bg-secondary/50 text-muted-foreground',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  critical: 'border-destructive/30 bg-destructive/10 text-destructive',
};

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/stats');
      if (!res.ok) throw new Error('Failed to load dashboard');
      const data = await res.json();
      setStats(data.stats as AdminStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <EmptyState
        icon={<ShieldAlert size={28} />}
        title="Could not load dashboard"
        description={error ?? 'No data available.'}
        action={
          <Button onClick={load} variant="outline">
            <RefreshCw size={16} /> Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Users" value={stats.totalUsers} icon={Users} />
        <StatCard
          title="Total Projects"
          value={stats.totalProjects}
          subtitle={`${stats.activeProjects} active · ${stats.archivedProjects} archived`}
          icon={FolderKanban}
        />
        <StatCard title="Active Projects" value={stats.activeProjects} icon={Activity} />
        <StatCard
          title="Locked BOQ Value"
          value={formatPHP(stats.totalBoqValuePhp)}
          subtitle="Sum of latest per-project snapshots"
          icon={Coins}
        />
        <StatCard title="BOQ Snapshots" value={stats.boqSnapshotCount} icon={Lock} />
        <StatCard
          title="Failed Logins (24h)"
          value={stats.loginFailures24h}
          icon={ShieldAlert}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-warning" /> Security Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.securityAlerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'flex items-center gap-3 rounded-md border px-4 py-3 text-sm font-medium',
                  SEVERITY_STYLES[alert.severity],
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                {alert.label}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History size={18} className="text-primary" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {stats.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        <span className="text-primary">{entry.action}</span>
                        {' · '}
                        {entry.entity}
                      </p>
                      {entry.details && (
                        <p className="truncate text-xs text-muted-foreground">{entry.details}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {relativeTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
