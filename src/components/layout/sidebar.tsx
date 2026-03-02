'use client';

import React, { useState } from 'react';
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
  Snowflake,
  Menu,
  X,
  FileText,
  Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { sidebarVariants } from '@/animations/shared';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/materials', label: 'Materials & Suppliers', icon: Package },
  { href: '/reports', label: 'Reports & Export', icon: FileText },
  { href: '/quotation', label: 'Quotation', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 px-5 h-14 border-b border-border/60 flex-shrink-0',
        collapsed && 'justify-center px-0'
      )}>
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
          <Snowflake size={16} className="text-accent-foreground" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-[13px] font-semibold text-foreground tracking-tight truncate">HVAC AutoEst</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">Estimation System</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 relative',
              collapsed && 'justify-center px-0',
              isActive(item.href)
                ? 'bg-accent/[0.08] text-accent'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <item.icon size={17} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Collapse button (desktop only) */}
      <div className="hidden lg:flex border-t border-border/60 p-2.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /><span>Collapse</span></>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-card border border-border/60 shadow-sm hover:bg-secondary transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="lg:hidden fixed left-0 top-0 bottom-0 w-60 bg-card border-r border-border/60 z-50 shadow-xl"
              variants={sidebarVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              >
                <X size={18} />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen bg-card border-r border-border/60 flex-shrink-0 transition-all duration-300',
          collapsed ? 'w-16' : 'w-[252px]'
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
