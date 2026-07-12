import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MinistryCycleList } from './ministry-cycle-list';
import { renderWithProviders } from '@/__tests__/setup/render';
import type { TailoringCycleOption } from '@/features/scheduling/components/participation-tailoring.utils';

const CYCLES: TailoringCycleOption[] = [
  { id: 'cycle-1', label: 'Aug 1 - Aug 31 · August', eventCount: 4 },
  { id: 'cycle-2', label: 'Sep 1 - Sep 30 · September', eventCount: 2 },
];

describe('MinistryCycleList (US2/T014)', () => {
  it('renders only the cycles available to the selected ministry', () => {
    renderWithProviders(
      <MinistryCycleList cycles={CYCLES} onSelectCycle={vi.fn()} />,
    );

    const table = screen.getByRole('grid', { name: 'Cycles' });
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 cycles
    expect(table).toHaveTextContent('August');
    expect(table).toHaveTextContent('September');
  });

  it('calls onSelectCycle when a row is activated', async () => {
    const onSelectCycle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MinistryCycleList cycles={CYCLES} onSelectCycle={onSelectCycle} />,
    );

    const table = screen.getByRole('grid', { name: 'Cycles' });
    await user.click(within(table).getByRole('row', { name: /August/ }));

    expect(onSelectCycle).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
  });
});

describe('MinistryCycleList empty state (US2/T015)', () => {
  it('renders an empty-state message when the ministry has zero open cycles', () => {
    renderWithProviders(
      <MinistryCycleList cycles={[]} onSelectCycle={vi.fn()} />,
    );

    expect(
      screen.getByTestId('ministry-cycle-list-empty-state'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
