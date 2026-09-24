import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Selection, SortDescriptor } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import {
  DataTable,
  type DataTableCellInput,
  type DataTableColumn,
  type DataTableItemInput,
} from './data-table';

interface Row {
  id: string;
  name: string;
  count: number;
}

const ROWS: Row[] = [
  { id: 'row-1', name: 'Alpha', count: 2 },
  { id: 'row-2', name: 'Beta', count: 5 },
];

const COLUMNS: DataTableColumn[] = [
  { id: 'name', name: 'Name', allowsSorting: true, isRowHeader: true },
  { id: 'count', name: 'Count', allowsSorting: true },
  { id: 'actions', name: 'Actions' },
];

function renderCell({ item, column }: DataTableCellInput<Row>) {
  if (column.id === 'name') return item.name;
  if (column.id === 'count') return item.count;
  return null;
}

function renderMobileCard({ item }: DataTableItemInput<Row>) {
  return <div data-testid={`mobile-card-${item.id}`}>{item.name}</div>;
}

describe('DataTable', () => {
  it('renders both the desktop table and mobile card list for the same items', () => {
    render(
      <DataTable
        aria-label="Rows"
        columns={COLUMNS}
        items={ROWS}
        rowId={({ item }) => item.id}
        renderCell={renderCell}
        renderMobileCard={renderMobileCard}
      />,
    );

    const table = screen.getByRole('grid', { name: 'Rows' });
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 rows
    expect(table).toHaveTextContent('Alpha');
    expect(table).toHaveTextContent('Beta');

    expect(screen.getByTestId('mobile-card-row-1')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('mobile-card-row-2')).toHaveTextContent('Beta');
  });

  it('renders row actions in the desktop actions column and appended under each mobile card', () => {
    const rowActions = vi.fn(({ item }: DataTableItemInput<Row>) => (
      <button type="button" data-testid={`action-${item.id}`}>
        Act on {item.name}
      </button>
    ));

    render(
      <DataTable
        aria-label="Rows"
        columns={COLUMNS}
        items={ROWS}
        rowId={({ item }) => item.id}
        renderCell={renderCell}
        renderMobileCard={renderMobileCard}
        rowActions={rowActions}
      />,
    );

    // One instance in the desktop table's actions cell, one under the
    // mobile card — both rendered regardless of viewport (jsdom doesn't
    // apply the `md:hidden`/`hidden md:block` layout classes). The mobile
    // list renders before the desktop table in DOM order.
    expect(screen.getAllByTestId('action-row-1')).toHaveLength(2);
    const mobileCard = screen.getByTestId('mobile-card-row-1');
    expect(mobileCard.parentElement).toContainElement(
      screen.getAllByTestId('action-row-1')[0] as HTMLElement,
    );
  });

  it('shows the loading state instead of any table or card content', () => {
    render(
      <DataTable
        aria-label="Rows"
        columns={COLUMNS}
        items={ROWS}
        rowId={({ item }) => item.id}
        renderCell={renderCell}
        renderMobileCard={renderMobileCard}
        isLoading
      />,
    );

    expect(screen.getByTestId('data-table-loading-state')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-card-row-1')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no items, not the table', () => {
    render(
      <DataTable
        aria-label="Rows"
        columns={COLUMNS}
        items={[]}
        rowId={({ item }) => item.id}
        renderCell={renderCell}
        renderMobileCard={renderMobileCard}
      />,
    );

    expect(screen.getByTestId('data-table-empty-state')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('supports a custom loading and empty content', () => {
    const { rerender } = render(
      <DataTable
        aria-label="Rows"
        columns={COLUMNS}
        items={ROWS}
        rowId={({ item }) => item.id}
        renderCell={renderCell}
        renderMobileCard={renderMobileCard}
        isLoading
        loadingContent={<p data-testid="custom-loading">Fetching…</p>}
      />,
    );
    expect(screen.getByTestId('custom-loading')).toBeInTheDocument();

    rerender(
      <DataTable
        aria-label="Rows"
        columns={COLUMNS}
        items={[]}
        rowId={({ item }) => item.id}
        renderCell={renderCell}
        renderMobileCard={renderMobileCard}
        emptyContent={<p data-testid="custom-empty">Nothing here</p>}
      />,
    );
    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
  });

  it('sorts via the column header when sortDescriptor/onSortChange are wired by the consumer', async () => {
    const user = userEvent.setup();

    function Sortable() {
      const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
        column: 'name',
        direction: 'ascending',
      });
      const sorted = [...ROWS].sort((left, right) => {
        const direction = sortDescriptor.direction === 'descending' ? -1 : 1;
        return left.name.localeCompare(right.name) * direction;
      });
      return (
        <DataTable
          aria-label="Rows"
          columns={COLUMNS}
          items={sorted}
          rowId={({ item }) => item.id}
          renderCell={renderCell}
          renderMobileCard={renderMobileCard}
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
        />
      );
    }

    render(<Sortable />);
    const table = screen.getByRole('grid', { name: 'Rows' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Alpha');

    await user.click(within(table).getByRole('columnheader', { name: 'Name' }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Beta');
  });

  it('passes through single-selection semantics', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    function Selectable() {
      const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
      return (
        <DataTable
          aria-label="Rows"
          columns={COLUMNS}
          items={ROWS}
          rowId={({ item }) => item.id}
          renderCell={renderCell}
          renderMobileCard={renderMobileCard}
          selectionMode="single"
          selectionBehavior="replace"
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => {
            setSelectedKeys(keys);
            onSelectionChange(keys);
          }}
        />
      );
    }

    render(<Selectable />);
    const table = screen.getByRole('grid', { name: 'Rows' });
    const row = within(table).getByRole('row', { name: /Alpha/ });
    await user.click(row);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(
      Array.from(onSelectionChange.mock.calls[0]?.[0] as Selection),
    ).toEqual(['row-1']);
    expect(row).toHaveAttribute('aria-selected', 'true');
  });
});
