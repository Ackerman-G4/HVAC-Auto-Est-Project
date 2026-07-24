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
    <section className={`overflow-hidden panel-glass rounded-2xl border border-border/70 shadow-[var(--panel-shadow)] ${className}`}>
      {(title || subtitle || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-border/70 px-(--space-card-padding) py-5">
          <div>
            {title && <h3 className="display-heading text-base font-semibold tracking-tight text-foreground">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-(--space-card-padding) py-5">{children}</div>
    </section>
  );
}
