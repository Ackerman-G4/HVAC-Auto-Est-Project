'use client';

import React from 'react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background/95">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 max-w-465 mx-auto pt-14 lg:pt-6">
          {children}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
