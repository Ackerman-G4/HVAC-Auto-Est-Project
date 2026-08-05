'use client';

import React from 'react';
import { MotionConfig } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MoonStar, Sun, UserCircle2, Gauge, GraduationCap, Search } from 'lucide-react';
import { Sidebar } from './sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { HvacLogo } from '@/components/ui/hvac-logo';
import { SystemLoadingScreen } from '@/components/layout/system-loading-screen';
import { PageTransition } from '@/components/ui/page-transition';
import { CommandPalette } from '@/components/ui/command-palette';
import { ShortcutsSheet } from '@/components/ui/shortcuts-sheet';
import { OnboardingTour } from '@/components/layout/onboarding-tour';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getRouteMeta } from '@/config/routes';
import { cn } from '@/lib/utils/cn';

interface AppShellProps {
  children: React.ReactNode;
}

const UI_THEME_STORAGE_KEY = 'hvac-ui-theme';

/**
 * Honour the OS "reduce motion" setting globally (WCAG 2.3.3).
 *
 * Most shared overlays already call usePrefersReducedMotion, but ~26 inline
 * `initial={{…}}` / `animate={{…}}` props scattered across 14 files bypassed it
 * entirely. framer-motion's MotionConfig applies the preference to every motion
 * component beneath it, which fixes the whole class in one place instead of
 * rewriting each call site.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <MotionConfig reducedMotion="user">
      <AppShellContent>{children}</AppShellContent>
    </MotionConfig>
  );
}

function AppShellContent({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const routeMeta = getRouteMeta(pathname);
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const workspaceMode = useUIStore((state) => state.workspaceMode);
  const setWorkspaceMode = useUIStore((state) => state.setWorkspaceMode);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const setMobileSidebar = useUIStore((state) => state.setMobileSidebar);
  const setCommandPaletteOpen = useUIStore((state) => state.setCommandPaletteOpen);
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const logout = useAuthStore((state) => state.logout);

  const isAuthRoute = pathname.startsWith('/auth');
  const [themeHydrated, setThemeHydrated] = React.useState(false);

  React.useEffect(() => {
    if (isAuthRoute) {
      return;
    }

    void initializeAuth();
  }, [initializeAuth, isAuthRoute]);

  // Adopt whatever the pre-paint script in the document head already resolved,
  // so the store agrees with the DOM rather than fighting it.
  React.useEffect(() => {
    const savedTheme = window.localStorage.getItem(UI_THEME_STORAGE_KEY);

    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
    setThemeHydrated(true);
  }, [setTheme]);

  // Changes only. Writing before the stored theme is adopted would repaint the
  // document with the default and reintroduce the flash the head script exists
  // to prevent.
  React.useEffect(() => {
    if (!themeHydrated) return;
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
  }, [theme, themeHydrated]);

  // matchMedia fires on threshold crossings; the previous `resize` listener ran
  // on every tick of a drag and pushed two store writes each time.
  React.useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    const narrow = window.matchMedia('(max-width: 1439px)');

    const applyResponsiveShell = () => {
      if (mobile.matches) {
        setMobileSidebar(false);
        return;
      }
      setSidebarCollapsed(narrow.matches);
    };

    applyResponsiveShell();
    mobile.addEventListener('change', applyResponsiveShell);
    narrow.addEventListener('change', applyResponsiveShell);
    return () => {
      mobile.removeEventListener('change', applyResponsiveShell);
      narrow.removeEventListener('change', applyResponsiveShell);
    };
  }, [setMobileSidebar, setSidebarCollapsed]);

  const showBootScreen = !isAuthRoute && !initialized;

  if (showBootScreen) {
    return <SystemLoadingScreen />;
  }

  if (isAuthRoute) {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-background font-sans text-foreground">
        <div className="relative z-10 animate-fade-rise">
          {children}
        </div>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="relative grid min-h-dvh grid-cols-[auto_minmax(0,1fr)] overflow-hidden bg-background font-sans text-foreground">
      <Sidebar />
      <main id="main-content" className="relative min-w-0 overflow-hidden">
        <div className="flex h-dvh min-h-0 flex-col">
          {!routeMeta.hideHeader && (
            <header className="panel-glass elev-floating sticky top-0 z-20 flex h-16 shrink-0 items-center border-b border-border/70 px-4 md:px-6">
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3 pl-13 md:pl-0">
                  <HvacLogo variant="mono" size={24} className="hidden text-muted-foreground md:block" />
                  <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                    {routeMeta.title}
                  </h1>
                </div>

                <div className="flex items-center gap-2">
                  {/* Command palette trigger */}
                  <button
                    type="button"
                    onClick={() => setCommandPaletteOpen(true)}
                    className="hidden items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground md:flex"
                    aria-label="Open command palette"
                  >
                    <Search size={14} />
                    <span className="text-xs">Search...</span>
                    <kbd className="ml-2 rounded-md border border-border/80 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">⌘K</kbd>
                  </button>
                  {/* Workspace mode toggle pill */}
                  <div className="hidden items-center rounded-lg border border-border/70 bg-card/60 p-0.5 md:flex" role="radiogroup" aria-label="Workspace mode">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={workspaceMode === 'beginner'}
                      onClick={() => setWorkspaceMode('beginner')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                        workspaceMode === 'beginner'
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <GraduationCap size={14} />
                      Guided
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={workspaceMode === 'professional'}
                      onClick={() => setWorkspaceMode('professional')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                        workspaceMode === 'professional'
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Gauge size={14} />
                      Pro
                    </button>
                  </div>

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

                  {/* Was a <button> with no handler — it looked clickable and did
                      nothing. Settings is where the account actually lives. */}
                  <Link
                    href="/settings"
                    className="hidden h-9 items-center rounded-xl border border-border/70 bg-card/60 px-3 text-sm font-medium text-foreground transition-colors hover:border-accent/40 md:flex"
                  >
                    <UserCircle2 size={14} className="mr-1.5 text-muted-foreground" />
                    {user?.name || user?.email || 'Engineer'}
                  </Link>

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

          <div className="surface-recessed relative min-h-0 flex-1 overflow-auto">
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
              <PageTransition>{children}</PageTransition>
            </div>
          </div>
        </div>
      </main>

      <CommandPalette />
      <ShortcutsSheet />
      <OnboardingTour />
      <ToastContainer />
    </div>
  );
}
