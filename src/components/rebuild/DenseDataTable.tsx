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
        <h4 className="text-[13px] font-bold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">{title}</h4>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={filterPlaceholder}
          className="h-10 w-[260px] rounded-xl border border-[color:var(--input)] bg-[color:var(--surface-2)] px-3.5 text-sm text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
        />
      </div>

      <div className="max-h-[360px] overflow-auto rounded-2xl border border-[color:var(--border)]">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[color:var(--surface-3)] text-[color:var(--foreground)]">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`cursor-pointer border-b border-[color:var(--border)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.13em] ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
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
              <tr key={rowIndex} className="border-b border-[color:var(--border)] bg-[color:var(--surface-1)]/80 hover:bg-[color:var(--surface-2)]">
                {columns.map((column) => (
                  <td
                    key={String(column.key)}
                    className={`px-4 py-3 tabular-nums ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {column.render ? column.render(row) : String(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-[color:var(--muted-foreground)]">
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
