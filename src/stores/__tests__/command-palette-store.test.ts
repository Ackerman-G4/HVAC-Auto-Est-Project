import { describe, expect, it, beforeEach } from 'vitest';
import { useUIStore } from '../ui-store';

/**
 * Command palette visibility as store state.
 *
 * The header button used to open the palette by dispatching a fabricated
 * Cmd+K KeyboardEvent at window, relying on the palette's global hotkey
 * listener to catch it. That only worked by coincidence: it could not be
 * tested, it broke if the listener moved, and browsers are steadily
 * tightening what untrusted synthetic events are allowed to do.
 *
 * Any component can now call an action instead.
 */

beforeEach(() => {
  useUIStore.setState({ commandPaletteOpen: false });
});

describe('command palette state', () => {
  it('starts closed', () => {
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('opens via the action', () => {
    useUIStore.getState().setCommandPaletteOpen(true);
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
  });

  it('toggles both ways', () => {
    const { toggleCommandPalette } = useUIStore.getState();

    toggleCommandPalette();
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);

    toggleCommandPalette();
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('is idempotent when set to the value it already holds', () => {
    // The header button always opens rather than toggling, so pressing it while
    // the palette is already open must not close it.
    useUIStore.getState().setCommandPaletteOpen(true);
    useUIStore.getState().setCommandPaletteOpen(true);
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
  });
});
