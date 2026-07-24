'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { HvacLogo } from '@/components/ui/hvac-logo';
import { Z } from '@/lib/utils/z-indexes';

const LOADING_STEPS = [
  'Initializing HVAC System...',
  'Loading Environmental Data...',
  'Preparing Calculations...',
] as const;

export function SystemLoadingScreen() {
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 850);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background" style={{ zIndex: Z.loading }}>
      <div className="pointer-events-none absolute inset-0 system-grid-bg opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(59,130,246,0.22),transparent_42%),radial-gradient(circle_at_78%_74%,rgba(34,197,94,0.18),transparent_44%)]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-xl px-6"
      >
        <div className="glass-card rounded-3xl p-8 shadow-2xl">
          <div className="mb-6 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 16, ease: 'linear' }}
              className="absolute h-28 w-28 rounded-full border border-primary/30"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
              className="absolute h-20 w-20 rounded-full border border-accent/40"
            />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-card/80">
              <HvacLogo variant="color" size={36} />
            </div>
          </div>

          <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            HVAC Studio
          </p>

          <motion.p
            key={stepIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-4 text-center text-sm font-medium text-foreground"
          >
            {LOADING_STEPS[stepIndex]}
          </motion.p>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-secondary/70">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              initial={{ width: '22%' }}
              animate={{ width: ['22%', '54%', '81%', '100%'] }}
              transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
            />
          </div>

          <div className="mt-6 flex items-center justify-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-primary/75"
                animate={{ opacity: [0.2, 1, 0.2], x: [0, 8, 16] }}
                transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.12, ease: 'easeInOut' }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
