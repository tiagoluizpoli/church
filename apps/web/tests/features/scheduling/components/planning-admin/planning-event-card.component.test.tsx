import { m } from '@church/i18n/messages';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CycleCalendarTableRow } from '@/features/scheduling/components/planning-admin/planning-admin.types';
import { PlanningEventCard } from '@/features/scheduling/components/planning-admin/planning-event-card';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { renderWithProviders } from '@/tests/setup/render';

interface MockLinkProps {
  children: ReactNode;
  params?: Record<string, string>;
  'aria-label'?: string;
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params, 'aria-label': label }: MockLinkProps) => (
    <a
      aria-label={label}
      href={`/cycles/${params?.cycleId}/events/${params?.eventId}`}
    >
      {children}
    </a>
  ),
}));

interface RenderInput {
  churchTimezone?: string;
}

function render(
  ui: ReactElement,
  { churchTimezone = 'UTC' }: RenderInput = {},
) {
  return rtlRender(
    <TimezoneProvider churchTimezone={churchTimezone}>{ui}</TimezoneProvider>,
  );
}

function rowWithTwoEventTimeBlocks(): CycleCalendarTableRow {
  return {
    eventId: 'event-1',
    title: 'Sunday Service',
    start: '2026-08-02T09:00:00Z',
    end: '2026-08-02T11:00:00Z',
    status: 'scheduled',
    eventTimeBlocks: [
      {
        eventTimeBlockId: 'event-time-block-1',
        label: 'Worship',
        startTime: '2026-08-02T09:00:00Z',
        endTime: '2026-08-02T10:00:00Z',
        isOnlyEventTimeBlockInEvent: false,
      },
      {
        eventTimeBlockId: 'event-time-block-2',
        label: 'Message',
        startTime: '2026-08-02T10:00:00Z',
        endTime: '2026-08-02T11:00:00Z',
        isOnlyEventTimeBlockInEvent: false,
      },
    ],
  };
}

function oneEventTimeBlockRow(): CycleCalendarTableRow {
  return {
    eventId: 'event-2',
    title: 'Wednesday Service',
    start: '2026-08-05T19:00:00Z',
    end: '2026-08-05T21:00:00Z',
    status: 'scheduled',
    eventTimeBlocks: [
      {
        eventTimeBlockId: 'event-time-block-3',
        label: 'Midweek',
        startTime: '2026-08-05T19:00:00Z',
        endTime: '2026-08-05T20:00:00Z',
        isOnlyEventTimeBlockInEvent: true,
      },
    ],
  };
}

function baseProps() {
  return {
    deleteEventTimeBlockPending: false,
    cycleId: 'cycle-1',
    onDeleteEventTimeBlockConfirm: vi.fn(),
  };
}

