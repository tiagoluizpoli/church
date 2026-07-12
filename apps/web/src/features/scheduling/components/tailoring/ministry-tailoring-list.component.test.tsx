import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MinistryTailoringList } from './ministry-tailoring-list';
import { renderWithProviders } from '@/__tests__/setup/render';
import type { MinistryTailoringSummaryRow } from '@/features/scheduling/components/participation-tailoring.utils';

const ROWS: MinistryTailoringSummaryRow[] = [
  {
    ministryId: 'ministry-1',
    ministryName: 'Greeters',
    eventCount: 3,
    slotCount: 9,
  },
  {
    ministryId: 'ministry-2',
    ministryName: 'Untouched Ministry',
    eventCount: 0,
    slotCount: 0,
  },
];

describe('MinistryTailoringList desktop table (US1/T010)', () => {
  it('renders per-ministry event/slot counts as table rows, including 0/0', async () => {
    renderWithProviders(
      <MinistryTailoringList rows={ROWS} onSelectMinistry={vi.fn()} />,
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

  it('calls onSelectMinistry when a row is activated', async () => {
    const onSelectMinistry = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MinistryTailoringList rows={ROWS} onSelectMinistry={onSelectMinistry} />,
    );

    const table = screen.getByRole('grid', { name: 'Ministries' });
    await user.click(within(table).getByRole('row', { name: /Greeters/ }));

    expect(onSelectMinistry).toHaveBeenCalledWith({ ministryId: 'ministry-1' });
  });

  it('shows an empty-state message instead of an empty table when there are no ministries', () => {
    renderWithProviders(
      <MinistryTailoringList rows={[]} onSelectMinistry={vi.fn()} />,
    );

    expect(
      screen.getByTestId('ministry-tailoring-empty-state'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});

describe('MinistryTailoringList mobile card list (US1/T011)', () => {
  it('renders the same per-ministry data as cards, matching cycle-list-card responsive pattern', () => {
    renderWithProviders(
      <MinistryTailoringList rows={ROWS} onSelectMinistry={vi.fn()} />,
    );

    const list = screen.getByRole('listbox');
    const cards = within(list).getAllByRole('option');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Greeters');
    expect(cards[0]).toHaveTextContent('3 events');
    expect(cards[0]).toHaveTextContent('9 slots');
    expect(cards[1]).toHaveTextContent('Untouched Ministry');
    expect(cards[1]).toHaveTextContent('0 events');
    expect(cards[1]).toHaveTextContent('0 slots');
  });

  it('calls onSelectMinistry when a card is activated', async () => {
    const onSelectMinistry = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MinistryTailoringList rows={ROWS} onSelectMinistry={onSelectMinistry} />,
    );

    await user.click(screen.getByTestId('ministry-tailoring-card-ministry-2'));

    expect(onSelectMinistry).toHaveBeenCalledWith({ ministryId: 'ministry-2' });
  });
});
