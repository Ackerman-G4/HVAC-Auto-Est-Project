// Shared animation constants — sourced from the single motion vocabulary
// (src/lib/ui/motion.ts). One system: durations 150/250/400ms, easing
// cubic-bezier(0.2,0,0,1). Nothing bounces in an engineering tool, so the old
// `bounce` curve was removed.
import { MOTION_DURATION, MOTION_EASE } from '@/lib/ui/motion';

export const ANIMATION_DURATION = {
  fast: MOTION_DURATION.micro,
  normal: MOTION_DURATION.panel,
  slow: MOTION_DURATION.page,
} as const;

export const EASE_CURVES = {
  default: MOTION_EASE,
  sharp: MOTION_EASE,
} as const;

// Toast notification animation
export const toastVariants = {
  initial: { opacity: 0, x: 50, y: 0 },
  animate: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: 0.3, ease: EASE_CURVES.default },
  },
  exit: {
    opacity: 0,
    x: 100,
    transition: { duration: 0.2 },
  },
};

// Sidebar animation
export const sidebarVariants = {
  open: {
    x: 0,
    transition: { duration: 0.3, ease: EASE_CURVES.default },
  },
  closed: {
    x: '-100%',
    transition: { duration: 0.25, ease: EASE_CURVES.default },
  },
};

// Tab content animation
export const tabContentVariants = {
  initial: { opacity: 0, x: 10 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
  exit: {
    opacity: 0,
    x: -10,
    transition: { duration: 0.15 },
  },
};

// Loading skeleton animation (CSS class based, see globals.css)
export const skeletonClasses = 'animate-skeleton bg-secondary rounded';