describe('PlanningEventCard affordances (US1)', () => {
  it('links Edit to the nested Event page and keeps only the time block delete affordance when not read-only', () => {
    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...baseProps()}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Editar dia Sunday Service' }),
    ).toHaveAttribute('href', '/cycles/cycle-1/events/event-1');
    expect(
      screen.queryByRole('button', { name: /^Adicionar horário/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar horário Worship' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Excluir dia/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Excluir horário Worship' }),
    ).toBeEnabled();
  });

  it("disables a time block's delete affordance when it is the only time block in the event", () => {
    render(
      <PlanningEventCard
        row={oneEventTimeBlockRow()}
        isReadOnly={false}
        {...baseProps()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Excluir horário Midweek' }),
    ).toBeDisabled();
  });

  it('renders none of the add/edit/delete affordances when read-only', () => {
    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly
        {...baseProps()}
      />,
    );

    expect(
      screen.queryByRole('link', { name: /^Editar dia/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Excluir dia/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Delete eventTimeBlock/ }),
    ).not.toBeInTheDocument();
  });

  it('words the visible controls and the time block confirmation in pt-BR', async () => {
    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...baseProps()}
      />,
    );
    const user = userEvent.setup();

    expect(screen.getByText('Editar')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Excluir horário Worship' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Excluir este horário?')).toBeVisible();
    expect(
      within(dialog).getByText('Isso remove "Worship" do dia.'),
    ).toBeVisible();
  });

  it('calls onDeleteEventTimeBlockConfirm after confirming the delete-event-time-block dialog', async () => {
    const props = baseProps();
    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...props}
      />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Excluir horário Worship' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Excluir horário' }),
    );

    expect(props.onDeleteEventTimeBlockConfirm).toHaveBeenCalledWith({
      eventId: 'event-1',
      eventTimeBlockId: 'event-time-block-1',
    });
  });

  it('keeps the delete-event-time-block confirm dialog open with a "Deleting…" label while the mutation is pending', async () => {
    const props = baseProps();
    const { rerender } = render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...props}
      />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Excluir horário Worship' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Excluir horário' }),
    );

    rerender(
      <TimezoneProvider churchTimezone="UTC">
        <PlanningEventCard
          row={rowWithTwoEventTimeBlocks()}
          isReadOnly={false}
          {...props}
          deleteEventTimeBlockPending
        />
      </TimezoneProvider>,
    );

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluindo…' })).toBeDisabled();

    rerender(
      <TimezoneProvider churchTimezone="UTC">
        <PlanningEventCard
          row={rowWithTwoEventTimeBlocks()}
          isReadOnly={false}
          {...props}
        />
      </TimezoneProvider>,
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

/** `dd/MM/yyyy HH:mm – HH:mm`, or `dd/MM/yyyy HH:mm – dd/MM/yyyy HH:mm` when
 * the time block's range crosses a church-local day boundary. */
function isTimeRangeText(content: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\s?[–-]\s?(\d{2}\/\d{2}\/\d{4}\s)?\d{2}:\d{2}$/.test(
    content,
  );
}

describe('PlanningEventCard timezone-aware formatting (US2)', () => {
  it("renders the Event's full span and a time block's time as dated instant ranges, with no raw ISO or arrow", () => {
    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...baseProps()}
      />,
      { churchTimezone: 'UTC' },
    );

    const card = screen.getByTestId('planning-event-card');
    expect(within(card).getAllByText(isTimeRangeText).length).toBeGreaterThan(
      0,
    );
    expect(within(card).queryByText(/Z/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/→/)).not.toBeInTheDocument();
  });

  it('changes the displayed date/time with the Church Timezone', () => {
    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...baseProps()}
      />,
      { churchTimezone: 'UTC' },
    );
    const utcTimeRange = within(
      screen.getByTestId('planning-event-card'),
    ).getAllByText(isTimeRangeText)[0].textContent;

    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...baseProps()}
      />,
      { churchTimezone: 'Pacific/Kiritimati' },
    );
    const cards = screen.getAllByTestId('planning-event-card');
    const kiritimatiTimeRange = within(cards[cards.length - 1]).getAllByText(
      isTimeRangeText,
    )[0].textContent;

    expect(kiritimatiTimeRange).not.toBe(utcTimeRange);
  });
});

describe('PlanningEventCard exact-string display under a non-UTC ambient TZ (#159)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland';
  });

  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('renders the Event day and each Shift/EventTimeBlock range as exact dd/MM/yyyy / HH:mm strings, driven by the Church Timezone param rather than the ambient TZ', () => {
    render(
      <PlanningEventCard
        row={rowWithTwoEventTimeBlocks()}
        isReadOnly={false}
        {...baseProps()}
      />,
      { churchTimezone: 'UTC' },
    );

    const card = screen.getByTestId('planning-event-card');
    expect(
      within(card).getByText('02/08/2026 09:00 – 11:00'),
    ).toBeInTheDocument();
    expect(
      within(card).getByText('02/08/2026 09:00 – 10:00'),
    ).toBeInTheDocument();
    expect(
      within(card).getByText('02/08/2026 10:00 – 11:00'),
    ).toBeInTheDocument();
  });
});

