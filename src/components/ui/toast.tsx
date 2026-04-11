'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toastVariants } from '@/animations/shared';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

let toastListeners: ((toast: Toast) => void)[] = [];

export function showToast(type: ToastType, title: string, message?: string, duration = 4000) {
  const toast: Toast = { id: Date.now().toString(), type, title, message, duration };
  toastListeners.forEach((listener) => listener(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => removeToast(toast.id), toast.duration || 4000)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts, removeToast]);

  const icons = {
    success: <CheckCircle size={18} className="text-success" />,
    error: <AlertCircle size={18} className="text-destructive" />,
    warning: <AlertTriangle size={18} className="text-warning" />,
    info: <Info size={18} className="text-accent" />,
  };

  const borderColors = {
    success: 'border-l-[color:var(--success)]',
    error: 'border-l-[color:var(--destructive)]',
    warning: 'border-l-[color:var(--warning)]',
    info: 'border-l-[color:var(--accent)]',
  };

  const iconCapsules = {
    success: 'border-[rgba(43,159,115,0.35)] bg-[rgba(43,159,115,0.12)]',
    error: 'border-[rgba(216,77,87,0.35)] bg-[rgba(216,77,87,0.12)]',
    warning: 'border-[rgba(219,142,47,0.35)] bg-[rgba(219,142,47,0.12)]',
    info: 'border-[rgba(15,139,141,0.32)] bg-[rgba(15,139,141,0.12)]',
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3 sm:right-6 sm:top-6">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            variants={toastVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-[var(--panel-shadow)] backdrop-blur-md border-l-4',
              borderColors[toast.type]
            )}
          >
            <div className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border', iconCapsules[toast.type])}>
              {icons[toast.type]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{toast.title}</p>
              {toast.message && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="rounded-xl border border-transparent p-1 text-muted-foreground transition-colors hover:border-border/70 hover:bg-secondary/80 hover:text-foreground"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

