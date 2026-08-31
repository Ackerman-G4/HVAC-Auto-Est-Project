'use client';

import React, { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The table every dense list should use.
 *
 * Tables were hand-rolled per page, each re-implementing sort and filter with
 * its own bugs and its own numeral handling, while `@tanstack/react-table` sat
 * installed and unimported. This wraps it with the house rules applied once:
 *
 *  - Numeric columns are right-aligned and tabular, so digits line up. A column
 *    of costs that does not align is unreadable and looks amateur.
 *  - The header is sticky and opaque. It is one of the few surfaces allowed to
 *    overlay content, and opaque beats translucent for a header you read
 *    against moving rows.
 *  - Sorting is driven from a real `<button>` in the header with
 *    `aria-sort` on the cell, so it is reachable and announced. Several of the
 *    hand-rolled versions sorted from an onClick on the `<th>` itself, which no
 *    keyboard user could reach.
 *  - Row density follows `[data-workspace-mode]` via `--table-row-height`.
 */

/**
 * Per-column options, set via `columnDef.meta`.
 *
 * `hideBelow` keeps secondary columns off narrow screens without dropping them
 * from the model, so sorting and filtering still see the data. The real tables
 * this replaces all did this by hand with `hidden sm:table-cell`, and losing it
 * in migration would make every table unusable on a phone.
 */
export interface DataTableColumnMeta {
  /** Right-align and use tabular figures. */
  numeric?: boolean;
  /** Hide below this breakpoint. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

// Written out rather than composed, because Tailwind only ships classes it can
// find as complete strings in the source.
const HIDE_BELOW: Record<NonNullable<DataTableColumnMeta['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Substring filter across every column. Omit to hide the search box. */
  searchPlaceholder?: string;
  /** Shown instead of the table body when there are no rows. */
  emptyMessage?: string;
  /** Accessible name for the table. */
  caption?: string;
  className?: string;
  /** Stable row key. Defaults to the row index. */
  getRowId?: (row: T, index: number) => string;
}

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder,
  emptyMessage = 'Nothing to show yet.',
  caption,
  className,
  getRowId,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    ...(getRowId ? { getRowId } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  const searchId = useMemo(
    () => `datatable-search-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  return (
    <div className={cn('w-full', className)}>
      {searchPlaceholder ? (
        <div className="mb-2">
          <label htmlFor={searchId} className="sr-only">
            {searchPlaceholder}
          </label>
          <input
            id={searchId}
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full max-w-xs rounded-sm border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/55"
          />
        </div>
      ) : null}

      {/* Wide tables scroll inside their own container; the page must never
          scroll horizontally. */}
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="sticky top-0 z-10 bg-secondary">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        !canSort
                          ? undefined
                          : sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : 'none'
                      }
                      className={cn(
                        'whitespace-nowrap border-b border-border px-4 py-2.5 text-xs font-semibold font-display text-muted-foreground',
                        meta?.numeric ? 'text-right' : 'text-left',
                        meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55',
                            meta?.numeric && 'flex-row-reverse',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp size={12} />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={12} />
                          ) : (
                            <ChevronsUpDown size={12} className="opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border last:border-0',
                    // 3% zebra tint: enough to track a row across a wide table,
                    // not enough to read as a state change.
                    i % 2 === 1 && 'bg-surface-2',
                  )}
                  style={{ height: 'var(--table-row-height)' }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-4 py-2',
                          meta?.numeric ? 'text-right tabular-nums' : 'text-left',
                          meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
