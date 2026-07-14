import { fireEvent, screen } from '@testing-library/react';
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

  it('does not render a cell for any day outside the cycle bounds', () => {
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
      screen.queryByTestId('tailoring-calendar-day-2026-07-09'),
    ).not.toBeInTheDocument();
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
  it('selects a date after a desktop pointer press and release without dragging', () => {
    const onSelectedDateChange = vi.fn();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={onSelectedDateChange}
      />,
    );

    const day = screen.getByTestId('tailoring-calendar-day-2026-07-10');
    fireEvent.pointerDown(day, { pointerId: 1, clientX: 20 });
    fireEvent.pointerUp(day, { pointerId: 1, clientX: 20 });

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-07-10');
  });

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

  it('filters when clicking any in-cycle day, including an unmarked day', async () => {
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

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-07-10');
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

describe('TailoringCalendar strip presentation (UI-006, UI-007)', () => {
  it('uses compact rounded-square day cells with the shared horizontal scrollbar treatment', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('tailoring-calendar-day-2026-07-10')).toHaveClass(
      'size-11',
    );
    expect(
      screen
        .getByTestId('tailoring-calendar-strip')
        .closest('[data-slot="scroll-area"]'),
    ).toHaveAttribute('data-scroll-area', 'true');
  });
});

describe('TailoringCalendar day-strip render (Iteration 2/T040)', () => {
  it('renders exactly one cell per day within [cycleStartDate, cycleEndDate]', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId(/^tailoring-calendar-day-/)).toHaveLength(3);
  });

  it('shows the day-of-week abbreviation and day number on each cell', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-10"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    const cell = screen.getByTestId('tailoring-calendar-day-2026-07-10');
    expect(cell).toHaveTextContent('Fri');
    expect(cell).toHaveTextContent('10');
  });

  it('carries the event-day marker and ring/outline day-filter attributes forward onto the strip cells', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set(['2026-07-11'])}
        selectedDate="2026-07-11"
        onSelectedDateChange={vi.fn()}
      />,
    );

    const eventDay = screen.getByTestId('tailoring-calendar-day-2026-07-11');
    expect(eventDay).toHaveAttribute('data-has-event', 'true');
    expect(eventDay).toHaveAttribute('data-day-filter', 'true');
  });

  it('remains one cell per day for a cycle spanning multiple months (SC-009)', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-01"
        cycleEndDate="2026-09-30"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId(/^tailoring-calendar-day-/)).toHaveLength(92);
  });
});

describe('TailoringCalendar day-strip scroll (Iteration 2/T041)', () => {
  it('scrolls the strip right when the right chevron is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-01"
        cycleEndDate="2026-09-30"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    const strip = screen.getByTestId('tailoring-calendar-strip');
    expect(strip.scrollLeft).toBe(0);

    await user.click(screen.getByTestId('tailoring-calendar-scroll-right'));

    expect(strip.scrollLeft).toBeGreaterThan(0);
  });

  it('scrolls the strip left when the left chevron is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-01"
        cycleEndDate="2026-09-30"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    const strip = screen.getByTestId('tailoring-calendar-strip');
    strip.scrollLeft = 300;

    await user.click(screen.getByTestId('tailoring-calendar-scroll-left'));

    expect(strip.scrollLeft).toBeLessThan(300);
  });

  it('scrolls the strip in response to a pointer drag', () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-01"
        cycleEndDate="2026-09-30"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    const strip = screen.getByTestId('tailoring-calendar-strip');
    const dragSurface = screen.getByTestId('tailoring-calendar-drag-surface');
    fireEvent.pointerDown(dragSurface, {
      pointerId: 1,
      clientX: 200,
      buttons: 1,
    });
    fireEvent.pointerMove(dragSurface, {
      pointerId: 1,
      clientX: 100,
      buttons: 1,
    });

    expect(strip.scrollLeft).toBe(100);

    fireEvent.pointerUp(dragSurface, { pointerId: 1 });
  });

  it("does not start the strip's custom drag logic from the scrollbar area", () => {
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-01"
        cycleEndDate="2026-09-30"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    const strip = screen.getByTestId('tailoring-calendar-strip');
    const scrollArea = strip.closest('[data-slot="scroll-area"]');
    if (!scrollArea) {
      throw new Error('Expected scroll area root.');
    }

    fireEvent.pointerDown(scrollArea, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(scrollArea, {
      pointerId: 1,
      clientX: 100,
      buttons: 1,
    });

    expect(strip.scrollLeft).toBe(0);
  });

  it('still sets the day-filter on a direct day-cell click (T019 carried forward)', async () => {
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
});

describe('TailoringCalendar day-strip keyboard navigation (Iteration 2/T041a, FR-020a)', () => {
  it('moves roving focus one day at a time with ArrowLeft/ArrowRight, scrolling into view', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    screen.getByTestId('tailoring-calendar-day-2026-07-10').focus();

    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-11'),
    ).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-12'),
    ).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-11'),
    ).toHaveFocus();
  });

  it('does not move focus past the first or last day', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-11"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
      />,
    );

    screen.getByTestId('tailoring-calendar-day-2026-07-10').focus();
    await user.keyboard('{ArrowLeft}');
    expect(
      screen.getByTestId('tailoring-calendar-day-2026-07-10'),
    ).toHaveFocus();
  });

  it('selects the focused day as the active day-filter on Enter', async () => {
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

    screen.getByTestId('tailoring-calendar-day-2026-07-11').focus();
    await user.keyboard('{Enter}');

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-07-11');
  });

  it('selects the focused day as the active day-filter on Space', async () => {
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

    screen.getByTestId('tailoring-calendar-day-2026-07-11').focus();
    await user.keyboard(' ');

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-07-11');
  });

  it('selects an unmarked focused day on Enter', async () => {
    const onSelectedDateChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TailoringCalendar
        cycleStartDate="2026-07-10"
        cycleEndDate="2026-07-12"
        eventDayMarkers={new Set()}
        selectedDate={null}
        onSelectedDateChange={onSelectedDateChange}
      />,
    );

    screen.getByTestId('tailoring-calendar-day-2026-07-10').focus();
    await user.keyboard('{Enter}');

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-07-10');
  });
});
