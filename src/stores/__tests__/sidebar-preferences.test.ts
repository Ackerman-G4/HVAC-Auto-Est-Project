// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * Sidebar preferences survive resize and reload.
 *
 * Two failures this covers:
 *
 *  - The shell applied a width-based sidebar default on every breakpoint
 *    crossing, so someone who expanded the sidebar at 1200px watched it snap
 *    shut on the next resize.
 *  - Nav group expansion was a single `useState` shared by *every* group, so
 *    toggling "CFD Simulation" also toggled "Estimation", and both reset on
 *    reload.
 */

/** Fresh store instance, so module-level localStorage reads re-run. */
async function freshStore() {
  vi.resetModules();
  const mod = await import('../ui-store');
  return mod.useUIStore;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('sidebar collapse preference', () => {
  it('starts with no recorded preference', async () => {
    const store = await freshStore();
    expect(store.getState().sidebarCollapsedByUser).toBe(false);
  });

  it('lets the viewport set the default before the user has chosen', async () => {
    const store = await freshStore();
    store.getState().applyResponsiveSidebar(true);
    expect(store.getState().sidebarCollapsed).toBe(true);
  });

  it('stops the viewport overriding an explicit choice', async () => {
    const store = await freshStore();

    store.getState().toggleSidebar(); // user expands/collapses deliberately
    const chosen = store.getState().sidebarCollapsed;

    // A resize crossing the 1440px threshold.
    store.getState().applyResponsiveSidebar(!chosen);

    expect(store.getState().sidebarCollapsed).toBe(chosen);
  });

  it('remembers the choice across a reload', async () => {
    const first = await freshStore();
    first.getState().setSidebarCollapsed(true);

    const reloaded = await freshStore();
    expect(reloaded.getState().sidebarCollapsed).toBe(true);
    expect(reloaded.getState().sidebarCollapsedByUser).toBe(true);
  });

  it('treats a reloaded preference as explicit, so the viewport still cannot override it', async () => {
    const first = await freshStore();
    first.getState().setSidebarCollapsed(false);

    const reloaded = await freshStore();
    reloaded.getState().applyResponsiveSidebar(true);

    expect(reloaded.getState().sidebarCollapsed).toBe(false);
  });
});

describe('nav group expansion', () => {
  it('tracks groups independently', async () => {
    const store = await freshStore();

    store.getState().setNavGroupOpen('Estimation', true);
    store.getState().setNavGroupOpen('CFD Simulation', false);

    expect(store.getState().navGroupsOpen).toEqual({
      Estimation: true,
      'CFD Simulation': false,
    });
  });

  it('does not disturb one group when another is toggled', async () => {
    // The original bug: both groups read the same boolean.
    const store = await freshStore();

    store.getState().setNavGroupOpen('Estimation', true);
    store.getState().setNavGroupOpen('CFD Simulation', true);
    store.getState().setNavGroupOpen('CFD Simulation', false);

    expect(store.getState().navGroupsOpen.Estimation).toBe(true);
  });

  it('survives a reload', async () => {
    const first = await freshStore();
    first.getState().setNavGroupOpen('Estimation', true);

    const reloaded = await freshStore();
    expect(reloaded.getState().navGroupsOpen.Estimation).toBe(true);
  });

  it('ignores a malformed stored payload rather than rendering from it', async () => {
    localStorage.setItem('hvac-nav-groups-open', '{"Estimation":"yes","CFD":true}');
    const store = await freshStore();

    expect(store.getState().navGroupsOpen).toEqual({ CFD: true });
  });

  it('survives unparseable storage', async () => {
    localStorage.setItem('hvac-nav-groups-open', 'not json');
    const store = await freshStore();

    expect(store.getState().navGroupsOpen).toEqual({});
  });
});
