'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  ScrollText,
  Coins,
  ShieldAlert,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { AdminUsersPanel } from '@/components/admin/admin-users-panel';
import { AdminProjectsPanel } from '@/components/admin/admin-projects-panel';
import { AdminAuditLogPanel } from '@/components/admin/admin-audit-log-panel';
import { AdminPricesPanel } from '@/components/admin/admin-prices-panel';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
  { id: 'users', label: 'Users', icon: <Users size={15} /> },
  { id: 'projects', label: 'All Projects', icon: <FolderKanban size={15} /> },
  { id: 'audit', label: 'Audit Log', icon: <ScrollText size={15} /> },
  { id: 'pricing', label: 'Price Controls', icon: <Coins size={15} /> },
];

export default function AdminPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState('dashboard');

  if (user && user.role !== 'admin') {
    return (
      <PageWrapper>
        <EmptyState
          icon={<ShieldAlert size={28} />}
          title="Admin access required"
          description="Your account does not have permission to view the admin portal."
          action={
            <Button onClick={() => router.push('/')} variant="primary">
              Back to Dashboard
            </Button>
          }
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Admin Portal"
        description="User management, audit trail, and financial controls"
        actions={<Badge variant="warning">Admin</Badge>}
      />
      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'users' && <AdminUsersPanel />}
        {activeTab === 'projects' && <AdminProjectsPanel />}
        {activeTab === 'audit' && <AdminAuditLogPanel />}
        {activeTab === 'pricing' && <AdminPricesPanel />}
      </Tabs>
    </PageWrapper>
  );
}
