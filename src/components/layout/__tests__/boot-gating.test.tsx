// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

/**
 * The shell must appear as soon as auth resolves — and not one moment later.
 *
 * AppShell used to hold a `bootReady` flag behind
 * `setTimeout(() => setBootReady(true), 1100)`, so every cold load sat on a
 * loading screen for 1.1s whether or not anything was still loading. Combined
 * with the welcome overlay's 2.2s auto-close that was ~3.3s of manufactured
 * waiting before the user's first real pixel.
 *
 * The test that matters is the negative one: with auth already resolved, the
 * children must be on screen without advancing a single timer. Fake timers are
 * installed precisely so that a reintroduced delay cannot satisfy it.
 */

const authState = vi.hoisted(() => ({
  user: { id: 'u1', name: 'Test Engineer', email: 'e@example.com' },
  initialized: true,
  initialize: vi.fn(() => Promise.resolve()),
  logout: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

// Heavy leaves are irrelevant here and drag in canvases/portals.
vi.mock('../sidebar', () => ({ Sidebar: () => <nav data-testid="sidebar" /> }));
vi.mock('@/components/ui/command-palette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/ui/shortcuts-sheet', () => ({ ShortcutsSheet: () => null }));
vi.mock('../onboarding-tour', () => ({ OnboardingTour: () => null }));
vi.mock('@/components/ui/toast', () => ({ ToastContainer: () => null, showToast: vi.fn() }));

import { AppShell } from '../app-shell';

/** jsdom ships no matchMedia; the shell uses it for its responsive breakpoints. */
function stubMatchMedia(matches = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia();
  authState.initialized = true;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('AppShell boot gating', () => {
  it('renders content immediately once auth is resolved', () => {
    render(<AppShell><p>Dashboard content</p></AppShell>);

    // No timer advance. A reintroduced boot delay fails here.
    expect(screen.getByText('Dashboard content')).toBeDefined();
  });

  it('shows the loading state only while auth is unresolved', () => {
    authState.initialized = false;
    render(<AppShell><p>Dashboard content</p></AppShell>);

    expect(screen.queryByText('Dashboard content')).toBeNull();
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('does not reveal content on a timer while auth is still unresolved', () => {
    // The old gate was purely time-based, so waiting was enough to get in.
    // Time alone must never be sufficient.
    authState.initialized = false;
    render(<AppShell><p>Dashboard content</p></AppShell>);

    act(() => { vi.advanceTimersByTime(10_000); });

    expect(screen.queryByText('Dashboard content')).toBeNull();
  });
});

describe('SystemLoadingScreen', () => {
  it('announces itself to assistive tech as a busy status', async () => {
    authState.initialized = false;
    render(<AppShell><p>Dashboard content</p></AppShell>);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('runs no infinite progress animation', () => {
    // It reported fictional progress on a 2.2s loop forever. The skeleton
    // shimmer is allowed (it means "content is coming"); nothing else is.
    authState.initialized = false;
    const { container } = render(<AppShell><p>Dashboard content</p></AppShell>);

    expect(container.textContent).not.toMatch(/Initializing|Loading Environmental|Preparing Calculations/);
  });
});
