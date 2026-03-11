'use client';

import React from 'react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/AuthContext';
import LoginPage from '@/app/login/page';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto w-full relative">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] pointer-events-none mix-blend-overlay"></div>
        <div className="max-w-[1800px] mx-auto px-4 py-8 sm:px-8 lg:px-12 w-full pt-24 lg:pt-12 min-h-screen relative z-10">
          {children}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
