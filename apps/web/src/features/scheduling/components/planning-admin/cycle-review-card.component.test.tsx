import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CycleListCard } from './cycle-list-card';
import { CycleReviewCard } from './cycle-review-card';
import { PlanningAdminProvider } from './planning-admin-context';
import { pickCalendarDate } from '@/__tests__/setup/date-picker';
import { renderWithProviders } from '@/__tests__/setup/render';

const listPlanningCycles = vi.fn();
const listEventTemplates = vi.fn().mockResolvedValue({ templates: [] });
const getPlanningCycle = vi.fn();
const createPlanningEvent = vi.fn().mockResolvedValue({ id: 'event-new' });
const updatePlanningEvent = vi.fn().mockResolvedValue({});
const cancelPlanningEvent = vi.fn().mockResolvedValue(undefined);
const createPlanningEventSlot = vi.fn().mockResolvedValue({});
const updatePlanningEventSlot = vi.fn().mockResolvedValue({});
const deletePlanningEventSlot = vi.fn().mockResolvedValue(undefined);

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    getPlanningCycle: (...args: unknown[]) => getPlanningCycle(...args),
    createPlanningEvent: (...args: unknown[]) => createPlanningEvent(...args),
    updatePlanningEvent: (...args: unknown[]) => updatePlanningEvent(...args),
    cancelPlanningEvent: (...args: unknown[]) => cancelPlanningEvent(...args),
    createPlanningEventSlot: (...args: unknown[]) =>
      createPlanningEventSlot(...args),
    updatePlanningEventSlot: (...args: unknown[]) =>
      updatePlanningEventSlot(...args),
    deletePlanningEventSlot: (...args: unknown[]) =>
      deletePlanningEventSlot(...args),
  },
}));

vi.mock('@/shared/utils/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/utils/date')>();
  return {
    ...actual,
    getBrowserTimezone: () => 'America/New_York',
  };
});

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
  await user.click(await screen.findByTestId('planning-cycle-option'));
  return user;
}

function isDateOnlyText(content: string): boolean {
  return /^\w{3} \d{1,2}, \d{4}$/.test(content);
}

function isTimeRangeText(content: string): boolean {
  return /^\d{1,2}:\d{2}\s?(AM|PM)\s?[–-]\s?\d{1,2}:\d{2}\s?(AM|PM)$/.test(
    content,
  );
}

beforeEach(() => {
  localStorage.clear();
});

interface TwoEventCycleResponseInput {
  state: 'draft' | 'locked';
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
          startDate: '2026-08-02T09:00:00Z',
          endDate: '2026-08-02T11:00:00Z',
          eventType: 'service',
          status: 'scheduled',
        },
        slots: [
          {
            id: 'slot-1',
            label: 'Worship',
            startTime: '2026-08-02T09:00:00Z',
            endTime: '2026-08-02T10:00:00Z',
          },
          {
            id: 'slot-2',
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
          startDate: '2026-08-05T19:00:00Z',
          endDate: '2026-08-05T20:00:00Z',
          eventType: 'service',
          status: 'scheduled',
        },
        slots: [
          {
            id: 'slot-3',
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
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

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
  it('renders a day row date-only and an expanded slot row time-only, with no raw ISO or arrow', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

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

    const slotTimeCells = within(table).getAllByText(isTimeRangeText);
    expect(slotTimeCells.length).toBeGreaterThan(0);
    for (const cell of slotTimeCells) {
      expect(cell.textContent).not.toMatch(/2026/);
      expect(cell.textContent).not.toMatch(/Z/);
    }
  });

  it('changes every displayed date/time when the timezone mode toggles between church and local', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();
    let table = await screen.findByRole('grid', { name: 'Calendar review' });
    let user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    const churchModeSlotTime =
      within(table).getAllByText(isTimeRangeText)[0].textContent;

    cleanup();
    localStorage.setItem('church_timezone_mode', 'user');

    render({ churchTimezone: 'UTC' });
    await selectTheOnlyCycle();
    table = await screen.findByRole('grid', { name: 'Calendar review' });
    user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    const localModeSlotTime =
      within(table).getAllByText(isTimeRangeText)[0].textContent;

    expect(localModeSlotTime).not.toBe(churchModeSlotTime);
  });
});

