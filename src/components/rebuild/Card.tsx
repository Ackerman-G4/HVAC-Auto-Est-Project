import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, children, className = '' }: CardProps) {
  return (
    <section className={`overflow-hidden rounded-[1.35rem] border border-[color:var(--border)] bg-[linear-gradient(150deg,color-mix(in_oklab,var(--card)_93%,transparent),color-mix(in_oklab,var(--surface-2)_58%,transparent))] shadow-[0_18px_28px_-22px_rgba(18,28,26,0.7)] ${className}`}>
      {(title || subtitle || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] px-6 py-5 sm:px-7 sm:py-6">
          <div>
            {title && <h3 className="display-heading text-[1.35rem] font-extrabold tracking-[-0.02em] text-[color:var(--foreground)]">{title}</h3>}
            {subtitle && <p className="mt-1.5 text-sm text-[color:var(--muted-foreground)]">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-6 py-5 sm:px-7 sm:py-6">{children}</div>
    </section>
  );
}
