'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { modalOverlayVariants, modalContentVariants } from '@/animations/modal-variants';
import { Z } from '@/lib/utils/z-indexes';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const FOCUSABLE_SELECTOR = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, description, children, size = 'md', className }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = title ? 'dialog-title' : undefined;
  const descId = description ? 'dialog-desc' : undefined;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      // Auto-focus first focusable element
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        first?.focus();
      });
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw]',
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6" style={{ zIndex: Z.modal }}>
          <motion.div
            className="fixed inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(206,161,74,0.16),rgba(11,18,29,0.82)_62%)] backdrop-blur-sm"
            variants={modalOverlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className={cn(
              'relative w-full rounded-2xl border border-border/70 bg-card/80 shadow-(--panel-shadow-strong) backdrop-blur-xl',
              'max-h-[88vh] overflow-y-auto',
              sizes[size],
              className
            )}
            style={{ zIndex: Z.modal }}
            variants={modalContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {(title || description) && (
              <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/70 bg-card/60 px-6 py-5 backdrop-blur-md sm:px-8">
                <div>
                  {title && <h2 id={titleId} className="text-xl font-bold tracking-tight text-foreground">{title}</h2>}
                  {description && <p id={descId} className="mt-1 text-sm font-medium text-muted-foreground">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-xl border border-transparent bg-secondary/80 p-2 text-muted-foreground transition-colors hover:border-border/70 hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            )}
            <div className="p-6 sm:p-7">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="mt-5 flex justify-end gap-3 border-t border-border/70 pt-4">
        <Button onClick={onClose} variant="outline" disabled={isLoading}>
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isLoading}
          variant={variant === 'destructive' ? 'destructive' : 'primary'}
          isLoading={isLoading}
        >
          {confirmText}
        </Button>
      </div>
    </Dialog>
  );
}


