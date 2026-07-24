'use client';

/**
 * CountUp — animates a number from 0 to its value on first mount only (plan
 * §6.1: "numbers animate by counting only on first computation"). Re-renders
 * show the final value instantly. Collapses to the final value immediately under
 * prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from 'react';
import { MOTION_DURATION, usePrefersReducedMotion } from '@/lib/ui/motion';

interface CountUpProps {
  value: number;
  /** Format the displayed number (e.g. locale, currency, unit). */
  format?: (n: number) => string;
  /** Seconds; defaults to the page-motion duration. */
  duration?: number;
  className?: string;
}

// easeOutCubic — matches the "nothing bounces" motion vocabulary.
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUp({ value, format, duration = MOTION_DURATION.page * 2, className }: CountUpProps) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      // After the initial count-up, reflect subsequent value changes instantly.
      setDisplay(value);
      return;
    }
    started.current = true;
    if (reduced || duration <= 0) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      setDisplay(from + (value - from) * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intentionally mount-only: the count-up plays once, on first computation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const text = format ? format(display) : String(Math.round(display));
  return <span className={className}>{text}</span>;
}
