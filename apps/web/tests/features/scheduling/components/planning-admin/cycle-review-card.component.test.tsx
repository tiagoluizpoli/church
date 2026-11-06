import { m } from '@church/i18n/messages';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type ReactNode, useLayoutEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { CycleReviewCard } from '@/features/scheduling/components/planning-admin/cycle-review-card';
import {
  PlanningAdminProvider,
  useCycleSelection,
} from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { renderWithProviders } from '@/tests/setup/render';

const listCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getCycle = vi.fn();
const deletePlanningEventTimeBlock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getCycle: (...args: unknown[]) => getCycle(...args),
    deletePlanningEventTimeBlock: (...args: unknown[]) =>
      deletePlanningEventTimeBlock(...args),
  },
}));

interface MockLinkProps {
  children: ReactNode;
  params?: Record<string, string>;
  className?: string;
  'aria-label'?: string;
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    className,
    'aria-label': label,
  }: MockLinkProps) => (
    <a
      aria-label={label}
      className={className}
      href={`/cycles/${params?.cycleId}/events/${params?.eventId}`}
    >
      {children}
    </a>
  ),
}));

interface RenderCycleReviewCardInput {
  isReadOnly?: boolean;
  churchTimezone?: string;
  revealEventId?: string;
}

function render({
  isReadOnly = false,
  churchTimezone,
  revealEventId,
}: RenderCycleReviewCardInput = {}) {
  return renderWithProviders(
    <PlanningAdminProvider>
      <CycleListCard />
      <CycleReviewCard isReadOnly={isReadOnly} revealEventId={revealEventId} />
    </PlanningAdminProvider>,
    { churchTimezone },
  );
}

async function selectTheOnlyCycle() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('cycle-option'));
  return user;
}

/** `dd/MM/yyyy HH:mm – HH:mm`, or `dd/MM/yyyy HH:mm – dd/MM/yyyy HH:mm` when
 * the time block's range crosses a church-local day boundary. */
function isTimeRangeText(content: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\s?[–-]\s?(\d{2}\/\d{2}\/\d{4}\s)?\d{2}:\d{2}$/.test(
    content,
  );
}

interface TwoEventCycleResponseInput {
  state: 'draft' | 'sent';
}

function twoEventCycleResponse({ state }: TwoEventCycleResponseInput) {
  return {
    cycle: {
      id: 'cycle-1',
      name: 'August 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      state,
    },
    events: [
      {
        event: {
          id: 'event-1',
          title: 'Sunday Service',
          start: '2026-08-02T09:00:00Z',
          end: '2026-08-02T11:00:00Z',
          status: 'scheduled',
        },
        eventTimeBlocks: [
          {
            id: 'event-time-block-1',
            label: 'Worship',
            startTime: '2026-08-02T09:00:00Z',
            endTime: '2026-08-02T10:00:00Z',
          },
          {
            id: 'event-time-block-2',
            label: 'Message',
            startTime: '2026-08-02T10:00:00Z',
            endTime: '2026-08-02T11:00:00Z',
          },
        ],
      },
      {
        event: {
          id: 'event-2',
          title: 'Wednesday Service',
          start: '2026-08-05T19:00:00Z',
          end: '2026-08-05T20:00:00Z',
          status: 'scheduled',
        },
        eventTimeBlocks: [
          {
            id: 'event-time-block-3',
            label: null,
            startTime: '2026-08-05T19:00:00Z',
            endTime: '2026-08-05T20:00:00Z',
          },
        ],
      },
    ],
  };
}

describe('CycleReviewCard header consolidation (US1)', () => {
  it('does not duplicate the cycle summary or the outer card title in the review body', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();

    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });
    const reviewBody = table.closest(
      '[data-slot="card-content"]',
    ) as HTMLElement;

    expect(
      screen.queryByTestId('selected-cycle-summary'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Selected cycle review')).not.toBeInTheDocument();
    expect(
      within(reviewBody).queryByText('August 2026'),
    ).not.toBeInTheDocument();
    expect(
      within(reviewBody).queryByText('2026-08-01'),
    ).not.toBeInTheDocument();
    expect(
      within(reviewBody).getByText(m.cycle_review_title()),
    ).toBeInTheDocument();
  });
});

