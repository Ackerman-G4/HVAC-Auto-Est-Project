'use client';

/**
 * AutosaveIndicator (overhaul-v3 Phase 4.5).
 * A compact status pill for pages that autosave — shows saving… / saved (with
 * the time) / failed, and switches to "Offline" when the browser loses
 * connectivity. Wired to a page's existing persistence signals; it computes
 * nothing itself.
 */
import { useEffect, useState } from 'react';
import { Check, CloudOff, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  /** ISO timestamp of the last successful save, shown next to "Saved". */
  savedAt?: string | null;
  className?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AutosaveIndicator({ status, savedAt, className }: AutosaveIndicatorProps) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  let icon = <Check size={13} aria-hidden="true" />;
  let text = savedAt ? `Saved ${formatTime(savedAt)}` : 'Saved';
  let tone = 'text-muted-foreground';

  if (!online) {
    icon = <CloudOff size={13} aria-hidden="true" />;
    text = 'Offline — changes kept locally';
    tone = 'text-warning';
  } else if (status === 'saving') {
    icon = <Loader2 size={13} className="animate-spin" aria-hidden="true" />;
    text = 'Saving…';
  } else if (status === 'error') {
    icon = <TriangleAlert size={13} aria-hidden="true" />;
    text = 'Save failed';
    tone = 'text-destructive';
  } else if (status === 'idle' && !savedAt) {
    return null; // nothing saved yet, nothing to show
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium tabular-nums', tone, className)}
      role="status"
      aria-live="polite"
    >
      {icon}
      {text}
    </span>
  );
}
