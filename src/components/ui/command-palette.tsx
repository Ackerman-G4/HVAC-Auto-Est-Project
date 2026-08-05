'use client';

/**
 * Command Palette — Ctrl/Cmd+K (overhaul-v3 Phase 4.3).
 * Zero-dependency fuzzy launcher over navigation targets, the user's
 * projects, and app actions. Fully keyboard driven: ↑/↓ navigate,
 * Enter runs, Esc closes. Recents persisted per browser.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  FolderKanban,
  FolderPlus,
  Wind,
  Calculator,
  Boxes,
  FileSpreadsheet,
  FileText,
  Settings,
  ShieldCheck,
  Activity,
  MoonStar,
  Search,
  CornerDownLeft,
  Fan,
  ReceiptText,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useProjectStore } from '@/stores/project-store';
import { microTransition, usePrefersReducedMotion } from '@/lib/ui/motion';
import { cn } from '@/lib/utils/cn';
import { Z } from '@/lib/utils/z-indexes';

type CommandKind = 'navigation' | 'project' | 'action';

interface Command {
  id: string;
  kind: CommandKind;
  label: string;
  hint?: string;
  keywords: string;
  icon: React.ReactNode;
  run: () => void;
}

const RECENTS_KEY = 'hvac-palette-recents';
const MAX_RECENTS = 5;

// ── Fuzzy match: every query char must appear in order; scores prefer
//    word-start hits and tight clusters. Good enough, tiny, dependency-free.
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let lastHit = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return null;
    score += idx === 0 || t[idx - 1] === ' ' || t[idx - 1] === '-' ? 3 : 1;
    if (lastHit !== -1 && idx === lastHit + 1) score += 2; // consecutive bonus
    lastHit = idx;
    ti = idx + 1;
  }
  return score - t.length * 0.01; // slight preference for shorter targets
}

function loadRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  const next = [id, ...loadRecents().filter((r) => r !== id)].slice(0, MAX_RECENTS);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

const KIND_LABEL: Record<CommandKind, string> = {
  navigation: 'Go to',
  project: 'Projects',
  action: 'Actions',
};

export function CommandPalette() {
  // Visibility lives in the UI store so the header button can open the palette
  // by calling an action instead of dispatching a synthetic Cmd+K event.
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const toggleOpen = useUIStore((s) => s.toggleCommandPalette);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const reduced = usePrefersReducedMotion();

  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const theme = useUIStore((s) => s.theme);
  const projects = useProjectStore((s) => s.projects);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  // Global hotkey.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleOpen]);

  // Reset per-open state on every open, whichever route opened it. This used to
  // live in the hotkey handler, so opening from the header button reopened the
  // palette with the previous query and selection still in it.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setRecents(loadRecents());
  }, [open]);

  // On open: focus input + ensure projects are loaded (external systems only).
  useEffect(() => {
    if (!open) return;
    if (projects.length === 0) void fetchProjects();
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open, projects.length, fetchProjects]);

  const close = useCallback(() => setOpen(false), []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'nav-dashboard', kind: 'navigation', label: 'Dashboard', keywords: 'home overview start', icon: <LayoutDashboard size={16} />, run: () => go('/') },
      { id: 'nav-projects', kind: 'navigation', label: 'Projects', keywords: 'estimates list workspace', icon: <FolderKanban size={16} />, run: () => go('/projects') },
      { id: 'nav-load', kind: 'navigation', label: 'Load Calculation', keywords: 'cooling thermal btu tr', icon: <Calculator size={16} />, run: () => go('/load-calculation') },
      { id: 'nav-equipment', kind: 'navigation', label: 'Equipment Selection', keywords: 'aircon units sizing hp', icon: <Boxes size={16} />, run: () => go('/equipment-selection') },
      { id: 'nav-airflow', kind: 'navigation', label: 'Airflow & Duct Design', keywords: 'ducting cfm velocity', icon: <Fan size={16} />, run: () => go('/airflow-duct-design') },
      { id: 'nav-simulation', kind: 'navigation', label: 'Simulation', keywords: 'cfd airflow 3d openfoam', icon: <Wind size={16} />, run: () => go('/simulation') },
      { id: 'nav-quotation', kind: 'navigation', label: 'Quotation', keywords: 'quote pricing boq peso', icon: <ReceiptText size={16} />, run: () => go('/quotation') },
      { id: 'nav-materials', kind: 'navigation', label: 'Materials', keywords: 'catalog prices suppliers', icon: <FileSpreadsheet size={16} />, run: () => go('/materials') },
      { id: 'nav-reports', kind: 'navigation', label: 'Reports', keywords: 'export pdf documents', icon: <FileText size={16} />, run: () => go('/reports') },
      { id: 'nav-settings', kind: 'navigation', label: 'Settings', keywords: 'preferences account', icon: <Settings size={16} />, run: () => go('/settings') },
      { id: 'nav-admin', kind: 'navigation', label: 'Admin Portal', keywords: 'users audit prices', icon: <ShieldCheck size={16} />, run: () => go('/admin') },
      { id: 'nav-diagnostics', kind: 'navigation', label: 'Diagnostics', keywords: 'health system status', icon: <Activity size={16} />, run: () => go('/diagnostics') },
    ];

    const projectCmds: Command[] = projects.slice(0, 25).map((p) => ({
      id: `project-${p.id}`,
      kind: 'project' as const,
      label: p.name ?? 'Untitled project',
      hint: 'Open project',
      keywords: `project open ${p.name ?? ''}`,
      icon: <FolderKanban size={16} />,
      run: () => go(`/projects/${p.id}`),
    }));

    const actions: Command[] = [
      { id: 'action-new-project', kind: 'action', label: 'New Project', hint: 'Create', keywords: 'create add start estimate', icon: <FolderPlus size={16} />, run: () => go('/projects/new') },
      {
        id: 'action-toggle-theme',
        kind: 'action',
        label: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
        hint: 'Appearance',
        keywords: 'theme dark light mode appearance toggle',
        icon: <MoonStar size={16} />,
        run: () => {
          toggleTheme();
          close();
        },
      },
    ];

    return [...actions, ...nav, ...projectCmds];
  }, [projects, theme, toggleTheme, go, close]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // Empty query: recents first (in stored order), then everything else.
      const byId = new Map(commands.map((c) => [c.id, c]));
      const recentCmds = recents
        .map((id) => byId.get(id))
        .filter((c): c is Command => Boolean(c));
      const rest = commands.filter((c) => !recents.includes(c.id));
      return [...recentCmds, ...rest];
    }
    return commands
      .map((c) => ({ c, s: fuzzyScore(query, `${c.label} ${c.keywords}`) }))
      .filter((r): r is { c: Command; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c);
  }, [commands, query, recents]);

  // Derived, always-valid selection index (no state-sync effect needed).
  const clampedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${clampedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex]);

  const runCommand = useCallback(
    (cmd: Command) => {
      pushRecent(cmd.id);
      cmd.run();
    },
    [],
  );

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(Math.min(clampedIndex + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(Math.max(clampedIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[clampedIndex];
      if (cmd) runCommand(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  // Group rows for section labels while keeping one flat index for keyboard nav.
  const rows = useMemo(
    () =>
      results.map((cmd, i) => ({
        cmd,
        showHeader: !query.trim() && (i === 0 || results[i - 1].kind !== cmd.kind),
      })),
    [results, query],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-start justify-center px-4 pt-[14vh]"
          style={{ zIndex: Z.commandPalette }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: microTransition }}
          exit={{ opacity: 0, transition: microTransition }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />
          <motion.div
            className="panel-glass relative w-full max-w-xl overflow-hidden rounded-lg border border-border/70 shadow-[var(--elevation-floating)]"
            initial={{ opacity: 0, y: reduced ? 0 : -12, scale: reduced ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: microTransition }}
            exit={{ opacity: 0, y: reduced ? 0 : -8, scale: reduced ? 1 : 0.98, transition: microTransition }}
          >
            <div className="flex items-center gap-3 border-b border-border/70 px-4">
              <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search pages, projects, actions…"
                className="h-13 w-full bg-transparent py-4 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70"
                aria-label="Search commands"
              />
              <kbd className="shrink-0 rounded-sm border border-border/80 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2" role="listbox">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm font-medium text-muted-foreground">
                  No matches for &ldquo;{query}&rdquo;
                </p>
              )}
              {rows.map(({ cmd, showHeader }, index) => {
                const active = index === clampedIndex;
                return (
                  <React.Fragment key={cmd.id}>
                    {showHeader && !query && (
                      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        {KIND_LABEL[cmd.kind]}
                      </p>
                    )}
                    <button
                      type="button"
                      data-index={index}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runCommand(cmd)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent/12 text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border',
                          active
                            ? 'border-accent/40 bg-accent/10 text-accent'
                            : 'border-border/70 bg-card/60 text-muted-foreground',
                        )}
                      >
                        {cmd.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="shrink-0 text-xs text-muted-foreground/70">{cmd.hint}</span>
                      )}
                      {active && (
                        <CornerDownLeft size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="flex items-center gap-4 border-t border-border/70 px-4 py-2.5 text-[11px] font-medium text-muted-foreground/80">
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-border/80 bg-secondary/50 px-1 py-0.5">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-border/80 bg-secondary/50 px-1 py-0.5">↵</kbd> open
              </span>
              <span className="ml-auto font-mono tracking-wide">HVAC Studio</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
