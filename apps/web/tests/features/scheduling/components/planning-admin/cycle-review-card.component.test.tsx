import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { CycleReviewCard } from '@/features/scheduling/components/planning-admin/cycle-review-card';
import { PlanningAdminProvider } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { pickCalendarDate } from '@/tests/setup/date-picker';
import { renderWithProviders } from '@/tests/setup/render';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const listCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getCycle = vi.fn();
const createPlanningEvent = vi.fn().mockResolvedValue({ id: 'event-new' });
const updatePlanningEvent = vi.fn().mockResolvedValue({});
const cancelPlanningEvent = vi.fn().mockResolvedValue(undefined);
const createPlanningEventTimeBlock = vi.fn().mockResolvedValue({});
const updatePlanningEventTimeBlock = vi.fn().mockResolvedValue({});
const deletePlanningEventTimeBlock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getCycle: (...args: unknown[]) => getCycle(...args),
    createPlanningEvent: (...args: unknown[]) => createPlanningEvent(...args),
    updatePlanningEvent: (...args: unknown[]) => updatePlanningEvent(...args),
    cancelPlanningEvent: (...args: unknown[]) => cancelPlanningEvent(...args),
    createPlanningEventTimeBlock: (...args: unknown[]) =>
      createPlanningEventTimeBlock(...args),
    updatePlanningEventTimeBlock: (...args: unknown[]) =>
      updatePlanningEventTimeBlock(...args),
    deletePlanningEventTimeBlock: (...args: unknown[]) =>
      deletePlanningEventTimeBlock(...args),
  },
}));

interface RenderCycleReviewCardInput {
  isReadOnly?: boolean;
  churchTimezone?: string;
}

function render({
  isReadOnly = false,
  churchTimezone,
}: RenderCycleReviewCardInput = {}) {
  return renderWithProviders(
    <PlanningAdminProvider>
      <CycleListCard />
      <CycleReviewCard isReadOnly={isReadOnly} />
    </PlanningAdminProvider>,
    { churchTimezone },
  );
}

async function selectTheOnlyCycle() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('cycle-option'));
  return user;
}

function isDateOnlyText(content: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(content);
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

    const table = await screen.findByRole('grid', { name: 'Calendar review' });
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
    expect(within(reviewBody).getByText('Calendar review')).toBeInTheDocument();
  });
});

