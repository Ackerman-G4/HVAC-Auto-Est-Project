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
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { sidebarVariants } from '@/animations/shared';
import { useUIStore } from '@/stores/ui-store';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/load-calculation', label: 'Load Calculation', icon: Calculator },
  { href: '/airflow-duct-design', label: 'Airflow / Duct Design', icon: Wind },
  { href: '/equipment-selection', label: 'Equipment Selection', icon: Cpu },
  { href: '/simulation', label: 'Simulation', icon: Activity },
  { href: '/reports', label: 'Reports', icon: FileText },
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
    <div className="relative z-10 flex h-full flex-col border-r border-[color:var(--border)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--card)_92%,transparent),color-mix(in_oklab,var(--brand-paper)_62%,transparent))] shadow-[16px_0_46px_-30px_rgba(31,63,98,0.48)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(20,134,115,0.15),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(202,123,46,0.15),transparent_34%)]" />
      <div
        className={cn(
          'relative flex h-[104px] shrink-0 items-center gap-3 border-b border-[color:var(--border)] px-7',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.3)] bg-[linear-gradient(140deg,var(--accent),var(--accent-dark))] text-[color:var(--accent-foreground)] shadow-[0_14px_30px_-12px_rgba(20,134,115,0.84)]">
          <Zap size={24} />
        </div>
        {!collapsed && (
          <div className="leading-tight space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[color:var(--muted-foreground)]">
              Field Studio
            </span>
            <span className="display-heading block text-[1.45rem] font-black tracking-[-0.03em] text-[color:var(--foreground)]">
              HVAC Estimator
            </span>
          </div>
        )}
      </div>

      <nav className="relative flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-10">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3.5 overflow-hidden rounded-[1.05rem] border px-4 py-3.5 text-[15px] font-semibold tracking-[0.01em] transition-all duration-300',
                collapsed ? 'justify-center' : '',
                active
                  ? 'border-[rgba(20,134,115,0.38)] bg-[linear-gradient(125deg,rgba(20,134,115,0.16),rgba(31,63,98,0.09))] text-[color:var(--accent-dark)] shadow-[0_14px_24px_-18px_rgba(20,134,115,0.95)]'
                  : 'border-transparent text-[color:var(--muted-foreground)] hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)]/76 hover:text-[color:var(--foreground)]'
              )}
            >
              {active && <span className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-[color:var(--accent)]" />}
              <item.icon
                size={21}
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

      <div className="hidden border-t border-[color:var(--border)] p-6 lg:flex">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-3.5 text-sm font-semibold text-[color:var(--muted-foreground)] transition-all duration-300 hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)]/82 hover:text-[color:var(--foreground)]"
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
        className="fixed left-4 top-5 z-50 rounded-xl border border-[color:var(--border)] bg-[linear-gradient(125deg,color-mix(in_oklab,var(--card)_92%,transparent),color-mix(in_oklab,var(--secondary)_62%,transparent))] p-3 text-[color:var(--foreground)] shadow-[0_14px_24px_-18px_rgba(31,63,98,0.64)] transition-colors hover:bg-[color:var(--secondary)] lg:hidden"
      >
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[rgba(19,35,33,0.48)] backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              className="fixed bottom-0 left-0 top-0 z-50 w-[312px] bg-[color:var(--card)] shadow-2xl lg:hidden"
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
          collapsed ? 'w-[88px]' : 'w-[304px]'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
