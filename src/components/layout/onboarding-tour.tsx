'use client';

/**
 * First-run onboarding tour (overhaul-v3 Phase 4.6).
 * A dismissible 4-step tour shown once per browser: dashboard → new project →
 * workflow rail → command palette. "Don't show again" (and finishing) persist a
 * localStorage flag so it never nags a returning user.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, FolderPlus, Route, Command, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { microTransition, usePrefersReducedMotion } from '@/lib/ui/motion';
import { Z } from '@/lib/utils/z-indexes';

const STORAGE_KEY = 'hvac-onboarding-done:v1';

const STEPS = [
  {
    icon: LayoutDashboard,
    title: 'Welcome to HVAC Studio',
    body: 'Your command center. The dashboard shows recent projects, load and cost charts, and quick actions — everything starts here.',
  },
  {
    icon: FolderPlus,
    title: 'Start a project in guided steps',
    body: 'New Project walks you through basics, building profile, and design conditions one step at a time. Your draft is saved as you go.',
  },
  {
    icon: Route,
    title: 'Follow the workflow rail',
    body: 'On every project, the rail shows the golden path — Floorplan → Loads → Equipment → Ducting → BOQ → Quotation → Reports — and where you are in it.',
  },
  {
    icon: Command,
    title: 'Jump anywhere with the palette',
    body: 'Press Ctrl/⌘ + K to open the command palette — search pages, projects, and actions. Press ? anytime to see all keyboard shortcuts.',
  },
] as const;

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Defer so it does not fight the initial paint / login greeting.
    const t = window.setTimeout(() => {
      if (window.localStorage.getItem(STORAGE_KEY) !== 'true') setOpen(true);
    }, 900);
    return () => window.clearTimeout(t);
  }, []);

  const finish = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  };

  const step = STEPS[index];
  const Icon = step.icon;
  const isLast = index === STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ zIndex: Z.welcome }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: microTransition }}
          exit={{ opacity: 0, transition: microTransition }}
          role="dialog"
          aria-modal="true"
          aria-label="Getting started tour"
        >
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" aria-hidden="true" />
          <motion.div
            className="panel-glass relative w-full max-w-md overflow-hidden rounded-lg border border-border/70 p-6 shadow-[var(--elevation-floating)]"
            initial={{ opacity: 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: microTransition }}
            exit={{ opacity: 0, y: reduced ? 0 : 8, scale: reduced ? 1 : 0.98, transition: microTransition }}
          >
            <button
              type="button"
              onClick={finish}
              aria-label="Skip tour"
              className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X size={16} />
            </button>

            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
              <Icon size={22} aria-hidden="true" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-foreground">{step.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>

            {/* Progress dots */}
            <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-accent' : 'w-1.5 bg-border'}`}
                />
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" onClick={finish} className="text-xs font-medium text-muted-foreground/80 hover:text-foreground">
                Don&apos;t show again
              </button>
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setIndex((i) => i - 1)}>Back</Button>
                )}
                {isLast ? (
                  <Button variant="accent" size="sm" onClick={finish}>Get started</Button>
                ) : (
                  <Button variant="accent" size="sm" onClick={() => setIndex((i) => i + 1)}>Next</Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
