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
  FieldPayload,
  RunFieldSnapshot,
  RunFieldSnapshotMeta,
  Vec3,
  GeometryInput,
  PhysicsSetup,
  SolverProfile,
  ContourSliceConfig,
  RunSource,
} from '@/types/simulation';

const SNAPSHOT_PREFETCH_FIELDS: FieldName[] = ['temperature', 'velocity'];
const SNAPSHOT_STREAMLINE_SEED_LIMIT = 48;

function velocityMagnitude(vec: Vec3): number {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

function buildStreamlineSeedsFromVelocityField(
  velocityField: Vec3[][][],
  maxSeeds = SNAPSHOT_STREAMLINE_SEED_LIMIT,
): Vec3[] {
  const nx = velocityField.length;
  const ny = velocityField[0]?.length ?? 0;
  const nz = velocityField[0]?.[0]?.length ?? 0;
  if (!nx || !ny || !nz || maxSeeds < 1) {
    return [];
  }

  const cellCount = nx * ny * nz;
  const stride = Math.max(1, Math.floor(Math.cbrt(cellCount / Math.max(1, maxSeeds * 2))));
  const candidates: Array<{ x: number; y: number; z: number; speed: number }> = [];

  for (let x = 0; x < nx; x += stride) {
    for (let y = 0; y < ny; y += stride) {
      for (let z = 0; z < nz; z += stride) {
        const velocity = velocityField[x]?.[y]?.[z];
        if (!velocity) continue;
        const speed = velocityMagnitude(velocity);
        if (speed <= 1e-6) continue;
        candidates.push({
          x: x + 0.5,
          y: y + 0.5,
          z: z + 0.5,
          speed,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return [{ x: nx / 2, y: ny / 2, z: nz / 2 }];
  }

  candidates.sort((a, b) => b.speed - a.speed);
  const capped = candidates.slice(0, maxSeeds * 3);
  const seedCount = Math.min(maxSeeds, capped.length);
  if (seedCount <= 1) {
    const seed = capped[0];
    return [{ x: seed.x, y: seed.y, z: seed.z }];
  }

  const seeds: Vec3[] = [];
  for (let i = 0; i < seedCount; i += 1) {
    const index = Math.floor((i / (seedCount - 1)) * (capped.length - 1));
    const seed = capped[index];
    seeds.push({ x: seed.x, y: seed.y, z: seed.z });
  }

  return seeds;
}

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
  snapshotRunId: string | null;
  runSnapshots: RunFieldSnapshotMeta[];
  selectedSnapshotIteration: number | null;
  activeSnapshot: RunFieldSnapshot | null;
  isLoadingSnapshots: boolean;
  isLoadingSnapshotDetail: boolean;
  snapshotStreamlineSeeds: Record<number, Vec3[]>;

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
  loadRunHistory: (limit?: number) => Promise<void>;
  loadRunSnapshots: (runId?: string, limit?: number) => Promise<void>;
  loadSnapshotIteration: (iteration: number, fields?: FieldName[]) => Promise<void>;
  loadSnapshotField: (iteration: number, fieldName: FieldName) => Promise<FieldPayload | null>;
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
  snapshotRunId: null as string | null,
  runSnapshots: [] as RunFieldSnapshotMeta[],
  selectedSnapshotIteration: null as number | null,
  activeSnapshot: null as RunFieldSnapshot | null,
  isLoadingSnapshots: false,
  isLoadingSnapshotDetail: false,
  snapshotStreamlineSeeds: {} as Record<number, Vec3[]>,
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
      runHistory: [],
      snapshotRunId: null,
      runSnapshots: [],
      selectedSnapshotIteration: null,
      activeSnapshot: null,
      isLoadingSnapshots: false,
      isLoadingSnapshotDetail: false,
      snapshotStreamlineSeeds: {},
      result: null,
      loadedFieldNames: [],
    });

    await get().loadRunHistory();
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
        activeRun: data.run ?? null,
        runHistory: data.run
          ? [data.run, ...state.runHistory.filter((run) => run.id !== data.run.id)]
          : state.runHistory,
        activeCase: data.case || state.activeCase,
        snapshotRunId: data.run?.id ?? null,
        runSnapshots: [],
        selectedSnapshotIteration: null,
        activeSnapshot: null,
        snapshotStreamlineSeeds: {},
      }));

      // Start polling if not already completed
      if (data.run?.status === 'running' || data.run?.status === 'pending') {
        get().startPolling();
      }

      if (data.run?.status === 'completed') {
        await get().loadRunSnapshots(data.run.id);
        showToast('success', 'Simulation completed');
      }
    } catch (error) {
      console.error('startRun error:', error);
      showToast('error', error instanceof Error ? error.message : 'Failed to start run');
    }
  },

  loadRunHistory: async (limit = 25) => {
    const { projectId, activeCase } = get();
    if (!projectId || !activeCase) return;

    const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)));

    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/runs?limit=${boundedLimit}`,
      );
      if (!res.ok) throw new Error('Failed to load run history');

      const data = await res.json();
      const runs = Array.isArray(data.runs) ? (data.runs as RunJob[]) : [];
      const nextActiveRun = runs.find((run) => run.id === data.activeRunId) ?? runs[0] ?? null;

      set({
        runHistory: runs,
        activeRun: nextActiveRun,
      });

      if (nextActiveRun?.status === 'running' || nextActiveRun?.status === 'pending') {
        get().startPolling();
        return;
      }

      get().stopPolling();

      if (nextActiveRun) {
        await get().loadRunSnapshots(nextActiveRun.id);
      } else {
        set({
          runSnapshots: [],
          selectedSnapshotIteration: null,
          activeSnapshot: null,
          loadedFieldNames: [],
          snapshotStreamlineSeeds: {},
        });
      }
    } catch (error) {
      console.error('loadRunHistory error:', error);
      showToast('error', 'Failed to load run history');
    }
  },

  loadRunSnapshots: async (runId, limit = 50) => {
    const {
      projectId,
      activeCase,
      activeRun,
      snapshotRunId,
      selectedSnapshotIteration,
    } = get();
    if (!projectId || !activeCase) return;

    const resolvedRunId = runId ?? snapshotRunId ?? activeRun?.id;
    if (!resolvedRunId) {
      set({
        runSnapshots: [],
        selectedSnapshotIteration: null,
        activeSnapshot: null,
        loadedFieldNames: [],
        snapshotStreamlineSeeds: {},
      });
      return;
    }

    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    set({ isLoadingSnapshots: true });

    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/runs/${encodeURIComponent(resolvedRunId)}/snapshots?limit=${boundedLimit}`,
      );
      if (!res.ok) throw new Error('Failed to load run snapshots');

      const data = await res.json();
      const snapshots = Array.isArray(data.snapshots)
        ? (data.snapshots as RunFieldSnapshotMeta[])
        : [];

      const iterationExists = snapshots.some((snapshot) => snapshot.iteration === selectedSnapshotIteration);
      const nextIteration = iterationExists
        ? selectedSnapshotIteration
        : (snapshots[snapshots.length - 1]?.iteration ?? null);

      set((state) => {
        const runChanged = state.snapshotRunId !== resolvedRunId;
        return {
          isLoadingSnapshots: false,
          runSnapshots: snapshots,
          selectedSnapshotIteration: nextIteration,
          activeSnapshot:
            !runChanged && state.activeSnapshot?.meta.iteration === nextIteration
              ? state.activeSnapshot
              : null,
          loadedFieldNames:
            !runChanged && state.activeSnapshot?.meta.iteration === nextIteration
              ? state.loadedFieldNames
              : [],
          snapshotRunId: resolvedRunId,
          snapshotStreamlineSeeds: runChanged ? {} : state.snapshotStreamlineSeeds,
        };
      });

      if (nextIteration !== null) {
        await get().loadSnapshotIteration(nextIteration, SNAPSHOT_PREFETCH_FIELDS);
      }
    } catch (error) {
      console.error('loadRunSnapshots error:', error);
      set({ isLoadingSnapshots: false });
      showToast('error', 'Failed to load run snapshots');
    }
  },

  loadSnapshotIteration: async (iteration, fields) => {
    const { projectId, activeCase, activeRun, snapshotRunId } = get();
    if (!projectId || !activeCase) return;

    const resolvedRunId = snapshotRunId ?? activeRun?.id;
    if (!resolvedRunId) return;

    set({
      selectedSnapshotIteration: iteration,
      isLoadingSnapshotDetail: true,
    });

    try {
      const query = fields && fields.length > 0
        ? `?fields=${encodeURIComponent(Array.from(new Set(fields)).join(','))}`
        : '';

      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/runs/${encodeURIComponent(resolvedRunId)}/snapshots/${encodeURIComponent(String(iteration))}${query}`,
      );
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Snapshot not found' : 'Failed to load snapshot detail');
      }

      const data = await res.json();
      const incomingSnapshot = (data.snapshot ?? null) as RunFieldSnapshot | null;
      if (!incomingSnapshot) {
        throw new Error('Snapshot payload was empty');
      }

      set((state) => {
        const mergedFields = new Map<FieldName, FieldPayload>();

        if (state.activeSnapshot?.meta.iteration === incomingSnapshot.meta.iteration) {
          for (const field of state.activeSnapshot.fields) {
            mergedFields.set(field.name, field);
          }
        }

        for (const field of incomingSnapshot.fields) {
          mergedFields.set(field.name, field);
        }

        const nextFields = Array.from(mergedFields.values());
        const nextSeeds = { ...state.snapshotStreamlineSeeds };
        const velocityField = nextFields.find((field) => field.name === 'velocity')?.vectorData;
        if (velocityField) {
          nextSeeds[incomingSnapshot.meta.iteration] = buildStreamlineSeedsFromVelocityField(velocityField);
        }

        return {
          activeSnapshot: {
            meta: incomingSnapshot.meta,
            fields: nextFields,
          },
          loadedFieldNames: nextFields.map((field) => field.name),
          isLoadingSnapshotDetail: false,
          snapshotStreamlineSeeds: nextSeeds,
        };
      });
    } catch (error) {
      console.error('loadSnapshotIteration error:', error);
      set({ isLoadingSnapshotDetail: false });
      showToast('error', error instanceof Error ? error.message : 'Failed to load snapshot detail');
    }
  },

  loadSnapshotField: async (iteration, fieldName) => {
    const { projectId, activeCase, activeRun, snapshotRunId, activeSnapshot } = get();
    if (!projectId || !activeCase) return null;

    const existingField =
      activeSnapshot?.meta.iteration === iteration
        ? activeSnapshot.fields.find((field) => field.name === fieldName)
        : null;
    if (existingField) return existingField;

    const resolvedRunId = snapshotRunId ?? activeRun?.id;
    if (!resolvedRunId) return null;

    set({ isLoadingSnapshotDetail: true });

    try {
      const res = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/simulations/${encodeURIComponent(activeCase.id)}/runs/${encodeURIComponent(resolvedRunId)}/snapshots/${encodeURIComponent(String(iteration))}/fields/${encodeURIComponent(fieldName)}`,
      );
      if (res.status === 404) {
        set({ isLoadingSnapshotDetail: false });
        return null;
      }
      if (!res.ok) throw new Error('Failed to load snapshot field');

      const data = await res.json();
      const meta = (data.meta ?? null) as RunFieldSnapshotMeta | null;
      const field = (data.field ?? null) as FieldPayload | null;
      if (!meta || !field) {
        set({ isLoadingSnapshotDetail: false });
        return null;
      }

      let resolvedField: FieldPayload | null = field;

      set((state) => {
        const baseSnapshot = state.activeSnapshot?.meta.iteration === iteration
          ? state.activeSnapshot
          : { meta, fields: [] as FieldPayload[] };
        const mergedFields = new Map<FieldName, FieldPayload>();

        for (const existing of baseSnapshot.fields) {
          mergedFields.set(existing.name, existing);
        }
        mergedFields.set(field.name, field);

        const nextFields = Array.from(mergedFields.values());
        resolvedField = nextFields.find((entry) => entry.name === field.name) ?? field;

        const nextSeeds = { ...state.snapshotStreamlineSeeds };
        const velocityField = nextFields.find((entry) => entry.name === 'velocity')?.vectorData;
        if (velocityField) {
          nextSeeds[iteration] = buildStreamlineSeedsFromVelocityField(velocityField);
        }

        return {
          activeSnapshot: {
            meta,
            fields: nextFields,
          },
          loadedFieldNames: nextFields.map((entry) => entry.name),
          selectedSnapshotIteration: iteration,
          isLoadingSnapshotDetail: false,
          snapshotStreamlineSeeds: nextSeeds,
        };
      });

      return resolvedField;
    } catch (error) {
      console.error('loadSnapshotField error:', error);
      set({ isLoadingSnapshotDetail: false });
      showToast('error', 'Failed to load snapshot field');
      return null;
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

      set((state) => ({
        activeRun: data.run ?? null,
        runHistory: data.run
          ? [data.run, ...state.runHistory.filter((run) => run.id !== data.run.id)]
          : state.runHistory,
      }));

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

        await get().loadRunHistory();

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
