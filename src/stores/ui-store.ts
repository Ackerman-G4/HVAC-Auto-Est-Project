import { create } from 'zustand';

export type WorkspaceMode = 'beginner' | 'professional';
export type AppTheme = 'light' | 'dark';

interface UIStore {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  workspaceMode: WorkspaceMode;
  theme: AppTheme;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebar: (open: boolean) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
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

  return {
    sidebarCollapsed: false,
    mobileSidebarOpen: false,
    workspaceMode: initialMode,
    theme: 'dark',
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
    setWorkspaceMode: (mode) => {
      localStorage.setItem('hvac-workspace-mode', mode);
      syncModeAttribute(mode);
      set({ workspaceMode: mode });
    },
    setTheme: (theme) => set({ theme }),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  };
});
