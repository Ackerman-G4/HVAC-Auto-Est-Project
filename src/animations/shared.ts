// Shared animation configuration constants
export const ANIMATION_DURATION = {
  fast: 0.15,
  normal: 0.3,
  slow: 0.5,
} as const;

export const EASE_CURVES = {
  default: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
  bounce: [0.68, -0.55, 0.265, 1.55] as [number, number, number, number],
  sharp: [0.4, 0, 0.2, 1] as [number, number, number, number],
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
export const skeletonClasses = 'animate-skeleton bg-silver-light rounded';
