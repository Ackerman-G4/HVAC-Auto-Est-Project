'use client';

import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
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
    full: 'max-w-[90vw]',
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="fixed inset-0 bg-black/40"
            variants={modalOverlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            className={cn(
              'relative z-50 w-full bg-card rounded-xl shadow-xl border border-border',
              'max-h-[85vh] overflow-y-auto',
              sizes[size],
              className
            )}
            variants={modalContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {(title || description) && (
              <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-start justify-between rounded-t-xl z-10">
                <div>
                  {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
                  {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="p-6">{children}</div>
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
      <div className="flex justify-end gap-3 mt-4">
        <button
          onClick={onClose}
          className="h-10 px-4 text-sm rounded-lg border border-border hover:bg-secondary transition-colors"
          disabled={isLoading}
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className={cn(
            'h-10 px-4 text-sm rounded-lg font-medium transition-colors',
            variant === 'destructive'
              ? 'bg-destructive text-white hover:bg-red-700'
              : 'bg-primary text-primary-foreground hover:bg-[#343A40]'
          )}
        >
          {isLoading ? 'Processing...' : confirmText}
        </button>
      </div>
    </Dialog>
  );
}
