'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Plus,
  TrendingUp,
  Thermometer,
  FolderOpen,
  ArrowRight,
  ReceiptText,
  Boxes,
  FileSpreadsheet,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { listContainerVariants, listItemVariants } from '@/animations/list-variants';
import Link from 'next/link';

interface DashboardProject {
  id: string;
  name: string;
  clientName: string;
  buildingType: string;
  status: string;
  location: string;
  totalFloorArea: number;
  updatedAt: string;
  floors: { rooms: { coolingLoad?: { trValue: number; totalLoad: number } | null }[] }[];
  _count: { selectedEquipment: number; boqItems: number };
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'draft').length;

  const totalTR = projects.reduce((sum, p) => {
    const projectTR = p.floors?.reduce((fSum, f) => {
      return fSum + f.rooms.reduce((rSum, r) => rSum + (r.coolingLoad?.trValue || 0), 0);
    }, 0) || 0;
    return sum + projectTR;
  }, 0);

  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const totalEquipment = projects.reduce((sum, p) => sum + (p._count?.selectedEquipment || 0), 0);
  const totalBOQItems = projects.reduce((sum, p) => sum + (p._count?.boqItems || 0), 0);

  const statusColor: Record<string, 'default' | 'success' | 'warning' | 'accent'> = {
    draft: 'default',
    active: 'accent',
    completed: 'success',
    archived: 'warning',
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Dashboard"
        description="Overview of your HVAC estimation projects"
        actions={
          <Link href="/projects/new">
            <Button variant="accent" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        }
      />

      <Card className="mb-6 border-accent/20 bg-linear-to-r from-accent/15 via-primary/10 to-secondary/20">
        <CardContent className="py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace Summary</p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">Your HVAC pipeline is ready to scale</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Track projects, generate BOQ, and export client-ready reports from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/projects/new">
                <Button variant="accent" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Start Project
                </Button>
              </Link>
              <Link href="/reports">
                <Button variant="secondary" size="sm">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Open Reports
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Projects"
          value={loading ? '—' : totalProjects}
          icon={FolderOpen}
        />
        <StatCard
          title="Active Projects"
          value={loading ? '—' : activeProjects}
          icon={Building2}
          trend={activeProjects > 0 ? { value: activeProjects, label: 'active' } : undefined}
        />
        <StatCard
          title="Total Cooling Load"
          value={loading ? '—' : `${totalTR.toFixed(1)} TR`}
          icon={Thermometer}
        />
        <StatCard
          title="Avg Load / Project"
          value={loading ? '—' : totalProjects > 0 ? `${(totalTR / totalProjects).toFixed(1)} TR` : '0 TR'}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Projects</CardTitle>
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : recentProjects.length === 0 ? (
              <EmptyState
                icon={<Building2 className="w-10 h-10" />}
                title="No projects yet"
                description="Create your first HVAC estimation project to get started"
                action={
                  <Link href="/projects/new">
                    <Button variant="accent" size="sm">
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Create Project
                    </Button>
                  </Link>
                }
              />
            ) : (
              <motion.div
                variants={listContainerVariants}
                initial="hidden"
                animate="visible"
                className="divide-y divide-border/50"
              >
                {recentProjects.map((project) => {
                  const projectTR = project.floors?.reduce((fSum, f) => {
                    return fSum + f.rooms.reduce((rSum, r) => rSum + (r.coolingLoad?.trValue || 0), 0);
                  }, 0) || 0;

                  return (
                    <motion.div key={project.id} variants={listItemVariants}>
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex items-center justify-between py-3 px-3 -mx-3 rounded-lg hover:bg-secondary/60 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[13px] font-medium text-foreground truncate">
                              {project.name}
                            </h3>
                            <Badge variant={statusColor[project.status] || 'default'} size="sm">
                              {project.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {project.clientName || 'No client'} · {project.buildingType} · {project.location || 'No location'}
                          </p>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-[13px] font-medium tabular-nums text-foreground">
                            {projectTR.toFixed(1)} TR
                          </p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {new Date(project.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/projects/new" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Project
                </Button>
              </Link>
              <Link href="/quotation" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  <ReceiptText className="w-4 h-4 mr-2" />
                  Generate Quotation
                </Button>
              </Link>
              <Link href="/materials" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  <Boxes className="w-4 h-4 mr-2" />
                  Manage Materials
                </Button>
              </Link>
              <Link href="/reports" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Open Reports
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-accent/20 bg-accent/5">
            <CardHeader>
              <CardTitle className="text-base">Portfolio Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Selected Equipment</p>
                <p className="text-2xl font-semibold text-foreground">{loading ? '—' : totalEquipment}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">BOQ Line Items</p>
                <p className="text-2xl font-semibold text-foreground">{loading ? '—' : totalBOQItems}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Average Items / Project</p>
                <p className="text-2xl font-semibold text-foreground">
                  {loading ? '—' : totalProjects > 0 ? (totalBOQItems / totalProjects).toFixed(1) : '0.0'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