describe('PlanningEventCard review content', () => {
  it('shows a multi-day Event once with its full span, its location and an overnight block with its spillover date', () => {
    render(
      <PlanningEventCard
        row={{
          eventId: 'event-retreat',
          title: 'Youth retreat',
          location: 'Mountain camp',
          start: '2026-08-07T20:00:00Z',
          end: '2026-08-09T15:00:00Z',
          status: 'scheduled',
          eventTimeBlocks: [
            {
              eventTimeBlockId: 'block-vigil',
              label: 'Night vigil',
              startTime: '2026-08-07T22:00:00Z',
              endTime: '2026-08-08T02:00:00Z',
              isOnlyEventTimeBlockInEvent: false,
            },
            {
              eventTimeBlockId: 'block-closing',
              label: 'Closing',
              startTime: '2026-08-09T13:00:00Z',
              endTime: '2026-08-09T15:00:00Z',
              isOnlyEventTimeBlockInEvent: false,
            },
          ],
        }}
        isReadOnly
        {...baseProps()}
      />,
      { churchTimezone: 'UTC' },
    );

    const card = screen.getByTestId('planning-event-card');
    expect(within(card).getByText('Youth retreat')).toBeInTheDocument();
    expect(
      within(card).getByText(
        m.cycle_review_location({ location: 'Mountain camp' }),
      ),
    ).toBeInTheDocument();
    expect(
      within(card).getByText('07/08/2026 20:00 – 09/08/2026 15:00'),
    ).toBeInTheDocument();
    expect(
      within(card).getByText('07/08/2026 22:00 – 08/08/2026 02:00'),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(
        m.cycle_review_time_block_count_other({ count: 2 }),
      ),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(m.event_status_scheduled()),
    ).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PlanningEventCard move preview', () => {
  it.each([
    [true, 1],
    [false, 0],
  ])('with canPreviewMove=%s renders %s move preview button', (canPreviewMove, count) => {
    renderWithProviders(
      <TimezoneProvider churchTimezone="UTC">
        <PlanningEventCard
          row={rowWithTwoEventTimeBlocks()}
          isReadOnly
          canPreviewMove={canPreviewMove}
          {...baseProps()}
        />
      </TimezoneProvider>,
    );

    expect(
      screen.queryAllByRole('button', {
        name: m.event_move_preview_action_label({ title: 'Sunday Service' }),
      }),
    ).toHaveLength(count);
  });
});

describe('PlanningEventCard cancellation', () => {
  it('offers Cancel event beside the move preview for a cancellable Event', () => {
    renderWithProviders(
      <TimezoneProvider churchTimezone="UTC">
        <PlanningEventCard
          row={rowWithTwoEventTimeBlocks()}
          isReadOnly
          canPreviewMove
          canCancel
          {...baseProps()}
        />
      </TimezoneProvider>,
    );

    expect(
      screen.getByRole('button', {
        name: m.event_cancel_action_label({ title: 'Sunday Service' }),
      }),
    ).toBeInTheDocument();
  });

  it('keeps a cancelled Event visible, greyed and struck through with its badge and no actions', () => {
    render(
      <PlanningEventCard
        row={{ ...rowWithTwoEventTimeBlocks(), status: 'cancelled' }}
        isReadOnly
        {...baseProps()}
      />,
    );

    const card = screen.getByTestId('planning-event-card');
    expect(card).toHaveClass('opacity-60');
    expect(within(card).getByText('Sunday Service')).toHaveClass(
      'line-through',
    );
    expect(
      within(card).getByText(m.event_status_cancelled()),
    ).toBeInTheDocument();
    expect(
      within(card).queryAllByRole('button', { name: /Cancelar|Mover/ }),
    ).toHaveLength(0);
  });
});
