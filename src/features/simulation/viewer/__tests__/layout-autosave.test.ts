// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

/**
 * The layout autosave, end to end through the real effects.
 *
 * layout-payload.test.ts covers the pure payload/hash half. This covers the
 * wiring that sits on top of it and that nothing else can reach: the hydration
 * guard (opening a project must not write anything back), the hash
 * short-circuit, and the 650ms debounce collapsing a burst of drags into one
 * request. Previously this was only observable by hand with the network tab.
 *
 * authFetch is stubbed per-URL; the zustand store is the real one, so a "drag"
 * is just a store write, exactly as the drag handler does it.
 */

const authFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ authFetch }));
vi.mock('@/components/ui/toast', () => ({ showToast: vi.fn() }));

import { useSimulationViewer } from '../useSimulationViewer';
import { useSimulationStore } from '@/stores/simulation-store';
import type { HVACUnit } from '@/types/simulation';

const PROJECT = { id: 'p1', name: 'Project One' };
const FLOOR = {
  id: 'f1', floorNumber: 1, name: 'Ground', scale: 50, ceilingHeight: 3,
  rooms: [{ id: 'r1', name: 'Server Room', area: 100, ceilingHeight: 3, spaceType: 'server_room' }],
};
const STORED_HVAC = {
  id: 'h1', type: 'crac', label: 'CRAC-1',
  position: { x: 2, y: 2, z: 0 }, orientation: 0, capacityKW: 50, airflowCFM: 8000,
};

function json(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
}

/** PUTs issued to the simulation-layout endpoint. */
function layoutPuts() {
  return authFetch.mock.calls.filter(
    ([url, init]) => String(url).includes('/simulation-layout') && init?.method === 'PUT',
  );
}

/**
 * Advance timers, then drain the promise chain.
 *
 * The save path is setTimeout -> authFetch -> .then -> commit the new baseline
 * hash. A single microtask tick is not enough to reach that commit, and if the
 * baseline never lands the effect looks like it is re-saving forever. Drain
 * generously so the test measures the code rather than its own scheduling.
 */
async function settle(ms = 0) {
  await act(async () => { if (ms) vi.advanceTimersByTime(ms); });
  for (let i = 0; i < 8; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

/** Mount the hook and let projects -> detail -> layout hydration settle. */
async function mountHydrated() {
  const hook = renderHook(() => useSimulationViewer());
  await settle();
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  authFetch.mockReset();
  authFetch.mockImplementation((url: string, init?: { method?: string }) => {
    if (init?.method === 'PUT') return json({ success: true });
    if (url === '/api/projects') return json({ projects: [PROJECT] });
    if (url === `/api/projects/${PROJECT.id}`) return json({ project: { floors: [FLOOR] } });
    if (url.includes('/simulation-layout')) return json({ layout: { hvacPlacements: [STORED_HVAC], tilePlacements: [], canvasScale: 50 } });
    return json({});
  });
  useSimulationStore.setState({ hvacUnits: [], tiles: [] });
});

afterEach(() => {
  // vitest runs with globals:false, so testing-library never registers its own
  // afterEach cleanup. Without this, hooks from earlier tests stay mounted and
  // each one answers the next test's store write with its own PUT.
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('simulation layout autosave', () => {
  it('hydrates a stored layout into the store', async () => {
    await mountHydrated();
    expect(useSimulationStore.getState().hvacUnits.length).toBe(1);
  });

  it('writes nothing back when a project is merely opened', async () => {
    await mountHydrated();
    // Well past the 650ms debounce.
    await settle(2000);
    expect(layoutPuts()).toHaveLength(0);
  });

  it('issues exactly one PUT after a unit is moved', async () => {
    await mountHydrated();

    const [unit] = useSimulationStore.getState().hvacUnits;
    act(() => {
      useSimulationStore.setState({
        hvacUnits: [{ ...unit, position: { ...unit.position, x: unit.position.x + 1 } } as HVACUnit],
      });
    });

    // Nothing should go out before the debounce elapses.
    await settle(600);
    expect(layoutPuts()).toHaveLength(0);

    await settle(100);
    expect(layoutPuts()).toHaveLength(1);
  });

  it('collapses a burst of drags into a single PUT', async () => {
    await mountHydrated();
    const [unit] = useSimulationStore.getState().hvacUnits;

    for (let i = 1; i <= 4; i++) {
      act(() => {
        useSimulationStore.setState({
          hvacUnits: [{ ...unit, position: { ...unit.position, x: unit.position.x + i } } as HVACUnit],
        });
      });
      await settle(200);
    }

    await settle(700);
    expect(layoutPuts()).toHaveLength(1);
  });

  it('suppresses saves triggered while hydration is still in flight', async () => {
    // The hash short-circuit cannot help here: the baseline is only seeded once
    // the layout GET resolves, so a store write landing before that would
    // otherwise schedule a PUT and echo unhydrated state back to the server.
    // Hold the layout response open to reproduce that window.
    let releaseLayout: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => { releaseLayout = resolve; });

    authFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') return json({ success: true });
      if (url === '/api/projects') return json({ projects: [PROJECT] });
      if (url === `/api/projects/${PROJECT.id}`) return json({ project: { floors: [FLOOR] } });
      if (url.includes('/simulation-layout')) {
        return pending.then(() => ({
          ok: true,
          json: () => Promise.resolve({ layout: { hvacPlacements: [STORED_HVAC], tilePlacements: [], canvasScale: 50 } }),
          text: () => Promise.resolve(''),
        }));
      }
      return json({});
    });

    renderHook(() => useSimulationViewer());
    await settle();

    // Mid-hydration store write, then push well past the debounce.
    act(() => {
      useSimulationStore.setState({
        hvacUnits: [{ ...(STORED_HVAC as unknown as HVACUnit), position: { x: 9, y: 9, z: 0 } }],
      });
    });
    await settle(2000);
    expect(layoutPuts()).toHaveLength(0);

    releaseLayout(null);
    await settle(2000);
    expect(layoutPuts()).toHaveLength(0);
  });

  it('does not re-save when the layout is set back to an identical value', async () => {
    await mountHydrated();
    const before = useSimulationStore.getState().hvacUnits;

    act(() => { useSimulationStore.setState({ hvacUnits: [...before] }); });
    await settle(2000);

    expect(layoutPuts()).toHaveLength(0);
  });
});
