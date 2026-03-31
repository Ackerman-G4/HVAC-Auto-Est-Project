/**
 * Centralized API client for all panel fetch/mutate calls.
 * Provides consistent error handling and response unwrapping.
 */

import { auth, db } from '@/lib/db/firebase';
import { ref, get, set, push, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

class ApiClientError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

// Keep the fetch wrapper for calculation/simulation APIs that actually need a backend
async function request<T>(
  url: string,
  method: HttpMethod = 'GET',
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    let errorMsg = res.statusText;
    let details: string | undefined;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
      details = data.description || data.details;
    } catch {
      // ignore
    }
    throw new ApiClientError(errorMsg, res.status, details);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Projects (Client-Side DB) ─────────────────────────────────────────────

export const projectsApi = {
  list: async (params?: Record<string, string>) => {
    const user = auth.currentUser;
    if (!user) throw new ApiClientError('Unauthorized', 401);

    const projectsRef = ref(db, `users/${user.uid}/projects`);
    const snapshot = await get(projectsRef);
    const data = snapshot.val() || {};
    
    let projects = Object.keys(data).map(id => ({ id, ...data[id] }));

    const status = params?.status;
    const search = params?.search?.toLowerCase();

    if (status && status !== 'all') {
      projects = projects.filter(p => p.status === status);
    } else {
      projects = projects.filter(p => p.status !== 'archived' && p.status !== 'deleted');
    }

    if (search) {
      projects = projects.filter(p => 
        p.name?.toLowerCase().includes(search) || 
        p.clientName?.toLowerCase().includes(search) ||
        p.location?.toLowerCase().includes(search)
      );
    }

    projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { projects };
  },

  get: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiClientError('Unauthorized', 401);

    const projectRef = ref(db, `users/${user.uid}/projects/${id}`);
    const snapshot = await get(projectRef);
    
    if (!snapshot.exists()) {
      throw new ApiClientError('Project not found', 404);
    }

    // Also fetch deep data (floors, rooms, equipment)
    const deepRef = ref(db, `projectData/${id}`);
    const deepSnap = await get(deepRef);
    const deepData = deepSnap.val() || {};

    const project = {
      id,
      ...snapshot.val(),
      floors: deepData.floors ? Object.values(deepData.floors).map((f: any) => ({
        ...f,
        rooms: f.rooms ? Object.values(f.rooms) : []
      })) : [],
      selectedEquipment: deepData.equipment ? Object.values(deepData.equipment) : [],
      boqItems: deepData.boq ? Object.values(deepData.boq) : []
    };

    return { project };
  },

  create: async (data: any) => {
    const user = auth.currentUser;
    if (!user) throw new ApiClientError('Unauthorized', 401);

    const finalDB = Number(data.outdoorDB) || 35;
    const finalRH = Number(data.outdoorRH) || 50;
    const computedWB = Number.isFinite(Number(data.outdoorWB))
      ? Number(data.outdoorWB)
      : calcWetBulb(finalDB, finalRH);

    const now = new Date().toISOString();
    const newProjectRef = push(ref(db, `users/${user.uid}/projects`));
    const projectId = newProjectRef.key;

    const projectData = {
      name: data.name,
      clientName: data.clientName || '',
      buildingType: data.buildingType || 'commercial',
      location: data.location || '',
      city: data.city || 'Manila',
      totalFloorArea: Number(data.totalFloorArea) || 0,
      floorsAboveGrade: Math.trunc(Number(data.floorsAboveGrade) || 1),
      floorsBelowGrade: Math.trunc(Number(data.floorsBelowGrade) || 0),
      outdoorDB: finalDB,
      outdoorWB: computedWB,
      outdoorRH: finalRH,
      indoorDB: Number(data.indoorDB) || 24,
      indoorRH: Number(data.indoorRH) || 50,
      notes: data.notes || '',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    try {
      // 1. Create the project metadata in the user's project list.
      // This satisfies the "users/$uid/projects" rule.
      await set(newProjectRef, projectData);
      
      // 2. Add the owner mapping.
      // This satisfies the "projectOwners" rule.
      await set(ref(db, `projectOwners/${projectId}`), user.uid);

      // Note: We intentionally DO NOT eagerly create `projectData/${projectId}` here.
      // The security rules for projectData require the project to ALREADY exist in the user's
      // project list. By not initializing it here, we avoid race conditions with the rules engine.
      // Deep data (rooms, floors) will be created naturally when the user adds them.
    } catch (e: any) {
      console.error("Firebase write error:", e);
      throw new ApiClientError('Database error', 500, e.message);
    }

    return { project: { id: projectId, ...projectData } };
  },

  update: async (id: string, data: any) => {
    const user = auth.currentUser;
    if (!user) throw new ApiClientError('Unauthorized', 401);

    const updates = { ...data, updatedAt: new Date().toISOString() };
    await update(ref(db, `users/${user.uid}/projects/${id}`), updates);
    return { project: { id, ...updates } };
  },

  delete: async (id: string, permanent = false) => {
    const user = auth.currentUser;
    if (!user) throw new ApiClientError('Unauthorized', 401);

    if (permanent) {
      await remove(ref(db, `users/${user.uid}/projects/${id}`));
      await remove(ref(db, `projectData/${id}`));
      await remove(ref(db, `projectOwners/${id}`));
    } else {
      await update(ref(db, `users/${user.uid}/projects/${id}`), { status: 'deleted', updatedAt: new Date().toISOString() });
    }
    return { message: 'Project deleted' };
  },
};


// ── Rooms ────────────────────────────────────────────────────────────────

export const roomsApi = {
  list: (projectId: string) => request<{ floors: unknown[] }>(`/api/projects/${projectId}/rooms`),
  create: (projectId: string, data: unknown) =>
    request<{ room: unknown }>(`/api/projects/${projectId}/rooms`, 'POST', data),
  update: (projectId: string, roomId: string, data: unknown) =>
    request<{ room: unknown }>(`/api/projects/${projectId}/rooms/${roomId}`, 'PUT', data),
  delete: (projectId: string, roomId: string) =>
    request<{ message: string }>(`/api/projects/${projectId}/rooms/${roomId}`, 'DELETE'),
};

// ── Floors ───────────────────────────────────────────────────────────────

export const floorsApi = {
  list: (projectId: string) => request<{ floors: unknown[] }>(`/api/projects/${projectId}/floors`),
  create: (projectId: string, data: unknown) =>
    request<{ floor: unknown }>(`/api/projects/${projectId}/floors`, 'POST', data),
  update: (projectId: string, floorId: string, data: unknown) =>
    request<{ floor: unknown }>(`/api/projects/${projectId}/floors/${floorId}`, 'PUT', data),
  delete: (projectId: string, floorId: string) =>
    request<{ message: string }>(`/api/projects/${projectId}/floors/${floorId}`, 'DELETE'),
};

// ── Equipment ────────────────────────────────────────────────────────────

export const equipmentApi = {
  catalog: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ equipment: unknown[]; brands: string[]; types: string[]; totalCount: number }>(`/api/equipment${qs}`);
  },
  listForProject: (projectId: string) =>
    request<{ equipment: unknown[] }>(`/api/projects/${projectId}/equipment`),
  autoSize: (projectId: string) =>
    request<{ equipment: unknown[] }>(`/api/projects/${projectId}/equipment`, 'POST', { autoSize: true }),
  select: (projectId: string, data: unknown) =>
    request<{ selection: unknown }>(`/api/projects/${projectId}/equipment`, 'POST', data),
  delete: (projectId: string, selectionId: string) =>
    request<{ message: string }>(`/api/projects/${projectId}/equipment/${selectionId}`, 'DELETE'),
};

