import { create } from 'zustand';
import type { Project, ProjectFormData } from '@/types/project';
import { showToast } from '@/components/ui/toast';

interface ProjectStore {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: ProjectFormData) => Promise<Project | null>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  restoreProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      set({ projects: data, isLoading: false });
    } catch (error) {
      console.error(error);
      set({ isLoading: false });
      showToast('error', 'Failed to load projects');
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      const data = await res.json();
      set({ currentProject: data, isLoading: false });
    } catch (error) {
      console.error(error);
      set({ isLoading: false });
      showToast('error', 'Failed to load project');
    }
  },

  createProject: async (data: ProjectFormData) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const project = await res.json();
      set((state) => ({ projects: [project, ...state.projects] }));
      showToast('success', 'Project created', project.name);
      return project;
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to create project');
      return null;
    }
  },

  updateProject: async (id: string, data: Partial<Project>) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update project');
      const updated = await res.json();
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        currentProject: state.currentProject?.id === id ? updated : state.currentProject,
      }));
      showToast('success', 'Project updated');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to update project');
    }
  },

  archiveProject: async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      if (!res.ok) throw new Error('Failed to archive');
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: 'archived' as const } : p
        ),
      }));
      showToast('success', 'Project archived');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to archive project');
    }
  },

  restoreProject: async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      if (!res.ok) throw new Error('Failed to restore');
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: 'active' as const } : p
        ),
      }));
      showToast('success', 'Project restored');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to restore project');
    }
  },

  deleteProject: async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
      }));
      showToast('success', 'Project deleted');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to delete project');
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