describe('CycleReviewCard timezone-aware date/time split (US2)', () => {
  it('renders a day row date-only and an expanded time block row as a dated instant range, with no raw ISO or arrow', async () => {
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

    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    expect(within(table).getAllByText(isDateOnlyText).length).toBe(2);
    expect(within(table).queryByText(/Z/)).not.toBeInTheDocument();
    expect(within(table).queryByText(/→/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
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
    let table = await screen.findByRole('grid', { name: 'Calendar review' });
    let user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    const utcTimeRange =
      within(table).getAllByText(isTimeRangeText)[0].textContent;

    cleanup();

    render({ churchTimezone: 'Pacific/Kiritimati' });
    await selectTheOnlyCycle();
    table = await screen.findByRole('grid', { name: 'Calendar review' });
    user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
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

    const table = await screen.findByRole('grid', { name: 'Calendar review' });
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );

    expect(within(table).getByText('Worship')).toBeInTheDocument();
    expect(within(table).getByText('Message')).toBeInTheDocument();
    expect(within(table).queryByText('Midweek')).not.toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Expand Wednesday Service' }),
    );
    expect(within(table).getByText('Time block')).toBeInTheDocument();
    expect(within(table).getByText('Worship')).toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Collapse Sunday Service' }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).getByText('Time block')).toBeInTheDocument();
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

    const table = await screen.findByRole('grid', { name: 'Calendar review' });
    expect(table).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add event' }),
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

    expect(
      await screen.findByText(
        'No events in this cycle yet. Apply templates or add a manual event.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('grid', { name: 'Calendar review' }),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard day/time block edit and delete (US3)', () => {
  it("draft cycle shows day and time block edit/delete controls, disabling delete for a day's only time block", async () => {
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    expect(
      within(table).getByRole('button', { name: 'Delete day Sunday Service' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('button', { name: 'Edit day Sunday Service' }),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    expect(
      within(table).getByRole('button', { name: 'Delete time block Worship' }),
    ).toBeEnabled();
    expect(
      within(table).getByRole('button', { name: 'Edit time block Worship' }),
    ).toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Expand Wednesday Service' }),
    );
    expect(
      within(table).getByRole('button', {
        name: 'Delete time block Time block',
      }),
    ).toBeDisabled();
  });

  it('deleting a day, after confirming, calls the cancel-event handler', async () => {
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Delete day Sunday Service' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Delete event' }),
    );

    await waitFor(() =>
      expect(cancelPlanningEvent).toHaveBeenCalledWith('cycle-1', 'event-1'),
    );
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Delete time block Worship' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Delete time block' }),
    );

    await waitFor(() =>
      expect(deletePlanningEventTimeBlock).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        'event-time-block-1',
      ),
    );
  });

  it('keeps the desktop delete-day confirm dialog open with a "Deleting…" label until the mutation settles', async () => {
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
    cancelPlanningEvent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Delete day Sunday Service' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Delete event' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();

    resolveDelete();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Delete time block Worship' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Delete time block' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();

    resolveDelete();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
  });

  it('renders Delete day/time block actions and the confirm-delete action with destructive styling, distinct from Edit', async () => {
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    expect(
      within(table).getByRole('button', { name: 'Delete day Sunday Service' }),
    ).toHaveClass('text-destructive');
    expect(
      within(table).getByRole('button', { name: 'Edit day Sunday Service' }),
    ).not.toHaveClass('text-destructive');

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    expect(
      within(table).getByRole('button', { name: 'Delete time block Worship' }),
    ).toHaveClass('text-destructive');

    await user.click(
      within(table).getByRole('button', { name: 'Delete day Sunday Service' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Delete event' }),
    ).toHaveClass('text-destructive');
  });

  it('adding a time block to a day, after filling the dialog, calls the create-event-time-block handler', async () => {
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', {
        name: 'Add time block to Sunday Service',
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Add time block',
    });
    await user.type(within(dialog).getByLabelText('Label'), 'Prayer');
    await user.click(
      within(dialog).getByRole('button', { name: 'Add time block' }),
    );

    await waitFor(() =>
      expect(createPlanningEventTimeBlock).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        expect.objectContaining({ label: 'Prayer' }),
      ),
    );
  });

  it('editing a day, after changing title/description/location, calls the update-event handler', async () => {
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Edit day Sunday Service' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit day' });
    const titleInput = within(dialog).getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Sunday Gathering');
    await user.type(
      within(dialog).getByLabelText('Description'),
      'Combined worship service',
    );
    await user.type(
      within(dialog).getByLabelText('Location'),
      'Main Auditorium',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePlanningEvent).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        expect.objectContaining({
          title: 'Sunday Gathering',
          description: 'Combined worship service',
          location: 'Main Auditorium',
          start: expect.any(String),
          end: expect.any(String),
        }),
      ),
    );
  });

  it('editing a time block, after changing start/end time, calls the update-event-time-block handler', async () => {
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Edit time block Worship' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit time block',
    });
    await fillTimeOfDayField({
      user,
      field: within(dialog).getByTestId(
        'edit-event-time-block-start-time-field',
      ),
      time: '08:30',
    });
    await fillTimeOfDayField({
      user,
      field: within(dialog).getByTestId('edit-event-time-block-end-time-field'),
      time: '09:30',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePlanningEventTimeBlock).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        'event-time-block-1',
        expect.objectContaining({
          label: 'Worship',
          startTime: expect.any(String),
          endTime: expect.any(String),
        }),
      ),
    );
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );

    expect(
      within(table).queryByRole('button', { name: /^Delete day/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /^Edit day/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /^Delete eventTimeBlock/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /^Edit eventTimeBlock/ }),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard time block dialog date/time fields (post-spec fix)', () => {
  function singleAndMultiDayEventCycleResponse({
    state,
  }: TwoEventCycleResponseInput) {
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
          ],
        },
        {
          event: {
            id: 'event-2',
            title: 'Retreat Weekend',
            start: '2026-08-08T00:00:00Z',
            end: '2026-08-09T23:59:59Z',
            status: 'scheduled',
          },
          eventTimeBlocks: [
            {
              id: 'event-time-block-2',
              label: 'Check-in',
              startTime: '2026-08-08T09:00:00Z',
              endTime: '2026-08-08T10:00:00Z',
            },
          ],
        },
      ],
    };
  }

  function mockSingleAndMultiDayCycle() {
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
    getCycle.mockResolvedValue(
      singleAndMultiDayEventCycleResponse({ state: 'draft' }),
    );
  }

  it('shows time-only fields (no date field) in the Add time block dialog for a single-day event', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', {
        name: 'Add time block to Sunday Service',
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Add time block',
    });
    expect(
      within(dialog).getByTestId('create-event-time-block-start-time-field'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('create-event-time-block-end-time-field'),
    ).toBeInTheDocument();
  });

  it('shows date+time inputs in the Add time block dialog for a multi-day event', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', {
        name: 'Add time block to Retreat Weekend',
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Add time block',
    });
    expect(
      within(dialog).getByTestId('create-event-time-block-start-date'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('create-event-time-block-start-time'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('create-event-time-block-end-date'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('create-event-time-block-end-time'),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByTestId('create-event-time-block-start-time-field'),
    ).not.toBeInTheDocument();
  });

  it('shows time-only fields in the Edit time block dialog for a single-day event time block', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Edit time block Worship' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit time block',
    });
    expect(
      within(dialog).getByTestId('edit-event-time-block-start-time-field'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('edit-event-time-block-end-time-field'),
    ).toBeInTheDocument();
  });

  it('shows date+time inputs in the Edit time block dialog for a multi-day event time block', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Retreat Weekend' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Edit time block Check-in' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit time block',
    });
    expect(
      within(dialog).getByTestId('edit-event-time-block-start-date'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('edit-event-time-block-start-time'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('edit-event-time-block-end-date'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('edit-event-time-block-end-time'),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByTestId('edit-event-time-block-start-time-field'),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard mobile add day-event trigger (US1)', () => {
  it('opens QuickCreateEventModal, through its ResponsiveFormSurface shell, from the mobile list', async () => {
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

    const user = userEvent.setup();
    await user.click(
      within(mobileList).getByRole('button', { name: 'Add day-event' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'New Event' });
    await user.type(within(dialog).getByLabelText('Title'), 'Youth Night');
    await pickCalendarDate({
      user,
      trigger: within(dialog).getByLabelText('Start date'),
      date: '2026-08-09',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(createPlanningEvent).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({ title: 'Youth Night' }),
      ),
    );
  });

  it('does not render the mobile add day-event trigger when read-only', async () => {
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
    const mobileList = await screen.findByTestId('planning-events-list');

    expect(
      within(mobileList).queryByRole('button', { name: 'Add day-event' }),
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).queryByText('Time block')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(within(table).getByText('Worship')).toBeInTheDocument();
    expect(within(table).getByText('Message')).toBeInTheDocument();
    expect(within(table).getByText('Time block')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).queryByText('Time block')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Expand all' }));

    // Expanding on desktop must not add time block rows to the mobile list, which
    // has no card representation for them (`renderMobileCard` renders
    // nothing for a time block row) and would otherwise leak empty placeholder
    // elements into the mobile listbox.
    expect(
      within(mobileList).getAllByTestId('planning-event-card'),
    ).toHaveLength(2);
    expect(mobileList.children).toHaveLength(3); // "Add day-event" button + 2 cards
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
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    await user.click(
      within(table).getByRole('button', { name: 'Collapse Sunday Service' }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).getByText('Time block')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).queryByText('Time block')).not.toBeInTheDocument();
  });
});
