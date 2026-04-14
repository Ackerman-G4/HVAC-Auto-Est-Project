/**
 * Centralized z-index layer system.
 * All z-index values must be sourced from this map.
 *
 * Layer hierarchy (low → high):
 *   base → elevated → stickyHeader → dropdown → modal → toast → commandPalette → overlay → loading
 */
export const Z = {
  /** Default panels, text */
  base: 0,
  /** Hover states, selected items */
  elevated: 10,
  /** Table headers, section titles */
  stickyHeader: 20,
  /** Select menus, tooltips */
  dropdown: 30,
  /** Sidebar (desktop persistent) */
  sidebar: 40,
  /** Confirmation dialogs, forms */
  modal: 50,
  /** Command palette (Cmd+K) */
  commandPalette: 60,
  /** Toast / notifications */
  toast: 100,
  /** Welcome overlay */
  welcome: 110,
  /** System loading screen */
  loading: 120,
} as const;

export type ZLayer = keyof typeof Z;
