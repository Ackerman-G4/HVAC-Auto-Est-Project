'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MoonStar, Sun, UserCircle2 } from 'lucide-react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

interface AppShellProps {
  children: React.ReactNode;
}

const UI_THEME_STORAGE_KEY = 'hvac-ui-theme';

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
  const setTheme = useUIStore((state) => state.setTheme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
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

    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
  }, [setTheme]);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
  }, [theme]);

  if (isAuthRoute) {
    return (
      <div className="relative min-h-screen overflow-hidden font-sans text-foreground">
        <div className="relative z-10 animate-fade-rise">{children}</div>
        <ToastContainer />
      </div>
    );
  }

  const workspaceTitle = resolveWorkspaceTitle(pathname);
  const workspaceSubtitle = resolveWorkspaceSubtitle(pathname);

  return (
    <div className="relative flex min-h-screen font-sans text-foreground">
      <Sidebar />
      <main className="relative w-full flex-1 overflow-y-auto">
        <div className="mx-auto min-h-screen w-full max-w-[var(--content-max-width)] px-[var(--space-page-x)] pb-28 pt-[var(--space-page-y)]">
          <header className="mb-6 border-b border-border pb-5 sm:mb-[var(--space-header-gap)]">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 pl-14 lg:pl-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {workspaceSubtitle}
                </p>
                <h1 className="display-heading truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl md:text-2xl">
                  {workspaceTitle}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                  className="hidden sm:inline-flex"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <MoonStar size={16} />}
                </Button>

                <button
                  type="button"
                  className="hidden h-9 items-center rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted md:flex"
                >
                  <UserCircle2 size={14} className="mr-1.5 text-muted-foreground" />
                  {user?.name || user?.email || 'Engineer'}
                </button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="border-transparent hover:bg-secondary"
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

          <div className="relative">
            {children}
          </div>
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
