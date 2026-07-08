import { type Variants } from 'framer-motion';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/ui/motion';

// All page/overlay transitions draw from the single motion vocabulary
// (src/lib/ui/motion.ts): 150/250/400ms, cubic-bezier(0.2,0,0,1). No bounce.

// Page transition variants — fade + slight slide, quick in / quicker out.
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.panel,
      ease: MOTION_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: MOTION_DURATION.micro,
      ease: MOTION_EASE,
    },
  },
};

// Slide from right (for detail pages)
export const slideRightVariants: Variants = {
  initial: {
    opacity: 0,
    x: 24,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: MOTION_DURATION.page,
      ease: MOTION_EASE,
    },
  },
  exit: {
    opacity: 0,
    x: -16,
    transition: {
      duration: MOTION_DURATION.panel,
      ease: MOTION_EASE,
    },
  },
};

// Fade only (subtle transitions)
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: MOTION_DURATION.panel, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: MOTION_DURATION.micro, ease: MOTION_EASE },
  },
};

// Scale up (for modals and overlays)
export const scaleVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: MOTION_DURATION.panel,
      ease: MOTION_EASE,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: {
      duration: MOTION_DURATION.micro,
      ease: MOTION_EASE,
    },
  },
};