describe('CycleReviewCard table view (US2)', () => {
  it('renders each weekday entry as a collapsed row and expands to reveal its slots', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

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
    expect(within(table).getByText('Slot')).toBeInTheDocument();
    expect(within(table).getByText('Worship')).toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Collapse Sunday Service' }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).getByText('Slot')).toBeInTheDocument();
  });

  it('keeps the locked cycle table read-only with no new editing affordance', async () => {
    listPlanningCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'locked',
        },
      ],
    });
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'locked' }),
    );

    render({ isReadOnly: true });
    await selectTheOnlyCycle();

    const table = await screen.findByRole('grid', { name: 'Calendar review' });
    expect(table).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add event' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('lock-cycle-button')).not.toBeInTheDocument();
  });

  it('shows the empty-state message instead of an empty table when the cycle has no events', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue({
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

describe('CycleReviewCard day/slot edit and delete (US3)', () => {
  it("draft cycle shows day and slot edit/delete controls, disabling delete for a day's only slot", async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

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
      within(table).getByRole('button', { name: 'Delete slot Worship' }),
    ).toBeEnabled();
    expect(
      within(table).getByRole('button', { name: 'Edit slot Worship' }),
    ).toBeInTheDocument();

    await user.click(
      within(table).getByRole('button', { name: 'Expand Wednesday Service' }),
    );
    expect(
      within(table).getByRole('button', { name: 'Delete slot Slot' }),
    ).toBeDisabled();
  });

  it('deleting a day, after confirming, calls the cancel-event handler', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
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

    await waitFor(() =>
      expect(cancelPlanningEvent).toHaveBeenCalledWith('cycle-1', 'event-1'),
    );
  });

  it('deleting a non-last slot, after confirming, calls the delete-slot handler', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Delete slot Worship' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Delete slot' }),
    );

    await waitFor(() =>
      expect(deletePlanningEventSlot).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        'slot-1',
      ),
    );
  });

  it('keeps the desktop delete-day confirm dialog open with a "Deleting…" label until the mutation settles', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );
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

  it('keeps the desktop delete-slot confirm dialog open with a "Deleting…" label until the mutation settles', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );
    let resolveDelete: () => void = () => undefined;
    deletePlanningEventSlot.mockImplementation(
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
      within(table).getByRole('button', { name: 'Delete slot Worship' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Delete slot' }),
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

  it('renders Delete day/slot actions and the confirm-delete action with destructive styling, distinct from Edit', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

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
      within(table).getByRole('button', { name: 'Delete slot Worship' }),
    ).toHaveClass('text-destructive');

    await user.click(
      within(table).getByRole('button', { name: 'Delete day Sunday Service' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Delete event' }),
    ).toHaveClass('text-destructive');
  });

  it('adding a slot to a day, after filling the dialog, calls the create-slot handler', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Add slot to Sunday Service' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Add slot' });
    await user.type(within(dialog).getByLabelText('Label'), 'Prayer');
    await user.click(within(dialog).getByRole('button', { name: 'Add slot' }));

    await waitFor(() =>
      expect(createPlanningEventSlot).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        expect.objectContaining({ label: 'Prayer' }),
      ),
    );
  });

  it('editing a day, after changing title/description/location, calls the update-event handler', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

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
          startDate: expect.any(String),
          endDate: expect.any(String),
        }),
      ),
    );
  });

  it('editing a slot, after changing start/end time, calls the update-slot handler', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Edit slot Worship' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit slot' });
    fireEvent.change(within(dialog).getByLabelText('Start'), {
      target: { value: '08:30' },
    });
    fireEvent.change(within(dialog).getByLabelText('End'), {
      target: { value: '09:30' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePlanningEventSlot).toHaveBeenCalledWith(
        'cycle-1',
        'event-1',
        'slot-1',
        expect.objectContaining({
          label: 'Worship',
          startTime: expect.any(String),
          endTime: expect.any(String),
        }),
      ),
    );
  });

  it('locked cycle shows no edit/delete controls anywhere in the table', async () => {
    listPlanningCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'locked',
        },
      ],
    });
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'locked' }),
    );

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
      within(table).queryByRole('button', { name: /^Delete slot/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /^Edit slot/ }),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard slot dialog date/time fields (post-spec fix)', () => {
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
            startDate: '2026-08-02T09:00:00Z',
            endDate: '2026-08-02T11:00:00Z',
            eventType: 'service',
            status: 'scheduled',
          },
          slots: [
            {
              id: 'slot-1',
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
            startDate: '2026-08-08T00:00:00Z',
            endDate: '2026-08-09T23:59:59Z',
            eventType: 'retreat',
            status: 'scheduled',
          },
          slots: [
            {
              id: 'slot-2',
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
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      singleAndMultiDayEventCycleResponse({ state: 'draft' }),
    );
  }

  it('shows time-only inputs (no date field) in the Add slot dialog for a single-day event', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Add slot to Sunday Service' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Add slot' });
    expect(within(dialog).getByLabelText('Start')).toHaveAttribute(
      'type',
      'time',
    );
    expect(within(dialog).getByLabelText('End')).toHaveAttribute(
      'type',
      'time',
    );
  });

  it('shows date+time inputs in the Add slot dialog for a multi-day event', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', {
        name: 'Add slot to Retreat Weekend',
      }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Add slot' });
    expect(within(dialog).getByLabelText('Start')).toHaveAttribute(
      'type',
      'datetime-local',
    );
    expect(within(dialog).getByLabelText('End')).toHaveAttribute(
      'type',
      'datetime-local',
    );
  });

  it('shows time-only inputs in the Edit slot dialog for a single-day event slot', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Sunday Service' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Edit slot Worship' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit slot' });
    expect(within(dialog).getByLabelText('Start')).toHaveAttribute(
      'type',
      'time',
    );
    expect(within(dialog).getByLabelText('End')).toHaveAttribute(
      'type',
      'time',
    );
  });

  it('shows date+time inputs in the Edit slot dialog for a multi-day event slot', async () => {
    mockSingleAndMultiDayCycle();

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(
      within(table).getByRole('button', { name: 'Expand Retreat Weekend' }),
    );
    await user.click(
      within(table).getByRole('button', { name: 'Edit slot Check-in' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit slot' });
    expect(within(dialog).getByLabelText('Start')).toHaveAttribute(
      'type',
      'datetime-local',
    );
    expect(within(dialog).getByLabelText('End')).toHaveAttribute(
      'type',
      'datetime-local',
    );
  });
});

describe('CycleReviewCard mobile add day-event trigger (US1)', () => {
  it('opens QuickCreateEventModal, through its ResponsiveFormSurface shell, from the mobile list', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

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
      trigger: within(dialog).getByLabelText('Date'),
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
    listPlanningCycles.mockResolvedValue({
      cycles: [
        {
          id: 'cycle-1',
          name: 'August 2026',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          state: 'locked',
        },
      ],
    });
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'locked' }),
    );

    render({ isReadOnly: true });
    await selectTheOnlyCycle();
    const mobileList = await screen.findByTestId('planning-events-list');

    expect(
      within(mobileList).queryByRole('button', { name: 'Add day-event' }),
    ).not.toBeInTheDocument();
  });
});

describe('CycleReviewCard desktop bulk expand/collapse (US5)', () => {
  it('"Expand all" reveals every day row\'s slots; "Collapse all" hides them all', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).queryByText('Slot')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(within(table).getByText('Worship')).toBeInTheDocument();
    expect(within(table).getByText('Message')).toBeInTheDocument();
    expect(within(table).getByText('Slot')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).queryByText('Slot')).not.toBeInTheDocument();
  });

  it('is one-shot, not a synced toggle: re-collapsing one row after "Expand all" still lets "Collapse all" collapse everything', async () => {
    listPlanningCycles.mockResolvedValue({
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
    getPlanningCycle.mockResolvedValue(
      twoEventCycleResponse({ state: 'draft' }),
    );

    render();
    await selectTheOnlyCycle();
    const table = await screen.findByRole('grid', { name: 'Calendar review' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    await user.click(
      within(table).getByRole('button', { name: 'Collapse Sunday Service' }),
    );
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).getByText('Slot')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(within(table).queryByText('Worship')).not.toBeInTheDocument();
    expect(within(table).queryByText('Slot')).not.toBeInTheDocument();
  });
});
