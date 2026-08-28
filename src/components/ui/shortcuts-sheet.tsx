'use client';

/**
 * Keyboard shortcuts sheet (overhaul-v3 Phase 4.7).
 * `?` (Shift+/) opens a reference of global shortcuts; Esc closes it.
 * Also wires the navigation chords: `g d` → dashboard, `g p` → projects.
 * Registered once, globally, from the app shell.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Keyboard } from 'lucide-react';
import { microTransition, usePrefersReducedMotion } from '@/lib/ui/motion';
import { Z } from '@/lib/utils/z-indexes';

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Array<{ group: string; items: Shortcut[] }> = [
  {
    group: 'General',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Open command palette' },
      { keys: ['?'], label: 'Show this shortcuts sheet' },
      { keys: ['Esc'], label: 'Close any overlay' },
    ],
  },
  {
    group: 'Navigation',
    items: [
      { keys: ['g', 'd'], label: 'Go to dashboard' },
      { keys: ['g', 'p'], label: 'Go to projects' },
    ],
  },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function ShortcutsSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  // Tracks a pending `g` chord (with a short timeout) for two-key navigation.
  const chordRef = useRef<number | null>(null);

  useEffect(() => {
    const clearChord = () => {
      if (chordRef.current !== null) {
        window.clearTimeout(chordRef.current);
        chordRef.current = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      // `?` toggles the sheet (Shift+/ on most layouts).
      if (e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (e.key === 'Escape' && open) {
        setOpen(false);
        return;
      }

      // Navigation chords: `g` then `d`/`p`.
      if (chordRef.current !== null) {
        const key = e.key.toLowerCase();
        if (key === 'd') {
          e.preventDefault();
          router.push('/');
        } else if (key === 'p') {
          e.preventDefault();
          router.push('/projects');
        }
        clearChord();
        return;
      }

      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        chordRef.current = window.setTimeout(clearChord, 900);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearChord();
    };
  }, [open, router]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ zIndex: Z.commandPalette }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: microTransition }}
          exit={{ opacity: 0, transition: microTransition }}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <motion.div
            className="panel-glass relative w-full max-w-md overflow-hidden rounded-lg border border-border/70 p-6 shadow-[var(--elevation-floating)]"
            initial={{ opacity: 0, y: reduced ? 0 : -8, scale: reduced ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: microTransition }}
            exit={{ opacity: 0, y: reduced ? 0 : -6, scale: reduced ? 1 : 0.98, transition: microTransition }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Keyboard size={18} className="text-accent" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
            </div>
            <div className="space-y-5">
              {SHORTCUTS.map((section) => (
                <div key={section.group}>
                  <p className="mb-2 text-[10px] font-semibold font-display text-muted-foreground/70">
                    {section.group}
                  </p>
                  <ul className="space-y-2">
                    {section.items.map((s) => (
                      <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {s.keys.map((k) => (
                            <kbd
                              key={k}
                              className="rounded-sm border border-border/80 bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium text-foreground"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-[11px] text-muted-foreground/70">
              Press <kbd className="rounded border border-border/80 bg-secondary/50 px-1 py-0.5">Esc</kbd> to close
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
