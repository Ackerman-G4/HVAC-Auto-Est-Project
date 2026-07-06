import { create } from 'zustand';
import { showToast } from '@/components/ui/toast';
import { authApi, getApiClientToken, setApiClientToken } from '@/lib/api-client';

type AuthRole = 'admin' | 'engineer';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  initialized: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  registerWithEmail: (input: {
    email: string;
    password: string;
    name?: string;
    role?: AuthRole;
  }) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  fetchProfile: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toRole(value: unknown): AuthRole {
  return value === 'admin' ? 'admin' : 'engineer';
}

function normalizeUser(value: unknown): AuthUser {
  const obj = (value ?? {}) as Record<string, unknown>;
  const id = toStringValue(obj.id);
  const email = toStringValue(obj.email);

  if (!id || !email) {
    throw new Error('Invalid user payload');
  }

  return {
    id,
    email,
    name: toStringValue(obj.name),
    role: toRole(obj.role),
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getApiClientToken(),
  isLoading: false,
  initialized: false,
  error: null,

  initialize: async () => {
    if (get().initialized) {
      return;
    }

    set({ initialized: true });

    try {
      await get().fetchProfile();
    } catch {
      // Ignore initialize profile errors and keep user signed out.
    }
  },

  loginWithEmail: async (email, password) => {
    set({ isLoading: true, error: null });

    try {
      const response = await authApi.login({ email, password });
      const user = normalizeUser(response.user);
      setApiClientToken(response.token);
      set({ user, token: response.token, isLoading: false });
      showToast('success', 'Signed in', `Welcome back, ${user.name || user.email}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in';
      set({ isLoading: false, error: message });
      return false;
    }
  },

  registerWithEmail: async (input) => {
    set({ isLoading: true, error: null });

    try {
      const response = await authApi.register(input);
      const user = normalizeUser(response.user);
      setApiClientToken(response.token);
      set({ user, token: response.token, isLoading: false });
      showToast('success', 'Account created', 'Your account is ready to use.');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to register';
      set({ isLoading: false, error: message });
      return false;
    }
  },

  loginWithGoogle: async (credential) => {
    set({ isLoading: true, error: null });

    try {
      const response = await authApi.loginWithGoogle({ credential });
      const user = normalizeUser(response.user);
      setApiClientToken(response.token);
      set({ user, token: response.token, isLoading: false });
      showToast('success', 'Signed in with Google', `Welcome, ${user.name || user.email}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in with Google';
      set({ isLoading: false, error: message });
      return false;
    }
  },

  fetchProfile: async () => {
    try {
      const response = await authApi.profile();
      const user = normalizeUser(response.user);
      set({ user, error: null });
    } catch {
      setApiClientToken(null);
      set({ user: null, token: null });
      throw new Error('Profile unavailable');
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Continue local cleanup even if API logout fails.
    }

    setApiClientToken(null);
    set({ user: null, token: null, error: null });
    showToast('info', 'Signed out', 'You have been logged out.');
  },

  clearError: () => set({ error: null }),
}));
