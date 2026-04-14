/**
 * Simulation Engine Store — Case Management & Multi-Run Workflow
 *
 * Manages the new SimulationCase lifecycle, run history, field loading,
 * OpenFOAM export/import, and async run polling. This store works alongside
 * the existing useSimulationStore (which manages the baseline legacy flow).
 */

import { create } from 'zustand';
import { showToast } from '@/components/ui/toast';
import { authFetch } from '@/lib/api-client';
import type {
  SimulationCase,
  RunJob,
  CaseResult,
  FieldName,
  GeometryInput,
  PhysicsSetup,
  SolverProfile,
  ContourSliceConfig,
  RunSource,
} from '@/types/simulation';

// ─── Store Interface ────────────────────────────────────────

interface SimulationEngineStore {
  // ── Case State ──────────────────────────────────────────
  projectId: string | null;
  cases: SimulationCase[];
  activeCase: SimulationCase | null;
  isLoadingCases: boolean;

  // ── Run State ───────────────────────────────────────────
  activeRun: RunJob | null;
  runHistory: RunJob[];
  isPolling: boolean;
  pollIntervalId: ReturnType<typeof setInterval> | null;

  // ── Results ─────────────────────────────────────────────
  result: CaseResult | null;
  loadedFieldNames: FieldName[];

  // ── Visualization ───────────────────────────────────────
  fieldSource: 'internal' | 'external' | 'imported';
  contourSlices: ContourSliceConfig[];
  activeContourId: string | null;

  // ── Export State ────────────────────────────────────────
  isExporting: boolean;
  isImporting: boolean;

  // ── Actions: Cases ──────────────────────────────────────
  setProjectId: (projectId: string) => void;
  loadCases: (projectId: string) => Promise<void>;
  createCase: (input: {
    name: string;
    description?: string;
    geometry: GeometryInput;
    physics?: PhysicsSetup;
    solver?: SolverProfile;
    cellSize?: number;
  }) => Promise<SimulationCase | null>;
  selectCase: (caseId: string) => Promise<void>;
  updateCase: (caseId: string, updates: Record<string, unknown>) => Promise<void>;
  deleteCase: (caseId: string) => Promise<void>;

  // ── Actions: Run ────────────────────────────────────────
  startRun: (source?: RunSource) => Promise<void>;
  pollRunStatus: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;

  // ── Actions: Export / Import ────────────────────────────
  exportOpenFOAM: () => Promise<Record<string, string> | null>;
  importResults: (fields: Record<string, unknown>, source?: RunSource) => Promise<void>;

  // ── Actions: Visualization ──────────────────────────────
  setFieldSource: (source: 'internal' | 'external' | 'imported') => void;
  addContourSlice: (slice: ContourSliceConfig) => void;
  removeContourSlice: (id: string) => void;
  updateContourSlice: (id: string, updates: Partial<ContourSliceConfig>) => void;
  setActiveContour: (id: string | null) => void;

  // ── Cleanup ─────────────────────────────────────────────
  reset: () => void;
}

// ─── Initial State ──────────────────────────────────────────

const INITIAL_STATE = {
  projectId: null as string | null,
  cases: [] as SimulationCase[],
  activeCase: null as SimulationCase | null,
  isLoadingCases: false,
  activeRun: null as RunJob | null,
  runHistory: [] as RunJob[],
  isPolling: false,
  pollIntervalId: null as ReturnType<typeof setInterval> | null,
  result: null as CaseResult | null,
  loadedFieldNames: [] as FieldName[],
  fieldSource: 'internal' as const,
  contourSlices: [] as ContourSliceConfig[],
  activeContourId: null as string | null,
  isExporting: false,
  isImporting: false,
};

// ─── Store Implementation ───────────────────────────────────