// ── BOQ ──────────────────────────────────────────────────────────────────

export const boqApi = {
  get: (projectId: string) =>
    request<{ items: unknown[]; summary: unknown }>(`/api/projects/${projectId}/boq`),
  generate: (projectId: string) =>
    request<{ items: unknown[]; summary: unknown }>(`/api/projects/${projectId}/boq`, 'POST'),
  updateItem: (projectId: string, itemId: string, data: unknown) =>
    request<{ item: unknown }>(`/api/projects/${projectId}/boq/${itemId}`, 'PUT', data),
  deleteItem: (projectId: string, itemId: string) =>
    request<{ message: string }>(`/api/projects/${projectId}/boq/${itemId}`, 'DELETE'),
};

// ── Calculate ────────────────────────────────────────────────────────────

export const calculateApi = {
  recalculate: (projectId: string) =>
    request<{ results: unknown[]; summary: unknown }>(`/api/projects/${projectId}/calculate`, 'POST'),
};

// ── Materials ────────────────────────────────────────────────────────────

export const materialsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ materials: unknown[] }>(`/api/materials${qs}`);
  },
  create: (data: unknown) => request<{ material: unknown }>('/api/materials', 'POST', data),
  update: (id: string, data: unknown) => request<{ material: unknown }>(`/api/materials/${id}`, 'PUT', data),
  delete: (id: string) => request<{ message: string }>(`/api/materials/${id}`, 'DELETE'),
};

// ── Suppliers ────────────────────────────────────────────────────────────

export const suppliersApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ suppliers: unknown[] }>(`/api/suppliers${qs}`);
  },
  create: (data: unknown) => request<{ supplier: unknown }>('/api/suppliers', 'POST', data),
  update: (id: string, data: unknown) => request<{ supplier: unknown }>(`/api/suppliers/${id}`, 'PUT', data),
  delete: (id: string) => request<{ message: string }>(`/api/suppliers/${id}`, 'DELETE'),
};

// ── Settings ─────────────────────────────────────────────────────────────

export const settingsApi = {
  get: () => request<{ settings: unknown }>('/api/settings'),
  update: (data: unknown) => request<{ settings: unknown }>('/api/settings', 'PUT', data),
};

// ── Diagnostics ──────────────────────────────────────────────────────────

export const diagnosticsApi = {
  run: (data: unknown) => request<{ result: unknown }>('/api/diagnostics', 'POST', data),
  history: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ history: unknown[] }>(`/api/diagnostics/history${qs}`);
  },
};

export { ApiClientError };
