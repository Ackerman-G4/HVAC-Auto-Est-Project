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
    <section className="rounded-[1.3rem] border border-[color:var(--border)] bg-[color:var(--surface-1)]/90">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <h4 className="display-heading text-lg font-extrabold tracking-[-0.02em] text-[color:var(--foreground)]">
            {title}
          </h4>
          {subtitle && <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{subtitle}</p>}
        </div>
        <ChevronDown
          size={20}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
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
            <div className="border-t border-[color:var(--border)] px-5 py-5 sm:px-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
