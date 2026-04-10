import { create } from 'zustand';
import type { Project, ProjectFormData } from '@/types/project';
import { showToast } from '@/components/ui/toast';
import { projectsApi, getApiClientToken } from '@/lib/api-client';

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

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,
  isLoading: false,

  fetchProjects: async () => {
    if (!getApiClientToken()) {
      set({ projects: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const data = await projectsApi.list();
      set({ projects: (data.projects || []) as Project[], isLoading: false });
    } catch (error) {
      console.error(error);
      set({ isLoading: false });
    }
  },

  fetchProject: async (id: string) => {
    if (!getApiClientToken()) return;
    set({ isLoading: true });
    try {
      const data = await projectsApi.get(id);
      set({ currentProject: (data.project || data) as Project, isLoading: false });
    } catch (error) {
      console.error(error);
      set({ isLoading: false });
      showToast('error', 'Failed to load project');
    }
  },

  createProject: async (data: ProjectFormData) => {
    try {
      const result = await projectsApi.create(data);
      const project = (result.project || result) as Project;
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
      const result = await projectsApi.update(id, data);
      const updated = (result.project || result) as Project;
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
      await projectsApi.update(id, { status: 'archived' });
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
      await projectsApi.update(id, { status: 'active' });
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
      await projectsApi.delete(id);
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
