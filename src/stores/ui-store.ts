import { create } from 'zustand';

export type WorkspaceMode = 'beginner' | 'professional';
export type AppTheme = 'light' | 'dark';

interface UIStore {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  workspaceMode: WorkspaceMode;
  theme: AppTheme;
  /**
   * Command palette visibility.
   *
   * Lives here rather than inside CommandPalette so other components can open
   * it by calling an action. The header button used to fake a Cmd+K keypress
   * with `new KeyboardEvent(...)`, which only worked because the palette
   * happened to listen on window — untestable, and it breaks the day a browser
   * stops trusting synthetic events.
   */
  commandPaletteOpen: boolean;
  /**
   * Set once the user has collapsed or expanded the sidebar themselves.
   *
   * The shell applies a width-based default, and it used to do so on every
   * breakpoint crossing — so someone who expanded the sidebar at 1200px watched
   * it snap shut again the moment they resized, and lost the choice entirely on
   * reload. Once this is true the viewport stops overriding the preference.
   */
  sidebarCollapsedByUser: boolean;
  /**
   * Expanded state per sidebar nav group, keyed by label.
   *
   * This was a single `useState` in the sidebar shared by *every* group, so
   * toggling "CFD Simulation" also opened and closed "Estimation". It also
   * reset on reload.
   */
  navGroupsOpen: Record<string, boolean>;
  toggleSidebar: () => void;
  /** Explicit choice. Persists, and wins over the responsive default. */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Width-based default. Ignored once the user has expressed a preference. */
  applyResponsiveSidebar: (collapsed: boolean) => void;
  setMobileSidebar: (open: boolean) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setNavGroupOpen: (label: string, open: boolean) => void;
}

const SIDEBAR_KEY = 'hvac-sidebar-collapsed';
const NAV_GROUPS_KEY = 'hvac-nav-groups-open';

function readStoredGroups(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NAV_GROUPS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Filter to booleans so a hand-edited or stale payload cannot make a group
    // render with a non-boolean open state.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean'),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Read a persisted boolean. Absent means "no preference recorded". */
function readStoredBool(key: string): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(key);
  return raw === 'true' ? true : raw === 'false' ? false : null;
}

function writeStoredBool(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode / quota. A lost preference is not worth breaking nav over.
  }
}

function getStoredMode(): WorkspaceMode {
  if (typeof window === 'undefined') return 'professional';
  const stored = localStorage.getItem('hvac-workspace-mode');
  return stored === 'beginner' ? 'beginner' : 'professional';
}

function syncModeAttribute(mode: WorkspaceMode) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-workspace-mode', mode);
  }
}

export const useUIStore = create<UIStore>((set) => {
  const initialMode = getStoredMode();
  syncModeAttribute(initialMode);

  const storedSidebar = readStoredBool(SIDEBAR_KEY);

  return {
    sidebarCollapsed: storedSidebar ?? false,
    sidebarCollapsedByUser: storedSidebar !== null,
    navGroupsOpen: readStoredGroups(),
    mobileSidebarOpen: false,
    workspaceMode: initialMode,
    theme: 'dark',
    commandPaletteOpen: false,
    toggleSidebar: () =>
      set((state) => {
        const next = !state.sidebarCollapsed;
        writeStoredBool(SIDEBAR_KEY, next);
        return { sidebarCollapsed: next, sidebarCollapsedByUser: true };
      }),
    setSidebarCollapsed: (collapsed) => {
      writeStoredBool(SIDEBAR_KEY, collapsed);
      set({ sidebarCollapsed: collapsed, sidebarCollapsedByUser: true });
    },
    applyResponsiveSidebar: (collapsed) =>
      set((state) => (state.sidebarCollapsedByUser ? {} : { sidebarCollapsed: collapsed })),
    setNavGroupOpen: (label, open) =>
      set((state) => {
        const next = { ...state.navGroupsOpen, [label]: open };
        try {
          localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next));
        } catch {
          // Private mode / quota — not worth breaking nav over.
        }
        return { navGroupsOpen: next };
      }),
    setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
    setWorkspaceMode: (mode) => {
      localStorage.setItem('hvac-workspace-mode', mode);
      syncModeAttribute(mode);
      set({ workspaceMode: mode });
    },
    setTheme: (theme) => set({ theme }),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  };
});
