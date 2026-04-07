'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, MoonStar, Plus, Sun, UserCircle2 } from 'lucide-react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';

interface AppShellProps {
  children: React.ReactNode;
}

const UI_THEME_STORAGE_KEY = 'hvac-ui-theme';
const UI_MODE_STORAGE_KEY = 'hvac-ui-mode';

function resolveWorkspaceTitle(pathname: string): string {
  if (pathname === '/') return 'Operations Overview';
  if (pathname.startsWith('/projects/')) return 'Project Engineering Workspace';
  if (pathname.startsWith('/projects')) return 'Load Calculation Workspace';
  if (pathname.startsWith('/simulation')) return 'Ducting & CFD Workspace';
  if (pathname.startsWith('/quotation')) return 'Equipment & BOQ Workspace';
  if (pathname.startsWith('/reports')) return 'Reporting Workspace';
  if (pathname.startsWith('/materials')) return 'Materials & Supplier Workspace';
  if (pathname.startsWith('/diagnostics')) return 'Diagnostics Workspace';
  if (pathname.startsWith('/settings')) return 'Settings & Defaults Workspace';
  return 'HVAC Engineering Workspace';
}

function resolveWorkspaceSubtitle(pathname: string): string {
  if (pathname.startsWith('/projects')) return 'Engineer lane';
  if (pathname.startsWith('/quotation')) return 'Estimator lane';
  if (pathname.startsWith('/reports')) return 'Client lane';
  return 'Control center';
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const theme = useUIStore((state) => state.theme);
  const workspaceMode = useUIStore((state) => state.workspaceMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const setWorkspaceMode = useUIStore((state) => state.setWorkspaceMode);

  React.useEffect(() => {
    const savedTheme = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
    const savedMode = window.localStorage.getItem(UI_MODE_STORAGE_KEY);

    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
    if (savedMode === 'beginner' || savedMode === 'professional') {
      setWorkspaceMode(savedMode);
    }
  }, [setTheme, setWorkspaceMode]);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
  }, [theme]);

  React.useEffect(() => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, workspaceMode);
  }, [workspaceMode]);

  const workspaceTitle = resolveWorkspaceTitle(pathname);
  const workspaceSubtitle = resolveWorkspaceSubtitle(pathname);

  return (
    <div className="relative flex h-screen overflow-hidden font-sans text-[color:var(--foreground)]">
      <Sidebar />
      <main className="relative w-full flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(11,127,145,0.14),transparent_34%),radial-gradient(circle_at_86%_4%,rgba(196,122,27,0.12),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.25] [background-image:linear-gradient(to_right,rgba(15,28,43,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,28,43,0.08)_1px,transparent_1px)] [background-size:34px_34px] [mask-image:radial-gradient(circle_at_center,black_28%,transparent_84%)]" />
        <div className="relative z-10 mx-auto min-h-screen w-full max-w-[1800px] px-4 pb-8 pt-5 sm:px-8 lg:px-12">
          <header className="sticky top-3 z-30 mb-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/85 shadow-[0_18px_34px_-26px_rgba(15,28,43,0.55)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
              <div className="min-w-0 pl-14 lg:pl-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">
                  {workspaceSubtitle}
                </p>
                <h1 className="truncate text-lg font-extrabold tracking-tight text-[color:var(--foreground)] sm:text-xl">
                  {workspaceTitle}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--secondary)]/60 p-1 md:flex">
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode('beginner')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      workspaceMode === 'beginner'
                        ? 'bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_8px_18px_-14px_rgba(15,28,43,0.65)]'
                        : 'text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]'
                    }`}
                  >
                    Beginner
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode('professional')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      workspaceMode === 'professional'
                        ? 'bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_8px_18px_-14px_rgba(15,28,43,0.65)]'
                        : 'text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]'
                    }`}
                  >
                    Professional
                  </button>
                </div>

                <Link href="/projects/new" className="hidden sm:block">
                  <Button size="sm" variant="accent">
                    <Plus size={14} className="mr-1.5" />
                    New Project
                  </Button>
                </Link>

                <Link href="/reports" className="hidden lg:block">
                  <Button size="sm" variant="secondary">
                    <ClipboardCheck size={14} className="mr-1.5" />
                    Export
                  </Button>
                </Link>

                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                >
                  {theme === 'dark' ? <Sun size={16} /> : <MoonStar size={16} />}
                </Button>

                <button
                  type="button"
                  className="hidden h-11 items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 text-sm font-semibold text-[color:var(--foreground)] shadow-[0_10px_20px_-20px_rgba(15,28,43,0.6)] transition-colors hover:bg-[color:var(--secondary)] md:flex"
                >
                  <UserCircle2 size={16} className="mr-1.5 text-[color:var(--muted-foreground)]" />
                  Engineer
                </button>
              </div>
            </div>
          </header>

          <div className="relative pb-2">
            {children}
          </div>
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
