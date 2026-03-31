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
  Zap,
  Menu,
  X,
  FileText,
  Receipt,
  Stethoscope,
  Wind,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { sidebarVariants } from '@/animations/shared';
import { useAuth } from '@/lib/auth/AuthContext';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/simulation', label: 'CFD Simulation', icon: Wind },
  { href: '/materials', label: 'Materials & Suppliers', icon: Package },
  { href: '/reports', label: 'Reports & Export', icon: FileText },
  { href: '/quotation', label: 'Quotation', icon: Receipt },
  { href: '/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 shadow-[4px_0_24px_-4px_rgba(0,0,0,0.02)] z-10 relative">
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-4 px-6 h-[80px] shrink-0 border-b border-slate-100 bg-white/50 backdrop-blur-xl',
        collapsed && 'justify-center px-0'
      )}>
        <div className="flex items-center justify-center p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
          <Zap size={24} className="text-white" />
        </div>
        {!collapsed && <span className="font-extrabold text-2xl tracking-tighter text-slate-900">HVAC<span className="text-blue-600">APP</span></span>}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 py-8 flex flex-col gap-2 px-4 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3.5 px-3 py-3 rounded-xl text-[15px] font-bold transition-all duration-300',
                collapsed ? 'justify-center' : '',
                active
                  ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 border border-transparent hover:border-slate-200/50'
              )}
            >
              <item.icon size={20} className={cn('shrink-0 transition-transform duration-300 group-hover:scale-110', active ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600')} strokeWidth={active ? 2.5 : 2} />
              {!collapsed && <span className="truncate tracking-wide">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/30">
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-3 py-4 mb-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'} className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                <UserIcon size={20} />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-extrabold text-slate-900 truncate">{user.displayName || 'Engineer'}</span>
              <span className="text-[11px] font-bold text-slate-400 truncate">{user.email}</span>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all duration-300 group",
            collapsed && "justify-center"
          )}
        >
          <LogOut size={20} className="shrink-0 transition-transform group-hover:scale-110" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

      {/* Collapse button (desktop only) */}
      <div className="hidden lg:flex p-5 border-t border-slate-100 bg-white">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-slate-900 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all duration-300"
        >
          {collapsed ? <ChevronRight size={20} /> : <><ChevronLeft size={20} /><span>Minimize</span></>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-lg bg-white border border-slate-200 shadow-sm text-slate-900 hover:bg-slate-50 transition-colors"
      >
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[280px] bg-white z-50 shadow-2xl"
              variants={sidebarVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-5 right-5 p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors z-50"
              >
                <X size={20} />
              </button>
              <SidebarContent />
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
        <SidebarContent />
      </aside>
    </>
  );
}
