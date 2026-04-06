'use client';

import React from 'react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative flex h-screen overflow-hidden font-sans text-[color:var(--foreground)]">
      <Sidebar />
      <main className="relative w-full flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(15,139,141,0.13),transparent_34%),radial-gradient(circle_at_86%_4%,rgba(219,142,47,0.1),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.24] [background-image:linear-gradient(to_right,rgba(19,32,51,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(19,32,51,0.06)_1px,transparent_1px)] [background-size:34px_34px] [mask-image:radial-gradient(circle_at_center,black_28%,transparent_84%)]" />
        <div className="relative z-10 mx-auto min-h-screen w-full max-w-[1800px] px-4 py-8 pt-24 sm:px-8 lg:px-12 lg:pt-12">
          {children}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
