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

      {/* Hero Card */}
      <Card className="relative mb-8 overflow-hidden border border-border/65 bg-[linear-gradient(138deg,rgba(19,32,51,0.98),rgba(27,46,71,0.95))] text-white shadow-[0_22px_38px_-30px_rgba(19,32,51,0.9)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_24%,rgba(15,139,141,0.26),transparent_48%)]" />
        <div className="absolute right-0 top-0 h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full bg-[rgba(228,220,184,0.18)] blur-3xl" />
        <CardContent className="py-8 relative z-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[rgba(228,220,184,0.32)] bg-[rgba(228,220,184,0.16)] px-3 py-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--gold)]" />
                <span className="text-xs font-medium text-[rgba(245,238,211,0.92)]">Engineering Automation Platform</span>
              </div>
              <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Welcome to HVAC-AEST-EA</h2>
              <p className="mt-2 max-w-lg text-sm text-[rgba(255,255,255,0.76)]">
                Streamline your HVAC estimation workflow with intelligent load calculations, automated equipment sizing, and professional BOQ generation.
              </p>
            </div>
            
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
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
        <Card className="lg:col-span-2 border-border/65 bg-card/90 shadow-[0_14px_28px_-24px_rgba(19,32,51,0.68)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Projects</CardTitle>
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : recentProjects.length === 0 ? (
              <EmptyState
                icon={<Building2 className="w-12 h-12" />}
                title="No projects yet"
                description="Create your first HVAC estimation project to get started"
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
                variants={listContainerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-2"
              >
                {recentProjects.map((project) => {
                  const projectTR = project.floors?.reduce((fSum, f) => {
                    return fSum + f.rooms.reduce((rSum, r) => rSum + (r.coolingLoad?.trValue || 0), 0);
                  }, 0) || 0;

                  return (
                    <motion.div key={project.id} variants={listItemVariants}>
                      <Link
                        href={`/projects/${project.id}`}
                        className="group flex items-center justify-between rounded-xl border border-border/60 bg-card/75 p-4 transition-all duration-200 hover:border-border hover:bg-card hover:shadow-[0_14px_24px_-22px_rgba(19,32,51,0.72)]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5">
                            <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-[color:var(--accent-dark)]">
                              {project.name}
                            </h3>
                            <Badge variant={statusColor[project.status] || 'default'} size="sm">
                              {project.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {project.clientName || 'No client'} · {project.buildingType} · {project.location || 'No location'}
                          </p>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-sm font-bold tabular-nums text-foreground">
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
          

          <Card className="border-border/70 bg-[linear-gradient(162deg,rgba(15,139,141,0.14),rgba(255,255,255,0.9))] shadow-[0_14px_28px_-24px_rgba(19,32,51,0.68)]">
            <CardHeader>
              <CardTitle className="text-base font-bold">Portfolio Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-[0_14px_24px_-24px_rgba(19,32,51,0.7)]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected Equipment</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{loading ? '—' : totalEquipment}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-[0_14px_24px_-24px_rgba(19,32,51,0.7)]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">BOQ Line Items</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{loading ? '—' : totalBOQItems}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-[0_14px_24px_-24px_rgba(19,32,51,0.7)]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Items / Project</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
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



