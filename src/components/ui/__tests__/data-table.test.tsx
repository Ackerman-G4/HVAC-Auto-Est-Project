// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../data-table';

/**
 * DataTable replaces per-page hand-rolled tables.
 *
 * The behaviours worth pinning are the ones each hand-rolled copy got wrong in
 * its own way: sorting that no keyboard could reach, numeric columns that were
 * not tabular so digits did not line up, and no announced sort state.
 */

interface Row {
  name: string;
  qty: number;
  unit: string;
}

const DATA: Row[] = [
  { name: 'Copper pipe', qty: 120, unit: 'm' },
  { name: 'Ductwork', qty: 8, unit: 'm²' },
  { name: 'AHU-1', qty: 1000, unit: 'pc' },
];

const COLUMNS: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Material' },
  { accessorKey: 'qty', header: 'Qty', meta: { numeric: true } },
  { accessorKey: 'unit', header: 'Unit', meta: { hideBelow: 'md' } },
];

const renderTable = (props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) =>
  render(<DataTable data={DATA} columns={COLUMNS} {...props} />);

/** Body rows, in render order. */
function bodyRowText() {
  const body = document.querySelector('tbody')!;
  return within(body)
    .getAllByRole('row')
    .map((r) => r.textContent ?? '');
}

afterEach(cleanup);

describe('DataTable rendering', () => {
  it('renders every row', () => {
    renderTable();
    expect(bodyRowText()).toHaveLength(3);
  });

  it('shows an empty message instead of a bare table', () => {
    render(<DataTable data={[]} columns={COLUMNS} emptyMessage="No materials yet." />);
    expect(screen.getByText('No materials yet.')).toBeDefined();
  });

  it('right-aligns and tabularises numeric columns', () => {
    // A column of costs whose digits do not line up is unreadable.
    renderTable();
    const cell = screen.getByText('120');
    expect(cell.className).toContain('tabular-nums');
    expect(cell.className).toContain('text-right');
  });

  it('does not tabularise text columns', () => {
    renderTable();
    expect(screen.getByText('Copper pipe').className).not.toContain('tabular-nums');
  });

  it('keeps responsively hidden columns in the DOM so sorting still sees them', () => {
    renderTable();
    const cell = screen.getByText('m²');
    expect(cell.className).toContain('md:table-cell');
  });
});

describe('DataTable sorting', () => {
  it('sorts from a real button, so it is keyboard reachable', () => {
    // Several hand-rolled tables sorted from onClick on the <th> itself.
    renderTable();
    expect(screen.getByRole('button', { name: /Material/ })).toBeDefined();
  });

  /** The Qty cell of each body row, in render order. */
  function qtyColumn() {
    const body = document.querySelector('tbody')!;
    return within(body)
      .getAllByRole('row')
      .map((r) => r.querySelectorAll('td')[1].textContent);
  }

  it('sorts a numeric column largest-first on the first click', () => {
    // TanStack's default for number columns, and the right one here: clicking
    // "Total" on a BOQ means "show me the biggest cost". Text columns still
    // sort A-Z first. Asserted explicitly because the asymmetry is surprising.
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Qty/ }));
    expect(qtyColumn()).toEqual(['1000', '120', '8']);
  });

  it('reverses on the second click', () => {
    renderTable();
    const qtySort = screen.getByRole('button', { name: /Qty/ });

    fireEvent.click(qtySort);
    fireEvent.click(qtySort);
    expect(qtyColumn()).toEqual(['8', '120', '1000']);
  });

  it('sorts a text column A-Z first', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Material/ }));
    expect(bodyRowText()[0]).toContain('AHU-1');
  });

  it('sorts numbers numerically, not as strings', () => {
    // The bug this catches: "1000" < "120" < "8" under string comparison.
    renderTable();
    const qtySort = screen.getByRole('button', { name: /Qty/ });
    fireEvent.click(qtySort);
    fireEvent.click(qtySort);
    expect(qtyColumn()).toEqual(['8', '120', '1000']);
  });

  it('announces sort state on the header cell', () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: /Qty/ });
    expect(header.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: /Qty/ }));
    expect(header.getAttribute('aria-sort')).toBe('descending');
  });
});

describe('DataTable filtering', () => {
  it('filters across columns', () => {
    renderTable({ searchPlaceholder: 'Search materials' });

    fireEvent.change(screen.getByLabelText('Search materials'), {
      target: { value: 'duct' },
    });

    expect(bodyRowText()).toHaveLength(1);
    expect(bodyRowText()[0]).toContain('Ductwork');
  });

  it('labels the search field rather than relying on the placeholder', () => {
    // Placeholder text disappears as soon as someone types, so it is not a name.
    renderTable({ searchPlaceholder: 'Search materials' });
    expect(screen.getByLabelText('Search materials')).toBeDefined();
  });

  it('has no search field when none is requested', () => {
    renderTable();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
