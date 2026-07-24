import { type Variants } from 'framer-motion';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/ui/motion';

// Staggered reveal (plan §6.1): list/grid items fade+slide in on load with a
// 40ms cascade instead of popping in at once. Sourced from the single motion
// vocabulary (src/lib/ui/motion.ts).

const STAGGER = 0.04; // 40ms cascade
const DELAY_CHILDREN = 0.06;

export const listContainerVariants: Variants = {
  initial: {},
  hidden: {},
  animate: {
    transition: {
      staggerChildren: STAGGER,
      delayChildren: DELAY_CHILDREN,
    },
  },
  visible: {
    transition: {
      staggerChildren: STAGGER,
      delayChildren: DELAY_CHILDREN,
    },
  },
};

export const listItemVariants: Variants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  hidden: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.panel,
      ease: MOTION_EASE,
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.panel,
      ease: MOTION_EASE,
    },
  },
};

export const tableRowVariants: Variants = {
  initial: {
    opacity: 0,
    x: -8,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: MOTION_DURATION.micro,
      ease: MOTION_EASE,
    },
  },
};

export const cardGridVariants: Variants = {
  initial: {},
  hidden: {},
  animate: {
    transition: {
      staggerChildren: STAGGER,
    },
  },
  visible: {
    transition: {
      staggerChildren: STAGGER,
    },
  },
};

export const cardItemVariants: Variants = {
  initial: {
    opacity: 0,
    y: 16,
    scale: 0.98,
  },
  hidden: {
    opacity: 0,
    y: 16,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: MOTION_DURATION.page,
      ease: MOTION_EASE,
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: MOTION_DURATION.page,
      ease: MOTION_EASE,
    },
  },
};
