'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Calculator,
  Activity,
  ChevronLeft,
  ChevronRight,
  Zap,
  Menu,
  X,
  FileText,
  Wind,
  Cpu,
  FolderKanban,
  Settings,
  Columns3,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { sidebarVariants } from '@/animations/shared';
import { useUIStore } from '@/stores/ui-store';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/load-calculation', label: 'Load Calculation', icon: Calculator },
  { href: '/airflow-duct-design', label: 'Airflow & Duct', icon: Wind },
  { href: '/equipment-selection', label: 'Equipment & Costing', icon: Cpu },
  { href: '/reports', label: 'Reports', icon: FileText },
];

const externalNavItems: NavItem[] = [
  { href: '/simulation/workspace', label: 'CFD Workspace', icon: Columns3 },
  { href: '/simulation', label: 'CFD Simulator', icon: Activity },
];

const bottomNavItems: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUIStore((state) => state.mobileSidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setMobileSidebar = useUIStore((state) => state.setMobileSidebar);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileSidebar(false)}
        className={cn(
          'group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors duration-150',
          collapsed ? 'justify-center' : '',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        {active && <span className="absolute inset-y-0 left-0 w-0.75 rounded-r-full bg-primary" />}
        <item.icon
          size={18}
          className={cn(
            'shrink-0',
            active ? 'text-primary' : 'text-muted-foreground'
          )}
          strokeWidth={active ? 2.2 : 1.8}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="relative z-10 flex h-full flex-col bg-card shadow-[1px_0_0_0_var(--border)]">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-3 border-b border-border px-5',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
          <Zap size={18} />
        </div>
        {!collapsed && (
          <span className="display-heading text-base font-semibold tracking-tight text-foreground">
            HVAC Studio
          </span>
        )}
      </div>

      <nav className="relative flex flex-1 flex-col overflow-y-auto px-3 py-5">
        <div className="flex flex-col gap-1">
          {mainNavItems.map(renderNavItem)}
        </div>

        <div className="my-4 border-t border-border" />
        <div className="flex flex-col gap-1">
          {externalNavItems.map(renderNavItem)}
        </div>

        <div className="flex-1" />

        <div className="border-t border-border pt-4">
          <div className="flex flex-col gap-1">
            {bottomNavItems.map(renderNavItem)}
          </div>
        </div>
      </nav>

      <div className="hidden border-t border-border p-4 lg:flex">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /><span>Collapse</span></>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
          onClick={() => setMobileSidebar(true)}
          className="fixed left-4 top-4 z-50 rounded-lg border border-border bg-card p-2.5 text-foreground shadow-sm transition-colors hover:bg-secondary lg:hidden"
          aria-label="Open navigation menu"
        >
        <Menu size={18} />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              className="fixed bottom-0 left-0 top-0 z-50 w-70 bg-card shadow-xl lg:hidden"
              variants={sidebarVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <button
                onClick={() => setMobileSidebar(false)}
                className="absolute right-4 top-4 z-50 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out z-40',
          collapsed ? 'w-18' : 'w-70'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
