import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CycleCalendarTableRow } from './planning-admin.types';
import { PlanningEventCard } from './planning-event-card';
import { TimezoneProvider } from '@/shared/components/timezone-provider';

interface RenderInput {
  churchTimezone?: string;
}

function render(
  ui: ReactElement,
  { churchTimezone = 'UTC' }: RenderInput = {},
) {
  return rtlRender(
    <TimezoneProvider initialChurchTimezone={churchTimezone}>
      {ui}
    </TimezoneProvider>,
  );
}

function twoSlotRow(): CycleCalendarTableRow {
  return {
    eventId: 'event-1',
    title: 'Sunday Service',
    startDate: '2026-08-02T09:00:00Z',
    eventType: 'service',
    status: 'scheduled',
    slots: [
      {
        slotId: 'slot-1',
        label: 'Worship',
        startTime: '2026-08-02T09:00:00Z',
        endTime: '2026-08-02T10:00:00Z',
        isOnlySlotInEvent: false,
      },
      {
        slotId: 'slot-2',
        label: 'Message',
        startTime: '2026-08-02T10:00:00Z',
        endTime: '2026-08-02T11:00:00Z',
        isOnlySlotInEvent: false,
      },
    ],
  };
}

function oneSlotRow(): CycleCalendarTableRow {
  return {
    eventId: 'event-2',
    title: 'Wednesday Service',
    startDate: '2026-08-05T19:00:00Z',
    eventType: 'service',
    status: 'scheduled',
    slots: [
      {
        slotId: 'slot-3',
        label: 'Midweek',
        startTime: '2026-08-05T19:00:00Z',
        endTime: '2026-08-05T20:00:00Z',
        isOnlySlotInEvent: true,
      },
    ],
  };
}

beforeEach(() => {
  localStorage.clear();
});

function baseProps() {
  return {
    deleteEventPending: false,
    deleteSlotPending: false,
    onAddSlotRequest: vi.fn(),
    onEditEventRequest: vi.fn(),
    onDeleteEventConfirm: vi.fn(),
    onEditSlotRequest: vi.fn(),
    onDeleteSlotConfirm: vi.fn(),
  };
}

