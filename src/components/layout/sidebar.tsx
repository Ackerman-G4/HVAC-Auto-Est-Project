'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  FileText,
  Wind,
  Cpu,
  FolderKanban,
  Settings,
  Wrench,
  Stethoscope,
  ClipboardList,
} from 'lucide-react';
import { HvacLogo } from '@/components/ui/hvac-logo';
import { cn } from '@/lib/utils/cn';
import { sidebarVariants } from '@/animations/shared';
import { useUIStore } from '@/stores/ui-store';
import { Z } from '@/lib/utils/z-indexes';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const mainNav: NavEntry[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'Estimation',
    icon: ClipboardList,
    children: [
      { href: '/load-calculation', label: 'Load Calculation', icon: Calculator },
      { href: '/airflow-duct-design', label: 'Airflow & Duct', icon: Wind },
      { href: '/equipment-selection', label: 'Equipment & Costing', icon: Cpu },
    ],
  },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/materials', label: 'Tools Inventory', icon: Wrench },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/quotation', label: 'Quotation', icon: ClipboardList },
];

const bottomNav: NavItem[] = [
  { href: '/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUIStore((state) => state.mobileSidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setMobileSidebar = useUIStore((state) => state.setMobileSidebar);
  const [estimationOpen, setEstimationOpen] = React.useState(false);

  // Auto-expand estimation group when a child route is active
  const estimationGroup = mainNav.find((e) => isGroup(e) && e.label === 'Estimation') as NavGroup | undefined;
  const estimationChildActive = estimationGroup?.children.some((c) => pathname.startsWith(c.href)) ?? false;

  React.useEffect(() => {
    if (estimationChildActive) setEstimationOpen(true);
  }, [estimationChildActive]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const renderNavItem = (item: NavItem, indent = false) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileSidebar(false)}
        title={collapsed ? item.label : undefined}
        className={cn(
          'group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
          collapsed ? 'justify-center' : '',
          indent && !collapsed ? 'ml-4 pl-4' : '',
          active
            ? 'bg-primary/16 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]'
            : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
        )}
      >
        {active && <span className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-primary" />}
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

  const renderNavGroup = (group: NavGroup) => {
    const isChildActive = group.children.some((c) => pathname.startsWith(c.href));
    const isOpen = estimationOpen;
    return (
      <div key={group.label}>
        <button
          type="button"
          onClick={() => {
            if (collapsed) return;
            setEstimationOpen(!isOpen);
          }}
          title={collapsed ? group.label : undefined}
          className={cn(
            'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
            collapsed ? 'justify-center' : '',
            isChildActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
          )}
        >
          {isChildActive && <span className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-primary" />}
          <group.icon
            size={18}
            className={cn('shrink-0', isChildActive ? 'text-primary' : 'text-muted-foreground')}
            strokeWidth={isChildActive ? 2.2 : 1.8}
          />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">{group.label}</span>
              <ChevronDown
                size={14}
                className={cn(
                  'shrink-0 text-muted-foreground transition-transform duration-200',
                  isOpen ? 'rotate-0' : '-rotate-90'
                )}
              />
            </>
          )}
        </button>
        {!collapsed && (
          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {group.children.map((child) => renderNavItem(child, true))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    );
  };

  const renderEntry = (entry: NavEntry) => {
    if (isGroup(entry)) return renderNavGroup(entry);
    return renderNavItem(entry);
  };

  const sidebarContent = (
    <div className="relative z-10 flex h-full flex-col panel-glass shadow-[1px_0_0_0_var(--border)]">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-3 border-b border-border/70 px-5',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-primary to-accent text-white shadow-md">
          <HvacLogo variant="mono" size={22} className="text-white" />
        </div>
        {!collapsed && (
          <span className="display-heading text-base font-semibold tracking-tight text-foreground">
            HVAC Studio
          </span>
        )}
      </div>

      <nav className="relative flex flex-1 flex-col overflow-y-auto px-3 py-5">
        <div className="flex flex-col gap-1">
          {mainNav.map(renderEntry)}
        </div>

        <div className="flex-1" />

        <div className="border-t border-border pt-4">
          <div className="flex flex-col gap-1">
            {bottomNav.map((item) => renderNavItem(item))}
          </div>
        </div>
      </nav>

      <div className="hidden border-t border-border p-4 md:flex">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
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
          className="fixed left-3 top-3 rounded-xl border border-border bg-card/90 p-2.5 text-foreground shadow-md transition-colors hover:bg-secondary md:hidden"
          style={{ zIndex: Z.modal }}
          aria-label="Open navigation menu"
        >
        <Menu size={18} />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm md:hidden"
              style={{ zIndex: Z.sidebar }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              className="fixed bottom-0 left-0 top-0 w-[min(86vw,20rem)] panel-glass shadow-xl md:hidden"
              style={{ zIndex: Z.modal }}
              variants={sidebarVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <button
                onClick={() => setMobileSidebar(false)}
                className="absolute right-4 top-4 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                style={{ zIndex: Z.modal }}
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
          'hidden md:flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out',
          collapsed ? 'w-18' : 'w-70'
        )}
        style={{ zIndex: Z.sidebar }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
