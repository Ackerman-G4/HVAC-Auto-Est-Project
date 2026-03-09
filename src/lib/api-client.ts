/**
 * Centralized API client for all panel fetch/mutate calls.
 * Provides consistent error handling and response unwrapping.
 */

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

async function request<T>(
  url: string,
  method: HttpMethod = 'GET',
  body?: unknown
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
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
      details = data.details;
    } catch {
      // ignore parse errors for non-JSON responses
    }
    throw new ApiClientError(errorMsg, res.status, details);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Projects ─────────────────────────────────────────────────────────────

export const projectsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ projects: unknown[] }>(`/api/projects${qs}`);
  },
  get: (id: string) => request<{ project: unknown }>(`/api/projects/${id}`),
  create: (data: unknown) => request<{ project: unknown }>('/api/projects', 'POST', data),
  update: (id: string, data: unknown) => request<{ project: unknown }>(`/api/projects/${id}`, 'PUT', data),
  delete: (id: string, permanent = false) =>
    request<{ message: string }>(`/api/projects/${id}${permanent ? '?permanent=true' : ''}`, 'DELETE'),
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
