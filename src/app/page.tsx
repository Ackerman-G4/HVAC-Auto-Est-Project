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
      <Card className="mb-8 border-0 bg-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <CardContent className="py-8 relative z-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full mb-4">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-blue-300">Engineering Automation Platform</span>
              </div>
              <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Welcome to HVAC-AEST-EA</h2>
              <p className="mt-2 text-sm text-slate-300 max-w-lg">
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
        <Card className="lg:col-span-2">
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
                        className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 hover:border-slate-300 hover:shadow-sm transition-all duration-200 group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5">
                            <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-accent transition-colors">
                              {project.name}
                            </h3>
                            <Badge variant={statusColor[project.status] || 'default'} size="sm">
                              {project.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {project.clientName || 'No client'} · {project.buildingType} · {project.location || 'No location'}
                          </p>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            {projectTR.toFixed(1)} TR
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
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
          

          <Card className="border-blue-200 bg-gradient-to-br from-blue-50/80 to-indigo-50/50">
            <CardHeader>
              <CardTitle className="text-base font-bold">Portfolio Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-white bg-white/70 p-4 shadow-sm">
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Selected Equipment</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? '—' : totalEquipment}</p>
              </div>
              <div className="rounded-xl border border-white bg-white/70 p-4 shadow-sm">
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">BOQ Line Items</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? '—' : totalBOQItems}</p>
              </div>
              <div className="rounded-xl border border-white bg-white/70 p-4 shadow-sm">
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Avg Items / Project</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
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



