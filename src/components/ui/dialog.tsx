'use client';

import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { modalOverlayVariants, modalContentVariants } from '@/animations/modal-variants';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, size = 'md', className }: DialogProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleEscape]);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            className="fixed inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(206,161,74,0.16),rgba(11,18,29,0.82)_62%)] backdrop-blur-sm"
            variants={modalOverlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            className={cn(
              'relative z-50 w-full rounded-2xl border border-border/70 bg-background/95 shadow-[0_36px_74px_-46px_rgba(19,32,51,0.82)]',
              'max-h-[88vh] overflow-y-auto',
              sizes[size],
              className
            )}
            variants={modalContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {(title || description) && (
              <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/60 bg-card/90 px-6 py-5 backdrop-blur sm:px-8">
                <div>
                  {title && <h2 className="text-xl font-bold tracking-tight text-[color:var(--foreground)]">{title}</h2>}
                  {description && <p className="mt-1 text-sm font-medium text-[color:var(--muted-foreground)]">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-full border border-transparent bg-secondary/70 p-2 text-[color:var(--muted-foreground)] transition-colors hover:border-border/70 hover:bg-secondary hover:text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
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
      <div className="mt-5 flex justify-end gap-3 border-t border-border/55 pt-4">
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


