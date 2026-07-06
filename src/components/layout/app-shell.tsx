'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardCheck, FileSpreadsheet, MoonStar, Sun, UserCircle2 } from 'lucide-react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

interface AppShellProps {
  children: React.ReactNode;
}

const UI_THEME_STORAGE_KEY = 'hvac-ui-theme';
const UI_MODE_STORAGE_KEY = 'hvac-ui-mode';

function resolveWorkspaceTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/load-calculation')) return 'Load Calculation Workspace';
  if (pathname.startsWith('/airflow-duct-design')) return 'Airflow And Duct Design Workspace';
  if (pathname.startsWith('/equipment-selection')) return 'Equipment Selection Workspace';
  if (pathname.startsWith('/reports')) return 'Engineering Reports Workspace';
  return 'HVAC Engineering Platform';
}

function resolveWorkspaceSubtitle(pathname: string): string {
  if (pathname.startsWith('/load-calculation')) return 'Thermal analytics';
  if (pathname.startsWith('/airflow-duct-design')) return 'Air distribution';
  if (pathname.startsWith('/equipment-selection')) return 'Plant optimization';
  if (pathname.startsWith('/reports')) return 'Decision reporting';
  return 'Program cockpit';
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useUIStore((state) => state.theme);
  const workspaceMode = useUIStore((state) => state.workspaceMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const setWorkspaceMode = useUIStore((state) => state.setWorkspaceMode);
  const user = useAuthStore((state) => state.user);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const logout = useAuthStore((state) => state.logout);

  const isAuthRoute = pathname.startsWith('/auth');

  React.useEffect(() => {
    if (isAuthRoute) {
      return;
    }

    void initializeAuth();
  }, [initializeAuth, isAuthRoute]);

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

  if (isAuthRoute) {
    return (
      <div className="relative min-h-screen overflow-hidden font-sans text-[color:var(--foreground)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(20,134,115,0.16),transparent_38%),radial-gradient(circle_at_86%_0%,rgba(202,123,46,0.16),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(31,63,98,0.16),transparent_44%)]" />
        <div className="pointer-events-none absolute -left-24 top-[-120px] h-[360px] w-[360px] rounded-full bg-[rgba(20,134,115,0.2)] blur-3xl animate-soft-float" />
        <div className="pointer-events-none absolute -right-24 bottom-[-120px] h-[360px] w-[360px] rounded-full bg-[rgba(202,123,46,0.2)] blur-3xl animate-soft-float" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.2] [background-image:linear-gradient(to_right,rgba(31,63,98,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(31,63,98,0.08)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(circle_at_center,black_34%,transparent_82%)]" />
        <div className="relative z-10 animate-fade-rise">{children}</div>
        <ToastContainer />
      </div>
    );
  }

  const workspaceTitle = resolveWorkspaceTitle(pathname);
  const workspaceSubtitle = resolveWorkspaceSubtitle(pathname);

  return (
    <div className="relative flex min-h-screen overflow-hidden font-sans text-[color:var(--foreground)]">
      <Sidebar />
      <main className="relative w-full flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(20,134,115,0.12),transparent_36%),radial-gradient(circle_at_90%_2%,rgba(202,123,46,0.14),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(31,63,98,0.16),transparent_44%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.24] [background-image:linear-gradient(to_right,rgba(31,63,98,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(31,63,98,0.07)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(circle_at_center,black_30%,transparent_84%)]" />
        <div className="relative z-10 mx-auto min-h-screen w-full max-w-[var(--content-max-width)] px-[var(--space-page-x)] pb-16 pt-[var(--space-page-y)] lg:pb-20">
          <header className="animate-fade-rise sticky top-4 z-30 mb-8 overflow-hidden rounded-[1.5rem] border border-[color:var(--border)] bg-[linear-gradient(125deg,color-mix(in_oklab,var(--card)_88%,transparent),color-mix(in_oklab,var(--brand-paper)_70%,transparent))] shadow-[0_26px_48px_-32px_rgba(31,63,98,0.7)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(20,134,115,0.55),transparent)]" />
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 pl-16 lg:pl-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--muted-foreground)]">
                  {workspaceSubtitle}
                </p>
                <h1 className="display-heading truncate text-[1.55rem] font-extrabold tracking-[-0.03em] text-[color:var(--foreground)] sm:text-[1.85rem]">
                  {workspaceTitle}
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--secondary)]/68 p-1.5 md:flex">
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode('beginner')}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                      workspaceMode === 'beginner'
                        ? 'bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_12px_22px_-16px_rgba(31,63,98,0.68)]'
                        : 'text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]'
                    }`}
                  >
                    Beginner
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode('professional')}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                      workspaceMode === 'professional'
                        ? 'bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_12px_22px_-16px_rgba(31,63,98,0.68)]'
                        : 'text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]'
                    }`}
                  >
                    Professional
                  </button>
                </div>

                <Link href="/load-calculation" className="hidden sm:block">
                  <Button size="sm" variant="accent">
                    <FileSpreadsheet size={14} className="mr-1.5" />
                    Open Calculator
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
                  className="hidden sm:inline-flex"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <MoonStar size={16} />}
                </Button>

                <button
                  type="button"
                  className="hidden h-12 items-center rounded-xl border border-[color:var(--border)] bg-[linear-gradient(125deg,color-mix(in_oklab,var(--card)_92%,transparent),color-mix(in_oklab,var(--secondary)_58%,transparent))] px-4 text-[15px] font-semibold text-[color:var(--foreground)] shadow-[0_14px_24px_-20px_rgba(31,63,98,0.74)] transition-colors hover:bg-[color:var(--secondary)] md:flex"
                >
                  <UserCircle2 size={16} className="mr-1.5 text-[color:var(--muted-foreground)]" />
                  {user?.name || user?.email || 'Engineer'}
                </button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="border border-transparent hover:border-[color:var(--border)]"
                  onClick={async () => {
                    await logout();
                    router.replace('/auth/login');
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </header>

          <div className="relative pb-4">
            {children}
          </div>
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