describe('CycleReviewCard timezone-aware date/time split (US2)', () => {
  it('renders a day row with its full span and an expanded time block row as a dated instant range, with no raw ISO or arrow', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();

    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    expect(within(table).getAllByText(isTimeRangeText).length).toBe(2);
    expect(within(table).queryByText(/Z/)).not.toBeInTheDocument();
    expect(within(table).queryByText(/→/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );

    const eventTimeBlockTimeCells = within(table).getAllByText(isTimeRangeText);
    expect(eventTimeBlockTimeCells.length).toBeGreaterThan(0);
    for (const cell of eventTimeBlockTimeCells) {
      expect(cell.textContent).not.toMatch(/Z/);
    }
  });

  it('changes every displayed date/time with the Church Timezone', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();
    let table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });
    let user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );
    const utcTimeRange =
      within(table).getAllByText(isTimeRangeText)[0].textContent;

    cleanup();

    render({ churchTimezone: 'Pacific/Kiritimati' });
    await selectTheOnlyCycle();
    table = await screen.findByRole('grid', { name: m.cycle_review_title() });
    user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );
    const kiritimatiTimeRange =
      within(table).getAllByText(isTimeRangeText)[0].textContent;

    expect(kiritimatiTimeRange).not.toBe(utcTimeRange);
  });
});

