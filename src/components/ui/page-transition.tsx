'use client';

/**
 * PageTransition (plan §Phase 1). Routes cross-fade with a slight vertical
 * slide when navigating Dashboard → Simulation Engine → … instead of hard
 * cutting. Keyed on pathname inside AnimatePresence(mode="wait") so the old
 * view finishes exiting before the new one enters. Collapses to an instant
 * opacity swap under prefers-reduced-motion.
 */

import React from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { MOTION_DURATION, MOTION_EASE, usePrefersReducedMotion } from '@/lib/ui/motion';

function variants(reduced: boolean): Variants {
  return {
    initial: { opacity: 0, y: reduced ? 0 : 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0.001 : MOTION_DURATION.panel, ease: MOTION_EASE },
    },
    exit: {
      opacity: 0,
      y: reduced ? 0 : -6,
      transition: { duration: reduced ? 0.001 : MOTION_DURATION.micro, ease: MOTION_EASE },
    },
  };
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={variants(reduced)}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
