import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MinistryPrepareSummaryRow } from '@/features/scheduling/components/participation-prepare.utils';
import { MinistryPrepareList } from '@/features/scheduling/components/prepare/ministry-prepare-list';
import { renderWithProviders } from '@/tests/setup/render';

const ROWS: MinistryPrepareSummaryRow[] = [
  {
    ministryId: 'ministry-1',
    ministryName: 'Greeters',
    eventCount: 3,
    eventTimeBlockCount: 9,
  },
  {
    ministryId: 'ministry-2',
    ministryName: 'Untouched Ministry',
    eventCount: 0,
    eventTimeBlockCount: 0,
  },
];

describe('MinistryPrepareList desktop table (US1/T010)', () => {
  it('renders per-ministry event/slot counts as table rows, including 0/0', async () => {
    renderWithProviders(
      <MinistryPrepareList rows={ROWS} onSelectMinistry={vi.fn()} />,
    );

    const table = screen.getByRole('grid', { name: 'Ministries' });
    const greetersRow = within(table).getByRole('row', { name: /Greeters/ });
    expect(greetersRow).toHaveTextContent('3');
    expect(greetersRow).toHaveTextContent('9');

    const untouchedRow = within(table).getByRole('row', {
      name: /Untouched Ministry/,
    });
    const untouchedCells = within(untouchedRow).getAllByRole('gridcell');
    expect(untouchedCells[0]).toHaveTextContent('0');
    expect(untouchedCells[1]).toHaveTextContent('0');
  });

  it('renders inside the same card/panel surface as the cycle list', () => {
    renderWithProviders(
      <MinistryPrepareList rows={ROWS} onSelectMinistry={vi.fn()} />,
    );

    expect(
      screen.getByTestId('ministry-prepare-list-panel'),
    ).toBeInTheDocument();
  });

  it('sorts by a column when its header is activated', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MinistryPrepareList rows={ROWS} onSelectMinistry={vi.fn()} />,
    );

    const table = screen.getByRole('grid', { name: 'Ministries' });
    await user.click(
      within(table).getByRole('columnheader', { name: 'Events' }),
    );

    const rows = within(table).getAllByTestId(/^ministry-prepare-row-/);
    // Ascending by events: Untouched Ministry (0) before Greeters (3).
    expect(rows[0]).toHaveTextContent('Untouched Ministry');
    expect(rows[1]).toHaveTextContent('Greeters');
  });

  it('rows are inert — the explicit Prepare button is the only navigation affordance', async () => {
    const onSelectMinistry = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MinistryPrepareList rows={ROWS} onSelectMinistry={onSelectMinistry} />,
    );

    const table = screen.getByRole('grid', { name: 'Ministries' });
    const greetersRow = within(table).getByRole('row', { name: /Greeters/ });
    await user.click(greetersRow);
    expect(onSelectMinistry).not.toHaveBeenCalled();

    const buttons = screen.getAllByTestId('ministry-prepare-button-ministry-1');
    await user.click(buttons[0]);
    expect(onSelectMinistry).toHaveBeenCalledWith({
      ministryId: 'ministry-1',
    });
  });

  it('shows an empty-state message instead of an empty table when there are no ministries', () => {
    renderWithProviders(
      <MinistryPrepareList rows={[]} onSelectMinistry={vi.fn()} />,
    );

    expect(
      screen.getByTestId('ministry-prepare-empty-state'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});

describe('MinistryPrepareList mobile card list (US1/T011)', () => {
  it('renders the same per-ministry data as cards, matching cycle-list-card responsive pattern', () => {
    renderWithProviders(
      <MinistryPrepareList rows={ROWS} onSelectMinistry={vi.fn()} />,
    );

    const list = screen.getByRole('listbox');
    const cards = within(list).getAllByTestId(/^ministry-prepare-card-/);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Greeters');
    expect(cards[0]).toHaveTextContent('3 events');
    expect(cards[0]).toHaveTextContent('9 slots');
    expect(cards[1]).toHaveTextContent('Untouched Ministry');
    expect(cards[1]).toHaveTextContent('0 events');
    expect(cards[1]).toHaveTextContent('0 slots');
  });

  it("calls onSelectMinistry when a card's Prepare button is activated", async () => {
    const onSelectMinistry = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MinistryPrepareList rows={ROWS} onSelectMinistry={onSelectMinistry} />,
    );

    const list = screen.getByRole('listbox');
    const row = within(list).getByTestId('ministry-prepare-row-ministry-2');
    await user.click(
      within(row).getByTestId('ministry-prepare-button-ministry-2'),
    );

    expect(onSelectMinistry).toHaveBeenCalledWith({ ministryId: 'ministry-2' });
  });
});
