import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TailoringCalendar } from './tailoring-calendar';
import { renderWithProviders } from '@/__tests__/setup/render';

describe('TailoringCalendar cycle-bounds band (US3/T018)', () => {
  it('renders the fixed cycle-bounds band on every day inside [startDate, endDate]', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-10'),
    ).toHaveAttribute('data-cycle-band', 'true');
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-11'),
    ).toHaveAttribute('data-cycle-band', 'true');
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-12'),
    ).toHaveAttribute('data-cycle-band', 'true');
  });

  it('does not mark days outside the cycle bounds with the band', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-09'),
    ).not.toHaveAttribute('data-cycle-band', 'true');
  });

  it('layers event-day dot markers on top of the band', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    const eventDay = screen.getByTestId('tailoring-calendar-day-2026-07-11');
    expect(eventDay).toHaveAttribute('data-has-event', 'true');
    expect(eventDay).toHaveAttribute('data-cycle-band', 'true');

    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-10'),
    ).not.toHaveAttribute('data-has-event', 'true');
  });

  it('never applies the day-filter ring as part of the fixed band alone', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-11'),
    ).not.toHaveAttribute('data-day-filter', 'true');
  });
});

describe('TailoringCalendar day-filter interaction (US3/T019)', () => {
  it('applies a ring/outline day-filter (not a solid fill) when a marked day is clicked', async () => {
    const onSelectedDateChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate={null}
        onSelectedDateChange={onSelectedDateChange}
      />,
    );

    await user.click(screen.getByTestId('tailoring-calendar-day-2026-07-11'));

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-07-11');
  });

  it('clears the filter when the same filtered day is clicked again', async () => {
    const onSelectedDateChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate="2026-07-11"
        onSelectedDateChange={onSelectedDateChange}
      />,
    );

    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-11'),
    ).toHaveAttribute('data-day-filter', 'true');

    await user.click(screen.getByTestId('tailoring-calendar-day-2026-07-11'));

    expect(onSelectedDateChange).toHaveBeenCalledWith(null);
  });

  it('does not filter or fire onSelectedDateChange when clicking an unmarked day', async () => {
    const onSelectedDateChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate={null}
        onSelectedDateChange={onSelectedDateChange}
      />,
    );

    await user.click(screen.getByTestId('tailoring-calendar-day-2026-07-10'));

    expect(onSelectedDateChange).not.toHaveBeenCalled();
  });

  it('leaves the fixed cycle-bounds band unaffected by the day-filter state', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate="2026-07-11"
        onSelectedDateChange={vi.fn()}
      />,
    );

    const day = screen.getByTestId('tailoring-calendar-day-2026-07-11');
    expect(day).toHaveAttribute('data-cycle-band', 'true');
    expect(day).toHaveAttribute('data-day-filter', 'true');
  });
});
