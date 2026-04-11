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

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  workspaceMode: 'professional',
  theme: 'dark',
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
  setWorkspaceMode: (mode) => set({ workspaceMode: mode }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}));
