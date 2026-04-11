'use client';

import React from 'react';

export interface DenseColumn<T> {
  key: keyof T;
  header: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => React.ReactNode;
}

interface DenseDataTableProps<T extends object> {
  title: string;
  rows: T[];
  columns: DenseColumn<T>[];
  filterPlaceholder?: string;
}

function toComparable(value: unknown): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.toLowerCase();
  return String(value);
}

export function DenseDataTable<T extends object>({
  title,
  rows,
  columns,
  filterPlaceholder = 'Filter rows...',
}: DenseDataTableProps<T>) {
  const [query, setQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc');

  const filteredRows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return rows;
    }

    return rows.filter((row) =>
      columns.some((column) => String(row[column.key]).toLowerCase().includes(needle)),
    );
  }, [columns, query, rows]);

  const sortedRows = React.useMemo(() => {
    if (!sortBy) {
      return filteredRows;
    }

    const next = [...filteredRows].sort((a, b) => {
      const left = toComparable(a[sortBy]);
      const right = toComparable(b[sortBy]);

      if (left < right) return sortDirection === 'asc' ? -1 : 1;
      if (left > right) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return next;
  }, [filteredRows, sortBy, sortDirection]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h4>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={filterPlaceholder}
          className="h-9 w-65 rounded-xl border border-input bg-card/85 px-3 text-sm text-foreground backdrop-blur-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:border-primary"
        />
      </div>

      <div className="max-h-90 overflow-auto rounded-2xl border border-border/70">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-secondary/70 text-foreground backdrop-blur-sm">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`cursor-pointer border-b border-border/70 px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
                  onClick={() => {
                    if (sortBy === column.key) {
                      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortBy(column.key);
                      setSortDirection('desc');
                    }
                  }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/70 bg-card/60 hover:bg-secondary/50">
                {columns.map((column) => (
                  <td
                    key={String(column.key)}
                    className={`px-5 py-4 tabular-nums ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {column.render ? column.render(row) : String(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No rows match the active filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
