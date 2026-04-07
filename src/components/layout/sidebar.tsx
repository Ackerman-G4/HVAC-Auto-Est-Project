'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FolderOpen,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Menu,
  X,
  FileText,
  Receipt,
  Stethoscope,
  Wind,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { sidebarVariants } from '@/animations/shared';
import { useUIStore } from '@/stores/ui-store';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/projects', label: 'Load Calculation', icon: FolderOpen },
  { href: '/simulation', label: 'Ducting & CFD', icon: Wind },
  { href: '/quotation', label: 'Equipment & BOQ', icon: Receipt },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/materials', label: 'Materials & Suppliers', icon: Package },
  { href: '/diagnostics', label: 'Diagnostics', icon: Stethoscope },
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

  const sidebarContent = (
    <div className="relative z-10 flex h-full flex-col border-r border-[color:var(--border)] bg-[color:var(--card)]/92 shadow-[12px_0_44px_-32px_rgba(19,32,51,0.52)] backdrop-blur-xl">
      <div
        className={cn(
          'flex h-[86px] shrink-0 items-center gap-3 border-b border-[color:var(--border)] px-6',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(140deg,var(--accent),var(--accent-dark))] text-[color:var(--accent-foreground)] shadow-[0_10px_25px_-10px_rgba(15,139,141,0.8)]">
          <Zap size={24} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.26em] text-[color:var(--muted-foreground)]">
              Field Studio
            </span>
            <span className="block text-xl font-black tracking-tight text-[color:var(--foreground)]">
              HVAC Estimator
            </span>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-8">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3.5 rounded-2xl border px-3.5 py-3 text-[14px] font-semibold tracking-[0.01em] transition-all duration-300',
                collapsed ? 'justify-center' : '',
                active
                  ? 'border-[rgba(15,139,141,0.3)] bg-[rgba(15,139,141,0.12)] text-[color:var(--accent-dark)] shadow-[0_10px_22px_-18px_rgba(15,139,141,0.95)]'
                  : 'border-transparent text-[color:var(--muted-foreground)] hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)]/75 hover:text-[color:var(--foreground)]'
              )}
            >
              <item.icon
                size={20}
                className={cn(
                  'shrink-0 transition-transform duration-300 group-hover:scale-110',
                  active
                    ? 'text-[color:var(--accent)]'
                    : 'text-[color:var(--silver)] group-hover:text-[color:var(--accent)]'
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              {!collapsed && <span className="truncate tracking-wide">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-[color:var(--border)] p-5 lg:flex">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-3 text-sm font-semibold text-[color:var(--muted-foreground)] transition-all duration-300 hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)] hover:text-[color:var(--foreground)]"
        >
          {collapsed ? <ChevronRight size={20} /> : <><ChevronLeft size={20} /><span>Collapse Setup</span></>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileSidebar(true)}
        className="fixed left-4 top-4 z-50 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-2.5 text-[color:var(--foreground)] shadow-[0_10px_24px_-16px_rgba(19,32,51,0.5)] transition-colors hover:bg-[color:var(--secondary)] lg:hidden"
      >
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[rgba(19,32,51,0.45)] backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              className="fixed bottom-0 left-0 top-0 z-50 w-[288px] bg-[color:var(--card)] shadow-2xl lg:hidden"
              variants={sidebarVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <button
                onClick={() => setMobileSidebar(false)}
                className="absolute right-5 top-5 z-50 rounded-lg p-2 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--secondary)] hover:text-[color:var(--foreground)]"
              >
                <X size={20} />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out z-40',
          collapsed ? 'w-[80px]' : 'w-[280px]'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
