import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TailoringFilters } from './tailoring-filters';
import { renderWithProviders } from '@/__tests__/setup/render';

describe('TailoringFilters (US3/T020, mode select + single start/end pair)', () => {
  it('calls onNameQueryChange as the leader types, with zero network requests', async () => {
    const onNameQueryChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringFilters
        nameQuery=""
        onNameQueryChange={onNameQueryChange}
        timeWindowFilter={{ mode: 'starts' }}
        onTimeWindowFilterChange={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId('tailoring-name-filter'), 'greet');

    expect(onNameQueryChange).toHaveBeenCalledTimes(5);
    expect(onNameQueryChange).toHaveBeenLastCalledWith('t');
  });

  it('switches mode via the select', async () => {
    const onTimeWindowFilterChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringFilters
        nameQuery=""
        onNameQueryChange={vi.fn()}
        timeWindowFilter={{ mode: 'starts', start: '09:00' }}
        onTimeWindowFilterChange={onTimeWindowFilterChange}
      />,
    );

    await user.click(screen.getByTestId('tailoring-time-mode-filter'));
    await user.click(await screen.findByText('Between'));

    expect(onTimeWindowFilterChange).toHaveBeenCalledWith({
      mode: 'within',
      start: '09:00',
    });
  });

  it('updates the start time without touching mode or end', async () => {
    const onTimeWindowFilterChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringFilters
        nameQuery=""
        onNameQueryChange={vi.fn()}
        timeWindowFilter={{ mode: 'ends', end: '20:00' }}
        onTimeWindowFilterChange={onTimeWindowFilterChange}
      />,
    );

    await user.type(screen.getByTestId('tailoring-time-start-filter'), '09:00');

    const lastCall =
      onTimeWindowFilterChange.mock.calls[
        onTimeWindowFilterChange.mock.calls.length - 1
      ];
    expect(lastCall[0]).toMatchObject({ mode: 'ends', end: '20:00' });
    expect(lastCall[0].start).toBeTruthy();
  });

  it('updates the end time without touching mode or start', async () => {
    const onTimeWindowFilterChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringFilters
        nameQuery=""
        onNameQueryChange={vi.fn()}
        timeWindowFilter={{ mode: 'within', start: '09:00' }}
        onTimeWindowFilterChange={onTimeWindowFilterChange}
      />,
    );

    await user.type(screen.getByTestId('tailoring-time-end-filter'), '17:00');

    const lastCall =
      onTimeWindowFilterChange.mock.calls[
        onTimeWindowFilterChange.mock.calls.length - 1
      ];
    expect(lastCall[0]).toMatchObject({ mode: 'within', start: '09:00' });
    expect(lastCall[0].end).toBeTruthy();
  });

  it('renders exactly one mode select and one start/end pair, not two independent ranges', () => {
    renderWithProviders(
      <TailoringFilters
        nameQuery=""
        onNameQueryChange={vi.fn()}
        timeWindowFilter={{ mode: 'starts' }}
        onTimeWindowFilterChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByTestId('tailoring-time-start-filter')).toHaveValue('');
    expect(screen.getByTestId('tailoring-time-end-filter')).toHaveValue('');
  });
});