describe('PlanningEventCard affordances (US1)', () => {
  it('renders add/edit/delete affordances for a day-event and its slots when not read-only', () => {
    render(
      <PlanningEventCard
        row={twoSlotRow()}
        isReadOnly={false}
        {...baseProps()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Add slot to Sunday Service' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit day Sunday Service' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete day Sunday Service' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit slot Worship' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete slot Worship' }),
    ).toBeEnabled();
  });

  it("disables a slot's delete affordance when it is the only slot in the event", () => {
    render(
      <PlanningEventCard
        row={oneSlotRow()}
        isReadOnly={false}
        {...baseProps()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Delete slot Midweek' }),
    ).toBeDisabled();
  });

  it('renders none of the add/edit/delete affordances when read-only', () => {
    render(
      <PlanningEventCard row={twoSlotRow()} isReadOnly {...baseProps()} />,
    );

    expect(
      screen.queryByRole('button', { name: /^Add slot/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit day/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Delete day/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit slot/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Delete slot/ }),
    ).not.toBeInTheDocument();
  });

  it('calls onDeleteEventConfirm after confirming the delete-day dialog', async () => {
    const props = baseProps();
    render(
      <PlanningEventCard row={twoSlotRow()} isReadOnly={false} {...props} />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Delete day Sunday Service' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete event' }),
    );

    expect(props.onDeleteEventConfirm).toHaveBeenCalledWith({
      eventId: 'event-1',
    });
  });

  it('calls onDeleteSlotConfirm after confirming the delete-slot dialog', async () => {
    const props = baseProps();
    render(
      <PlanningEventCard row={twoSlotRow()} isReadOnly={false} {...props} />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Delete slot Worship' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete slot' }),
    );

    expect(props.onDeleteSlotConfirm).toHaveBeenCalledWith({
      eventId: 'event-1',
      slotId: 'slot-1',
    });
  });

  it('gives the day-delete trigger the same destructive visual weight as its slot-level sibling', () => {
    render(
      <PlanningEventCard
        row={twoSlotRow()}
        isReadOnly={false}
        {...baseProps()}
      />,
    );

    const dayDelete = screen.getByRole('button', {
      name: 'Delete day Sunday Service',
    });
    const slotDelete = screen.getByRole('button', {
      name: 'Delete slot Worship',
    });

    expect(dayDelete.className).toContain('bg-destructive/10');
    expect(slotDelete.className).toContain('bg-destructive');
  });

  it('keeps the delete-day confirm dialog open with a "Deleting…" label while the mutation is pending', async () => {
    const props = baseProps();
    const { rerender } = render(
      <PlanningEventCard row={twoSlotRow()} isReadOnly={false} {...props} />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Delete day Sunday Service' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete event' }),
    );

    // Simulate the mutation going pending: dialog must stay open, not close
    // synchronously in the click handler.
    rerender(
      <TimezoneProvider initialChurchTimezone="UTC">
        <PlanningEventCard
          row={twoSlotRow()}
          isReadOnly={false}
          {...props}
          deleteEventPending
        />
      </TimezoneProvider>,
    );

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    // Mutation settles: dialog auto-closes.
    rerender(
      <TimezoneProvider initialChurchTimezone="UTC">
        <PlanningEventCard row={twoSlotRow()} isReadOnly={false} {...props} />
      </TimezoneProvider>,
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the delete-slot confirm dialog open with a "Deleting…" label while the mutation is pending', async () => {
    const props = baseProps();
    const { rerender } = render(
      <PlanningEventCard row={twoSlotRow()} isReadOnly={false} {...props} />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Delete slot Worship' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete slot' }),
    );

    rerender(
      <TimezoneProvider initialChurchTimezone="UTC">
        <PlanningEventCard
          row={twoSlotRow()}
          isReadOnly={false}
          {...props}
          deleteSlotPending
        />
      </TimezoneProvider>,
    );

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();

    rerender(
      <TimezoneProvider initialChurchTimezone="UTC">
        <PlanningEventCard row={twoSlotRow()} isReadOnly={false} {...props} />
      </TimezoneProvider>,
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

function isDateOnlyText(content: string): boolean {
  return /^\w{3} \d{1,2}, \d{4}$/.test(content);
}

function isTimeRangeText(content: string): boolean {
  return /^\d{1,2}:\d{2}\s?(AM|PM)\s?[–-]\s?\d{1,2}:\d{2}\s?(AM|PM)$/.test(
    content,
  );
}

describe('PlanningEventCard timezone-aware formatting (US2)', () => {
  it("renders a day's date date-only and a slot's time time-only, with no raw ISO or arrow", () => {
    render(
      <PlanningEventCard
        row={twoSlotRow()}
        isReadOnly={false}
        {...baseProps()}
      />,
      { churchTimezone: 'UTC' },
    );

    const card = screen.getByTestId('planning-event-card');
    expect(within(card).getAllByText(isDateOnlyText).length).toBeGreaterThan(0);
    expect(within(card).getAllByText(isTimeRangeText).length).toBeGreaterThan(
      0,
    );
    expect(within(card).queryByText(/Z/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/→/)).not.toBeInTheDocument();
  });

  it('changes the displayed date/time when the timezone mode toggles between church and local', () => {
    render(
      <PlanningEventCard
        row={twoSlotRow()}
        isReadOnly={false}
        {...baseProps()}
      />,
      { churchTimezone: 'UTC' },
    );
    const churchModeSlotTime = within(
      screen.getByTestId('planning-event-card'),
    ).getAllByText(isTimeRangeText)[0].textContent;

    localStorage.setItem('church_timezone_mode', 'user');
    render(
      <PlanningEventCard
        row={twoSlotRow()}
        isReadOnly={false}
        {...baseProps()}
      />,
      { churchTimezone: 'UTC' },
    );
    const cards = screen.getAllByTestId('planning-event-card');
    const localModeSlotTime = within(cards[cards.length - 1]).getAllByText(
      isTimeRangeText,
    )[0].textContent;

    expect(localModeSlotTime).not.toBe(churchModeSlotTime);
  });
});
