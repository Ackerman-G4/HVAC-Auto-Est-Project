'use client';

import React, { useId } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The search / filter / action strip above a list.
 *
 * `/projects` and `/materials` each hand-rolled this, which is how their search
 * inputs ended up with different heights, different placeholder wording, and —
 * in both cases — no label at all.
 *
 * The search field is labelled rather than relying on the placeholder:
 * placeholder text disappears the moment someone types, so it is not a name.
 */

export interface ToolbarProps {
  /** Omit to hide the search field. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Accessible name for the search field. Defaults to the placeholder. */
  searchLabel?: string;
  /** Filters, sort controls, view toggles. */
  children?: React.ReactNode;
  /** Right-aligned primary actions. */
  actions?: React.ReactNode;
  className?: string;
}

export function Toolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search',
  searchLabel,
  children,
  actions,
  className,
}: ToolbarProps) {
  const searchId = `toolbar-search-${useId()}`;
  const showSearch = typeof searchValue === 'string' && !!onSearchChange;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 sm:flex-nowrap',
        className,
      )}
    >
      {showSearch ? (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor={searchId} className="sr-only">
            {searchLabel ?? searchPlaceholder}
          </label>
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={searchId}
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-sm border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/55"
          />
        </div>
      ) : null}

      {children ? <div className="flex items-center gap-2">{children}</div> : null}

      {actions ? (
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
