import { create } from 'zustand';
import { 
  ref, 
  onValue, 
  off, 
  push, 
  set as firebaseSet, 
  update as firebaseUpdate, 
  remove as firebaseRemove,
  serverTimestamp 
} from 'firebase/database';
import { db, auth } from '@/lib/db/firebase';
import type { Project, ProjectFormData } from '@/types/project';
import { showToast } from '@/components/ui/toast';

interface ProjectStore {
  projects: Project[];
  currentProject: any | null; // Detailed project with floors/rooms
  isLoading: boolean;
  
  // Real-time subscriptions
  subscribeToProjects: () => () => void;
  subscribeToProject: (id: string) => () => void;

  // Actions
  createProject: (data: ProjectFormData) => Promise<string | null>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string, permanent?: boolean) => Promise<void>;
  setCurrentProject: (project: any | null) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,

  subscribeToProjects: () => {
    const user = auth.currentUser;
    if (!user) return () => {};

    set({ isLoading: true });
    const projectsRef = ref(db, `users/${user.uid}/projects`);
    
    const unsubscribe = onValue(projectsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const projectsList = Object.keys(data)
        .map(id => ({ id, ...data[id] }))
        .filter(p => p.status !== 'deleted')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      set({ projects: projectsList, isLoading: false });
    }, (error) => {
      console.error("Projects subscription error:", error);
      set({ isLoading: false });
      showToast('error', 'Failed to sync projects');
    });

    return () => off(projectsRef, 'value', unsubscribe);
  },

  subscribeToProject: (id: string) => {
    const user = auth.currentUser;
    if (!user) return () => {};

    set({ isLoading: true });
    
    // We need both project metadata and the actual data (floors/rooms)
    const projectMetaRef = ref(db, `users/${user.uid}/projects/${id}`);
    const projectDataRef = ref(db, `projectData/${id}`);

    const syncProject = () => {
      onValue(projectMetaRef, (metaSnap) => {
        if (!metaSnap.exists()) {
          set({ currentProject: null, isLoading: false });
          return;
        }

        onValue(projectDataRef, (dataSnap) => {
          const meta = metaSnap.val();
          const data = dataSnap.val() || {};
          
          // Structure the data to match what the UI expects (nested floors/rooms)
          const floorsData = data.floors || {};
          const roomsData = data.rooms || {};
          const coolingLoadsData = data.coolingLoads || {};
          
          const floors = Object.keys(floorsData).map(fId => {
            const floorRooms = Object.keys(roomsData)
              .filter(rId => roomsData[rId].floorId === fId)
              .map(rId => ({
                id: rId,
                ...roomsData[rId],
                coolingLoad: coolingLoadsData[rId] || null
              }));
            
            return {
              id: fId,
              ...floorsData[fId],
              rooms: floorRooms
            };
          }).sort((a, b) => (a.floorNumber || 0) - (b.floorNumber || 0));

          set({ 
            currentProject: { 
              id, 
              ...meta, 
              floors,
              boqItems: data.boq || {},
              selectedEquipment: data.selectedEquipment || {}
            }, 
            isLoading: false 
          });
        });
      });
    };

    syncProject();

    return () => {
      off(projectMetaRef);
      off(projectDataRef);
    };
  },

  createProject: async (data: ProjectFormData) => {
    const user = auth.currentUser;
    if (!user) return null;

    try {
      const projectsRef = ref(db, `users/${user.uid}/projects`);
      const newProjectRef = push(projectsRef);
      const projectId = newProjectRef.key;
      
      const now = new Date().toISOString();
      const projectData = {
        ...data,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };

      await firebaseSet(newProjectRef, projectData);
      showToast('success', 'Project created', data.name);
      return projectId;
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to create project');
      return null;
    }
  },

  updateProject: async (id: string, data: Partial<Project>) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const now = new Date().toISOString();
      const updates: any = {};
      
      Object.keys(data).forEach(key => {
        updates[`users/${user.uid}/projects/${id}/${key}`] = (data as any)[key];
      });
      updates[`users/${user.uid}/projects/${id}/updatedAt`] = now;

      await firebaseUpdate(ref(db), updates);
      showToast('success', 'Project updated');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to update project');
    }
  },

  deleteProject: async (id: string, permanent = false) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      if (permanent) {
        const updates: any = {};
        updates[`users/${user.uid}/projects/${id}`] = null;
        updates[`projectData/${id}`] = null;
        updates[`simulations/${id}`] = null;
        await firebaseUpdate(ref(db), updates);
      } else {
        await firebaseUpdate(ref(db), {
          [`users/${user.uid}/projects/${id}/status`]: 'deleted',
          [`users/${user.uid}/projects/${id}/updatedAt`]: new Date().toISOString()
        });
      }
      showToast('success', 'Project deleted');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to delete project');
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