describe('CycleReviewCard table view (US2)', () => {
  it('renders each weekday entry as a collapsed row and expands to reveal its time blocks', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();

    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );

    expect(within(table).getByText('Worship')).toBeInTheDocument();
    expect(within(table).getByText('Message')).toBeInTheDocument();
    expect(within(table).queryByText('Midweek')).not.toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Expandir Wednesday Service' }),
    );
    expect(
      within(table).getByText(m.cycle_review_time_block_fallback()),
    ).toBeInTheDocument();
    expect(within(table).getByText('Worship')).toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Recolher Sunday Service' }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(
      within(table).getByText(m.cycle_review_time_block_fallback()),
    ).toBeInTheDocument();
  });

  it('localizes the Draft send controls', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render({});
    await selectTheOnlyCycle();

    expect(await screen.findByTestId('send-cycle-button')).toHaveTextContent(
      'Enviar aos ministérios',
    );
    expect(
      screen.getByText(/Confirme as datas, os horários e os tipos de evento/),
    ).toBeVisible();
  });

  it('keeps the sent cycle table read-only with no new editing affordance', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'sent',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'sent' }));

    render({ isReadOnly: true });
    await selectTheOnlyCycle();

    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });
    expect(table).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.cycles_add_event_button() }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('send-cycle-button')).not.toBeInTheDocument();
  });

  it('shows the empty-state message instead of an empty table when the cycle has no events', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'August 2026',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'draft',
      },
      events: [],
    });

    render();
    await selectTheOnlyCycle();

    expect(await screen.findByText(m.cycle_review_empty())).toBeInTheDocument();
    expect(
      screen.queryByRole('grid', { name: m.cycle_review_title() }),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard day/time block edit and delete (US3)', () => {
  it("draft cycle links Edit to the nested Event page and keeps only time block delete controls, disabling delete for a day's only time block", async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    expect(
      within(table).queryByRole('button', { name: /^Excluir dia/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).getByRole('link', { name: 'Editar dia Sunday Service' }),
    ).toHaveAttribute('href', '/cycles/cycle-1/events/event-1');

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );
    expect(
      within(table).getByRole('button', { name: 'Excluir horário Worship' }),
    ).toBeEnabled();
    expect(
      within(table).queryByRole('button', { name: 'Editar horário Worship' }),
    ).not.toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Expandir Wednesday Service' }),
    );
    expect(
      within(table).getByRole('button', {
        name: `Excluir horário ${m.cycle_review_time_block_fallback()}`,
      }),
    ).toBeDisabled();
  });

  it('deleting a non-last time block, after confirming, calls the delete-event-time-block handler', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Excluir horário Worship' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Excluir horário' }),
    );

    await waitFor(() =>
      expect(deletePlanningEventTimeBlock).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        'event-time-block-1',
      ),
    );
  });

  it('keeps the desktop delete-event-time-block confirm dialog open with a "Deleting…" label until the mutation settles', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));
    let resolveDelete: () => void = () => undefined;
    deletePlanningEventTimeBlock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Excluir horário Worship' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Excluir horário' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByRole('button', { name: 'Excluindo…' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancelar' }),
    ).toBeDisabled();

    resolveDelete();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
  });

  it('renders the Delete time block action with destructive styling, distinct from Edit', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    expect(
      within(table).getByRole('link', { name: 'Editar dia Sunday Service' }),
    ).not.toHaveClass('text-destructive');

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );
    expect(
      within(table).getByRole('button', { name: 'Excluir horário Worship' }),
    ).toHaveClass('text-destructive');
  });

  it('sent cycle shows no edit/delete controls anywhere in the table', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'sent',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'sent' }));

    render({ isReadOnly: true });
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expandir Sunday Service' }),
    );

    expect(
      within(table).queryByRole('button', { name: /^Excluir dia/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('link', { name: /^Editar dia/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /^Delete eventTimeBlock/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /^Edit eventTimeBlock/ }),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard reveal of a saved Event', () => {
  it('expands and marks the Event named by the route, leaving others collapsed', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render({ revealEventId: 'event-1' });
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    expect(await within(table).findByText('Worship')).toBeInTheDocument();
    const revealed = within(table).getByTestId('revealed-event-row');
    expect(revealed).toHaveTextContent('Sunday Service');
    expect(within(table).queryAllByTestId('revealed-event-row')).toHaveLength(
      1,
    );
  });

  it('offers no add-Event trigger inside the review list', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();
    const mobileList = await screen.findByTestId('planning-events-list');

    expect(
      within(mobileList).queryByRole('button', {
        name: m.cycles_add_event_button(),
      }),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard desktop bulk expand/collapse (US5)', () => {
  it('"Expand all" reveals every day row\'s time blocks; "Collapse all" hides them all', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(
      within(table).queryByText(m.cycle_review_time_block_fallback()),
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.cycle_review_expand_all() }),
    );
    expect(within(table).getByText('Worship')).toBeInTheDocument();
    expect(within(table).getByText('Message')).toBeInTheDocument();
    expect(
      within(table).getByText(m.cycle_review_time_block_fallback()),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: m.cycle_review_collapse_all() }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(
      within(table).queryByText(m.cycle_review_time_block_fallback()),
    ).not.toBeInTheDocument();
  });

  it('does not leak expanded time block rows into the mobile card list', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();
    const mobileList = await screen.findByTestId('planning-events-list');
    expect(
      within(mobileList).getAllByTestId('planning-event-card'),
    ).toHaveLength(2);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.cycle_review_expand_all() }),
    );

    // Expanding on desktop must not add time block rows to the mobile list, which
    // has no card representation for them (`renderMobileCard` renders
    // nothing for a time block row) and would otherwise leak empty placeholder
    // elements into the mobile listbox.
    expect(
      within(mobileList).getAllByTestId('planning-event-card'),
    ).toHaveLength(2);
    expect(mobileList.children).toHaveLength(3); // week heading + 2 cards
  });

  it('is one-shot, not a synced toggle: re-collapsing one row after "Expand all" still lets "Collapse all" collapse everything', async () => {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', {
      name: m.cycle_review_title(),
    });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.cycle_review_expand_all() }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Recolher Sunday Service' }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(
      within(table).getByText(m.cycle_review_time_block_fallback()),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: m.cycle_review_collapse_all() }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(
      within(table).queryByText(m.cycle_review_time_block_fallback()),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard weekly review', () => {
  function reviewEvent({
    id,
    title,
    start,
    end,
    location,
  }: {
    id: string;
    title: string;
    start: string;
    end: string;
    location?: string;
  }) {
    return {
      event: { id, title, start, end, location, status: 'scheduled' },
      eventTimeBlocks: [
        {
          id: `${id}-block`,
          label: `${title} block`,
          startTime: start,
          endTime: end,
        },
      ],
    };
  }

  async function renderWeeks(events: ReturnType<typeof reviewEvent>[]) {
    listCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'October 2026',
          startDate: '2026-10-11',
          endDate: '2026-10-24',
          state: 'draft',
        },
      ],
    });
    getCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        name: 'October 2026',
        startDate: '2026-10-11',
        endDate: '2026-10-24',
        state: 'draft',
      },
      events,
    });
    // Church is UTC-3: 23:00 Saturday 17th there is already Sunday 18th in UTC.
    render({ churchTimezone: 'America/Sao_Paulo' });
    await selectTheOnlyCycle();
    return screen.findByRole('grid', { name: m.cycle_review_title() });
  }

  it('orders Events by start inside Church-local weeks, using the Church day rather than the UTC day', async () => {
    const table = await renderWeeks([
      reviewEvent({
        id: 'e3',
        title: 'Next Sunday',
        start: '2026-10-18T13:00:00Z',
        end: '2026-10-18T15:00:00Z',
      }),
      reviewEvent({
        id: 'e2',
        title: 'Saturday night',
        start: '2026-10-18T02:00:00Z',
        end: '2026-10-18T04:00:00Z',
      }),
      reviewEvent({
        id: 'e1',
        title: 'First Sunday',
        start: '2026-10-11T13:00:00Z',
        end: '2026-10-11T15:00:00Z',
      }),
    ]);

    const labels = within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent);

    expect(labels).toEqual([
      m.cycle_review_week({ start: '11/10/2026', end: '17/10/2026' }),
      expect.stringContaining('First Sunday'),
      expect.stringContaining('Saturday night'),
      m.cycle_review_week({ start: '18/10/2026', end: '24/10/2026' }),
      expect.stringContaining('Next Sunday'),
    ]);
  });

  it('shows a multi-day Event once with its location, full span and counts consistent with the header', async () => {
    const table = await renderWeeks([
      reviewEvent({
        id: 'retreat',
        title: 'Retreat',
        location: 'Mountain camp',
        start: '2026-10-16T22:00:00Z',
        end: '2026-10-19T14:00:00Z',
      }),
    ]);

    expect(within(table).getAllByText(/Retreat/)).toHaveLength(1);
    expect(
      within(table).getByText(
        m.cycle_review_location({ location: 'Mountain camp' }),
      ),
    ).toBeInTheDocument();
    expect(
      within(table).getByText('16/10/2026 19:00 – 19/10/2026 11:00'),
    ).toBeInTheDocument();
  });
});

