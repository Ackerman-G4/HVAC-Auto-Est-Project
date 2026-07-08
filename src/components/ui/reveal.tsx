'use client';

/**
 * Staggered reveal (plan §Phase 1). When a collection populates — project
 * cases, dashboard cards — items fade + slide in with a ~40ms cascade instead
 * of popping in at once, so the eye can follow the list assembling. Under
 * prefers-reduced-motion the cascade collapses to a single instant paint
 * (motion removed, information kept).
 *
 *   <Stagger>
 *     {items.map((it) => <StaggerItem key={it.id}>…</StaggerItem>)}
 *   </Stagger>
 */

import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { MOTION_DURATION, MOTION_EASE, usePrefersReducedMotion } from '@/lib/ui/motion';
import { cn } from '@/lib/utils/cn';

const STAGGER = 0.04; // 40ms cascade

function containerVariants(reduced: boolean): Variants {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduced ? 0 : STAGGER,
        delayChildren: reduced ? 0 : 0.05,
      },
    },
  };
}

function itemVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: MOTION_DURATION.panel, ease: MOTION_EASE },
    },
  };
}

interface StaggerProps {
  children: React.ReactNode;
  className?: string;
  /** Element to render as the container. Defaults to a div. */
  as?: 'div' | 'ul' | 'ol' | 'section';
}

export function Stagger({ children, className, as = 'div' }: StaggerProps) {
  const reduced = usePrefersReducedMotion();
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      variants={containerVariants(reduced)}
      initial="hidden"
      animate="show"
    >
      {children}
    </MotionTag>
  );
}

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
}

export function StaggerItem({ children, className, as = 'div' }: StaggerItemProps) {
  const reduced = usePrefersReducedMotion();
  const MotionTag = motion[as];
  return (
    <MotionTag className={cn(className)} variants={itemVariants(reduced)}>
      {children}
    </MotionTag>
  );
}
