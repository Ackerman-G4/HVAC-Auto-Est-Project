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
    <section className={`overflow-hidden rounded-xl border border-border bg-card shadow-sm ${className}`}>
      {(title || subtitle || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-8 py-6">
          <div>
            {title && <h3 className="display-heading text-base font-semibold tracking-tight text-foreground">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-8 py-6">{children}</div>
    </section>
  );
}