describe('CycleReviewCard resolution states', () => {
  it('shows a loading state, never another Cycle, while the route Cycle resolves', async () => {
    getCycle.mockReturnValue(new Promise(() => undefined));
    listCycles.mockResolvedValue({ cycles: [] });
    renderWithProviders(
      <PlanningAdminProvider>
        <SelectCycle cycleId="cycle-2" />
        <CycleReviewCard cycleId="cycle-2" isReadOnly={false} />
      </PlanningAdminProvider>,
    );

    expect(await screen.findByTestId('cycle-review-loading')).toHaveTextContent(
      m.cycle_review_loading(),
    );
    expect(screen.queryByTestId('send-cycle-button')).not.toBeInTheDocument();
  });

  it('keeps a retryable failure distinct from an empty Cycle', async () => {
    getCycle.mockRejectedValueOnce(new Error('network'));
    getCycle.mockResolvedValue(twoEventCycleResponse({ state: 'draft' }));
    listCycles.mockResolvedValue({ cycles: [] });
    renderWithProviders(
      <PlanningAdminProvider>
        <SelectCycle cycleId="cycle-1" />
        <CycleReviewCard cycleId="cycle-1" isReadOnly={false} />
      </PlanningAdminProvider>,
    );

    const alert = await screen.findByTestId('cycle-review-error');
    expect(alert).toHaveTextContent(m.cycle_review_error());
    expect(screen.queryByTestId('cycle-review-empty')).not.toBeInTheDocument();

    await userEvent.click(
      within(alert).getByRole('button', { name: m.event_templates_retry() }),
    );

    expect(
      await screen.findByRole('grid', { name: m.cycle_review_title() }),
    ).toBeInTheDocument();
  });

  it('shows the scoped not-found message for a missing Cycle', async () => {
    getCycle.mockRejectedValue(
      Object.assign(new AxiosError('missing'), { response: { status: 404 } }),
    );
    listCycles.mockResolvedValue({ cycles: [] });
    renderWithProviders(
      <PlanningAdminProvider>
        <SelectCycle cycleId="missing" />
        <CycleReviewCard cycleId="missing" isReadOnly={false} />
      </PlanningAdminProvider>,
    );

    expect(
      await screen.findByTestId('cycle-review-not-found'),
    ).toHaveTextContent(m.cycle_review_not_found());
  });
});

interface SelectCycleProps {
  cycleId: string;
}

/** Stands in for the route, which selects its `$cycleId` on mount. */
function SelectCycle({ cycleId }: SelectCycleProps) {
  const { handleSelectCycle } = useCycleSelection();
  useLayoutEffect(() => {
    handleSelectCycle({ cycleId });
  }, [cycleId, handleSelectCycle]);
  return null;
}
