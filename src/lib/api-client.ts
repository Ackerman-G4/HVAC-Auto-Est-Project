/**
 * Centralized API client for all panel fetch/mutate calls.
 * Provides consistent error handling and response unwrapping.
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const AUTH_TOKEN_STORAGE_KEY = 'hvac-auth-token';
const REFRESH_TOKEN_STORAGE_KEY = 'hvac-refresh-token';
let authTokenCache: string | null = null;
let refreshTokenCache: string | null = null;

function readStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return authTokenCache;
  if (authTokenCache) return authTokenCache;

  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  authTokenCache = token && token.trim() ? token : null;
  return authTokenCache;
}

function readStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return refreshTokenCache;
  if (refreshTokenCache) return refreshTokenCache;

  const token = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  refreshTokenCache = token && token.trim() ? token : null;
  return refreshTokenCache;
}

export function setApiClientToken(token: string | null) {
  authTokenCache = token && token.trim() ? token : null;

  if (typeof window === 'undefined') {
    return;
  }

  if (authTokenCache) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authTokenCache);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

export function setRefreshToken(token: string | null) {
  refreshTokenCache = token && token.trim() ? token : null;

  if (typeof window === 'undefined') {
    return;
  }

  if (refreshTokenCache) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshTokenCache);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

export function getApiClientToken() {
  return readStoredAuthToken();
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to exchange the stored refresh token for a new ID token.
 * Returns true if the token was successfully refreshed.
 * Deduplicates concurrent refresh attempts.
 */
export function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = readStoredRefreshToken();
    if (!rt) return false;

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.token) {
        setApiClientToken(data.token);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Drop-in replacement for `fetch()` that automatically attaches
 * the stored auth Bearer token.  On 401, attempts a silent token
 * refresh and retries once.
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = readStoredAuthToken();
  const existingHeaders = (init?.headers ?? {}) as Record<string, string>;
  const headers: Record<string, string> = { ...existingHeaders };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && readStoredRefreshToken()) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = readStoredAuthToken();
      const retryHeaders: Record<string, string> = { ...existingHeaders };
      if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
      return fetch(url, { ...init, headers: retryHeaders });
    }
  }

  return res;
}

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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = readStoredAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: 'same-origin',
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  let res = await fetch(url, options);

  // On 401, attempt silent token refresh and retry once
  if (res.status === 401 && readStoredRefreshToken()) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = readStoredAuthToken();
      if (newToken) headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }

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

// ── Auth ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: (data: unknown) => request<{ token: string; refreshToken?: string; user: unknown }>('/api/auth/login', 'POST', data),
  register: (data: unknown) => request<{ token: string; refreshToken?: string; user: unknown }>('/api/auth/register', 'POST', data),
  loginWithGoogle: (data: unknown) =>
    request<{ token: string; refreshToken?: string; user: unknown }>('/api/auth/google', 'POST', data),
  profile: () => request<{ user: unknown }>('/api/auth/profile'),
  logout: () => request<{ message: string }>('/api/auth/logout', 'POST'),
};

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
