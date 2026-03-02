'use client';

import React from 'react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto pt-14 lg:pt-6">
          {children}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