export const useSimulationEngineStore = create<SimulationEngineStore>((set, get) => ({
  ...INITIAL_STATE,

  // ── Cases ───────────────────────────────────────────────

  setProjectId: (projectId) => set({ projectId }),

  loadCases: async (projectId) => {
    set({ isLoadingCases: true, projectId });
    try {
      const res = await authFetch(`/api/projects/${encodeURIComponent(projectId)}/simulations`);
      if (!res.ok) throw new Error('Failed to load cases');
      const data = await res.json();
      set({ cases: data.cases || [], isLoadingCases: false });
    } catch (error) {
      console.error('loadCases error:', error);
      set({ isLoadingCases: false });
      showToast('error', 'Failed to load simulation cases');
    }
  },

  createCase: async (input) => {
    const { projectId } = get();
    if (!projectId) {
      showToast('error', 'Select a project first');
      return null;
    }

    try {
      const res = await authFetch(`/api/projects/${encodeURIComponent(projectId)}/simulations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create case');
      }
      const data = await res.json();
      const newCase: SimulationCase = data.case;

      set((state) => ({
        cases: [newCase, ...state.cases],
        activeCase: newCase,
      }));

      showToast('success', `Case "${newCase.name}" created`);
      return newCase;
    } catch (error) {
      console.error('createCase error:', error);
      showToast('error', error instanceof Error ? error.message : 'Failed to create case');
      return null;
    }
  },

  selectCase: async (caseId) => {
    const { projectId, cases } = get();
    if (!projectId) return;

    let simCase = cases.find((c) => c.id === caseId);
    if (!simCase) {
      try {
        const res = await authFetch(
          `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(caseId)}`,
        );
        if (!res.ok) throw new Error('Case not found');
        const data = await res.json();
        simCase = data.case;
      } catch {
        showToast('error', 'Case not found');
        return;
      }
    }

    set({
      activeCase: simCase || null,
      activeRun: null,
      result: null,
      loadedFieldNames: [],
    });
  },

  updateCase: async (caseId, updates) => {
    const { projectId } = get();
    if (!projectId) return;

    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(caseId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        },
      );
      if (!res.ok) throw new Error('Update failed');
      const data = await res.json();
      const updated: SimulationCase = data.case;

      set((state) => ({
        cases: state.cases.map((c) => (c.id === caseId ? updated : c)),
        activeCase: state.activeCase?.id === caseId ? updated : state.activeCase,
      }));

      showToast('success', 'Case updated');
    } catch (error) {
      console.error('updateCase error:', error);
      showToast('error', 'Failed to update case');
    }
  },

  deleteCase: async (caseId) => {
    const { projectId } = get();
    if (!projectId) return;

    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(caseId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Delete failed');

      set((state) => ({
        cases: state.cases.filter((c) => c.id !== caseId),
        activeCase: state.activeCase?.id === caseId ? null : state.activeCase,
      }));

      showToast('success', 'Case deleted');
    } catch (error) {
      console.error('deleteCase error:', error);
      showToast('error', 'Failed to delete case');
    }
  },

  // ── Run ─────────────────────────────────────────────────

  startRun: async (source) => {
    const { projectId, activeCase } = get();
    if (!projectId || !activeCase) {
      showToast('error', 'Select a case first');
      return;
    }

    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: source || activeCase.runSource }),
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start run');
      }

      const data = await res.json();

      set((state) => ({
        activeRun: data.run,
        activeCase: data.case || state.activeCase,
      }));

      // Start polling if not already completed
      if (data.run?.status === 'running' || data.run?.status === 'pending') {
        get().startPolling();
      }

      if (data.run?.status === 'completed') {
        showToast('success', 'Simulation completed');
      }
    } catch (error) {
      console.error('startRun error:', error);
      showToast('error', error instanceof Error ? error.message : 'Failed to start run');
    }
  },

  pollRunStatus: async () => {
    const { projectId, activeCase } = get();
    if (!projectId || !activeCase) return;

    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/run`,
      );
      if (!res.ok) return;

      const data = await res.json();

      set({ activeRun: data.run });

      // Auto-stop polling when terminal state
      if (data.run?.status === 'completed' || data.run?.status === 'failed' || data.run?.status === 'cancelled') {
        get().stopPolling();

        // Refresh the case
        const caseRes = await authFetch(
          `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}`,
        );
        if (caseRes.ok) {
          const caseData = await caseRes.json();
          set((state) => ({
            activeCase: caseData.case,
            cases: state.cases.map((c) =>
              c.id === activeCase.id ? caseData.case : c,
            ),
          }));
        }

        if (data.run?.status === 'completed') {
          showToast('success', 'Simulation run completed');
        } else if (data.run?.status === 'failed') {
          showToast('error', `Run failed: ${data.run.errorMessage || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('pollRunStatus error:', error);
    }
  },

  startPolling: () => {
    const { pollIntervalId } = get();
    if (pollIntervalId) return; // Already polling

    set({ isPolling: true });
    const id = setInterval(() => {
      get().pollRunStatus();
    }, 3000); // Poll every 3 seconds
    set({ pollIntervalId: id });
  },

  stopPolling: () => {
    const { pollIntervalId } = get();
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
    set({ isPolling: false, pollIntervalId: null });
  },

  // ── Export / Import ─────────────────────────────────────

  exportOpenFOAM: async () => {
    const { projectId, activeCase } = get();
    if (!projectId || !activeCase) {
      showToast('error', 'Select a case first');
      return null;
    }

    set({ isExporting: true });
    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/export`,
      );
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      set({ isExporting: false });
      showToast('success', `OpenFOAM case "${data.caseName}" exported`);
      return data.files as Record<string, string>;
    } catch (error) {
      console.error('exportOpenFOAM error:', error);
      set({ isExporting: false });
      showToast('error', 'Export failed');
      return null;
    }
  },

  importResults: async (fields, source) => {
    const { projectId, activeCase } = get();
    if (!projectId || !activeCase) {
      showToast('error', 'Select a case first');
      return;
    }

    set({ isImporting: true });
    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/import`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields, source }),
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Import failed');
      }

      const data = await res.json();
      set({ isImporting: false });

      // Refresh case
      await get().selectCase(activeCase.id);
      showToast('success', `Imported ${data.fieldsImported?.length || 0} field(s)`);
    } catch (error) {
      console.error('importResults error:', error);
      set({ isImporting: false });
      showToast('error', error instanceof Error ? error.message : 'Import failed');
    }
  },

  // ── Visualization ───────────────────────────────────────

  setFieldSource: (source) => set({ fieldSource: source }),

  addContourSlice: (slice) => {
    set((state) => ({
      contourSlices: [...state.contourSlices, slice],
      activeContourId: slice.id,
    }));
  },

  removeContourSlice: (id) => {
    set((state) => ({
      contourSlices: state.contourSlices.filter((s) => s.id !== id),
      activeContourId: state.activeContourId === id ? null : state.activeContourId,
    }));
  },

  updateContourSlice: (id, updates) => {
    set((state) => ({
      contourSlices: state.contourSlices.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      ),
    }));
  },

  setActiveContour: (id) => set({ activeContourId: id }),

  // ── Cleanup ─────────────────────────────────────────────

  reset: () => {
    const { pollIntervalId } = get();
    if (pollIntervalId) clearInterval(pollIntervalId);
    set(INITIAL_STATE);
  },
}));
