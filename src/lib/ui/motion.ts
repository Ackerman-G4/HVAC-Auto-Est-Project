/**
 * Motion vocabulary (plan §6.1). One system, used everywhere:
 *   durations 150ms micro / 250ms panel / 400ms page,
 *   easing cubic-bezier(0.2, 0, 0, 1) — nothing bounces in an engineering tool.
 * Motion must encode meaning (state change, causality, spatial continuity); if
 * removing it loses no information, remove it. prefers-reduced-motion collapses
 * everything to opacity fades — an accessibility requirement, not a preference.
 */

export const MOTION_DURATION = {
  micro: 0.15,
  panel: 0.25,
  page: 0.4,
} as const;

/** cubic-bezier(0.2, 0, 0, 1) */
export const MOTION_EASE: [number, number, number, number] = [0.2, 0, 0, 1];

export const panelTransition = { duration: MOTION_DURATION.panel, ease: MOTION_EASE };
export const microTransition = { duration: MOTION_DURATION.micro, ease: MOTION_EASE };
export const pageTransition = { duration: MOTION_DURATION.page, ease: MOTION_EASE };

// ── prefers-reduced-motion (SSR-safe, live-updating) ─────────────────────────
//
// framer-motion's own useReducedMotion covers DOM animation, but never reaches
// Three.js/WebGL content driven by useFrame. This hook exposes the OS setting to
// canvas components so they can pause advection (information kept, motion
// removed) — the accessibility requirement extended to the 3D viewer (Wave 8).

import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false; // assume motion on the server; the client re-syncs on mount
}

/** True when the user has requested reduced motion at the OS level. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}
