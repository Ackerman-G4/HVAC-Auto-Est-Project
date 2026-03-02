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
    toasts.forEach((toast) => {
      const timer = setTimeout(() => removeToast(toast.id), toast.duration || 4000);
      return () => clearTimeout(timer);
    });
  }, [toasts, removeToast]);

  const icons = {
    success: <CheckCircle size={18} className="text-success" />,
    error: <AlertCircle size={18} className="text-destructive" />,
    warning: <AlertTriangle size={18} className="text-warning" />,
    info: <Info size={18} className="text-accent" />,
  };

  const borderColors = {
    success: 'border-l-success',
    error: 'border-l-destructive',
    warning: 'border-l-warning',
    info: 'border-l-accent',
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            variants={toastVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              'pointer-events-auto bg-card border border-border rounded-lg shadow-lg p-4 flex items-start gap-3 border-l-4',
              borderColors[toast.type]
            )}
          >
            {icons[toast.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{toast.title}</p>
              {toast.message && <p className="text-xs text-muted-foreground mt-0.5">{toast.message}</p>}
            </div>
            <button onClick={() => removeToast(toast.id)} className="text-muted-foreground hover:text-foreground p-0.5">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
