'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MoonStar, Sun, UserCircle2 } from 'lucide-react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { SystemLoadingScreen } from '@/components/layout/system-loading-screen';
import { WelcomeOverlay } from '@/components/layout/welcome-overlay';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getRouteMeta } from '@/config/routes';
import { cn } from '@/lib/utils/cn';

interface AppShellProps {
  children: React.ReactNode;
}

const UI_THEME_STORAGE_KEY = 'hvac-ui-theme';

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const routeMeta = getRouteMeta(pathname);
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const setMobileSidebar = useUIStore((state) => state.setMobileSidebar);
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const logout = useAuthStore((state) => state.logout);

  const isAuthRoute = pathname.startsWith('/auth');
  const [bootReady, setBootReady] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setBootReady(true), 1100);
    return () => window.clearTimeout(timer);
  }, []);

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

  React.useEffect(() => {
    const applyResponsiveShell = () => {
      const width = window.innerWidth;

      if (width < 768) {
        setMobileSidebar(false);
        return;
      }

      if (width < 1440) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
      }
    };

    applyResponsiveShell();
    window.addEventListener('resize', applyResponsiveShell);
    return () => window.removeEventListener('resize', applyResponsiveShell);
  }, [setMobileSidebar, setSidebarCollapsed]);

  React.useEffect(() => {
    if (isAuthRoute || pathname !== '/' || !user) {
      return;
    }

    const shouldShow = window.sessionStorage.getItem('hvac-show-welcome');
    if (shouldShow !== '1') {
      return;
    }

    window.sessionStorage.removeItem('hvac-show-welcome');
    setShowWelcome(true);
  }, [isAuthRoute, pathname, user]);

  const showBootScreen = !bootReady || (!isAuthRoute && !initialized);

  if (showBootScreen) {
    return <SystemLoadingScreen />;
  }

  if (isAuthRoute) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground">
        <div className="relative z-10 animate-fade-rise">
          {children}
        </div>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="relative grid min-h-screen grid-cols-[auto_minmax(0,1fr)] overflow-hidden bg-background font-sans text-foreground">
      <Sidebar />
      <main className="relative min-w-0 overflow-hidden">
        <div className="flex h-screen min-h-0 flex-col">
          {!routeMeta.hideHeader && (
            <header className="panel-glass sticky top-0 z-20 border-b border-border/70 px-4 py-3 md:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 pl-13 md:pl-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {routeMeta.subtitle}
                  </p>
                  <h1 className="display-heading mt-1 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {routeMeta.title}
                  </h1>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                    className="hidden md:inline-flex"
                  >
                    {theme === 'dark' ? <Sun size={16} /> : <MoonStar size={16} />}
                  </Button>

                  <button
                    type="button"
                    className="hidden h-9 items-center rounded-xl border border-border/70 bg-card/60 px-3 text-sm font-medium text-foreground md:flex"
                  >
                    <UserCircle2 size={14} className="mr-1.5 text-muted-foreground" />
                    {user?.name || user?.email || 'Engineer'}
                  </button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
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
          )}

          <div className="relative min-h-0 flex-1 overflow-auto">
            <div
              className={cn(
                'relative min-h-full w-full',
                routeMeta.constrained ? 'mx-auto max-w-(--content-max-width-constrained)' : '',
                routeMeta.hideHeader
                  ? 'p-0'
                  : routeMeta.fullBleed
                  ? 'px-[clamp(1rem,1.2vw+0.7rem,1.8rem)] py-[clamp(1rem,1vw+0.7rem,1.6rem)]'
                  : 'px-(--space-page-x) py-(--space-page-y)',
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </main>

      <WelcomeOverlay
        open={showWelcome}
        userName={user?.name || user?.email}
        onComplete={() => setShowWelcome(false)}
      />

      <ToastContainer />
    </div>
  );
}
