'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface CollapsiblePanelProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsiblePanel({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section className="panel-glass rounded-2xl border border-border/70 shadow-[var(--panel-shadow)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-(--space-card-padding) py-5 text-left transition-colors hover:bg-secondary/30"
      >
        <div>
          <h4 className="display-heading text-base font-semibold tracking-tight text-foreground">
            {title}
          </h4>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <ChevronDown
          size={18}
          className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/70 px-(--space-card-padding) py-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
