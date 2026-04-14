'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, Thermometer, Droplets } from 'lucide-react';
import { HvacLogo } from '@/components/ui/hvac-logo';
import { Z } from '@/lib/utils/z-indexes';

interface WelcomeOverlayProps {
  open: boolean;
  userName?: string | null;
  onComplete?: () => void;
}

function getGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function WelcomeOverlay({ open, userName, onComplete }: WelcomeOverlayProps) {
  const [timeText, setTimeText] = React.useState('');

  React.useEffect(() => {
    if (!open) return;

    const updateClock = () => {
      const now = new Date();
      const day = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      setTimeText(`${day} - ${time}`);
    };

    updateClock();
    const timer = window.setInterval(updateClock, 1000 * 20);
    const autoClose = window.setTimeout(() => onComplete?.(), 2200);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(autoClose);
    };
  }, [open, onComplete]);

  const greeting = getGreeting(new Date());
  const name = userName?.trim() || 'Engineer';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 flex items-center justify-center bg-background/85 px-4 backdrop-blur-md"
          style={{ zIndex: Z.welcome }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
            className="w-full max-w-5xl rounded-3xl border border-border/70 bg-card/70 p-8 shadow-2xl"
          >
            <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Welcome back
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {greeting}, {name}
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">{timeText}</p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground">
                    <Thermometer size={13} className="text-primary" />
                    24.3 C ambient
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground">
                    <Droplets size={13} className="text-accent" />
                    54% RH
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground">
                    <Wind size={13} className="text-primary" />
                    Airflow nominal
                  </div>
                </div>
              </div>

              <div className="relative flex min-h-56 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.25),transparent_40%),radial-gradient(circle_at_70%_70%,rgba(34,197,94,0.22),transparent_42%)]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                  className="absolute h-28 w-28 rounded-full border border-primary/50"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                  className="absolute h-16 w-16 rounded-full border border-accent/60"
                />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card/80">
                  <HvacLogo variant="color" size={40} />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
