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
