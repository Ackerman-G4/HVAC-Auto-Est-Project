import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Engineering-tier (OpenFOAM cloud) availability gating.
 *
 * The Engineering tier is unprovisioned by default — see .env.example, which
 * says so explicitly. POST .../runs answers with a 503 carrying
 * ENGINEERING_TIER_NOT_PROVISIONED, which is a deployment state rather than a
 * fault.
 *
 * startRun used to turn that 503 into a thrown Error and console.error it, and
 * Next.js renders anything reaching console.error as a full-screen crash
 * overlay. So a correctly-configured Preview-tier deployment looked broken the
 * moment anyone pressed "Run Engineering".
 *
 * These cover both halves of the fix: the tier is probed up front so the button
 * can be disabled, and the 503 is reported without console.error if it is
 * pressed anyway. The console.error assertions are the point — they are what
 * distinguishes "handled" from "crash overlay".
 */

const authFetch = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ authFetch }));
vi.mock('@/components/ui/toast', () => ({ showToast }));

import { useSimulationStore } from '../simulation-store';
import type { SimulationCase } from '@/types/simulation';

const CASE = { id: 'case-1', runSource: 'openfoam' } as SimulationCase;

function json(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(''),
  });
}

const NOT_PROVISIONED_503 = {
  error: 'Engineering tier not provisioned',
  description:
    'The OpenFOAM cloud path is not configured. Missing: CFD_GCS_BUCKET. Use the Preview tier, or complete plan phases C1–C2.',
  code: 'ENGINEERING_TIER_NOT_PROVISIONED',
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  authFetch.mockReset();
  showToast.mockReset();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  useSimulationStore.setState({
    projectId: 'p1',
    activeCase: CASE,
    engineeringTierAvailable: null,
    engineeringTierReason: null,
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.clearAllMocks();
});

describe('loadCapabilities', () => {
  it('records an unprovisioned Engineering tier', async () => {
    authFetch.mockImplementation(() =>
      json(200, {
        capabilities: {
          preview: { available: true },
          engineering: { available: false, reason: 'No solver configured.' },
        },
      }),
    );

    await useSimulationStore.getState().loadCapabilities();

    expect(useSimulationStore.getState().engineeringTierAvailable).toBe(false);
    expect(useSimulationStore.getState().engineeringTierReason).toBe('No solver configured.');
  });

  it('records a provisioned Engineering tier', async () => {
    authFetch.mockImplementation(() =>
      json(200, {
        capabilities: { preview: { available: true }, engineering: { available: true, reason: null } },
      }),
    );

    await useSimulationStore.getState().loadCapabilities();

    expect(useSimulationStore.getState().engineeringTierAvailable).toBe(true);
  });

  it('leaves availability unknown when the probe fails', async () => {
    // Must stay null rather than falling to false: a flaky probe must not
    // disable a tier this deployment actually supports.
    authFetch.mockImplementation(() => Promise.reject(new Error('network down')));

    await useSimulationStore.getState().loadCapabilities();

    expect(useSimulationStore.getState().engineeringTierAvailable).toBeNull();
  });
});

describe('startRun with an unprovisioned Engineering tier', () => {
  beforeEach(() => {
    authFetch.mockImplementation(() => json(503, NOT_PROVISIONED_503));
  });

  it('does not reach console.error (which would raise the Next.js crash overlay)', async () => {
    await useSimulationStore.getState().startRun('openfoam');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('reports it as information, not as an error', async () => {
    await useSimulationStore.getState().startRun('openfoam');

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toBe('info');
    expect(String(showToast.mock.calls[0][2])).toMatch(/Run Preview/i);
  });

  it('remembers the tier is unavailable so the control disables itself', async () => {
    await useSimulationStore.getState().startRun('openfoam');
    expect(useSimulationStore.getState().engineeringTierAvailable).toBe(false);
  });

  it('does not fabricate a run', async () => {
    await useSimulationStore.getState().startRun('openfoam');

    expect(useSimulationStore.getState().snapshotRunId).toBeNull();
    // Exactly the one rejected POST — no history refetch, no polling follow-up.
    expect(authFetch).toHaveBeenCalledTimes(1);
  });
});

describe('startRun with a genuine Engineering failure', () => {
  it('still surfaces real errors loudly', async () => {
    // The narrow ENGINEERING_TIER_NOT_PROVISIONED carve-out must not swallow
    // anything else — an actual dispatch failure is still an error.
    authFetch.mockImplementation(() =>
      json(500, { error: 'Cloud Run dispatch failed', description: 'Job quota exceeded.', code: 'UNKNOWN_ERROR' }),
    );

    await useSimulationStore.getState().startRun('openfoam');

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('error', 'Job quota exceeded.');
    expect(useSimulationStore.getState().engineeringTierAvailable).toBeNull();
  });
});
