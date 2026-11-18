import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventCreatePage } from '@/features/scheduling/components/planning-admin/event-create-page';
import { pickCalendarDate } from '@/tests/setup/date-picker';
import { renderWithProviders } from '@/tests/setup/render';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const getCycle = vi.fn();
const createPlanningEvent = vi.fn();
const navigate = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getCycle: (...args: unknown[]) => getCycle(...args),
    createPlanningEvent: (...args: unknown[]) => createPlanningEvent(...args),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

interface MockLinkProps {
  children: ReactNode;
  to: string;
  params?: Record<string, string>;
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: MockLinkProps) => (
    <a href={to.replace('$cycleId', params?.cycleId ?? '')}>{children}</a>
  ),
  useNavigate: () => navigate,
}));

/** São Paulo is UTC-3 with no DST. */
const SAO_PAULO = 'America/Sao_Paulo';

interface CycleResponseInput {
  state?: 'draft' | 'sent' | 'past';
  startDate?: string;
  endDate?: string;
}

function cycleResponse({
  state = 'draft',
  startDate = '2026-10-12',
  endDate = '2026-10-25',
}: CycleResponseInput = {}) {
  return {
    cycle: { id: 'cycle-1', name: 'October', startDate, endDate, state },
    events: [],
  };
}

interface RefusalInput {
  status: number;
  data: unknown;
}

function refusal({ status, data }: RefusalInput) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

interface RenderPageInput {
  churchTimezone?: string;
}

function renderPage({ churchTimezone = SAO_PAULO }: RenderPageInput = {}) {
  return renderWithProviders(<EventCreatePage cycleId="cycle-1" />, {
    churchTimezone,
  });
}

function titleInput() {
  return screen.getByLabelText(m.event_editor_title_label());
}

function rows() {
  return screen.getAllByTestId('event-time-block-row');
}

function rowLabel(row: HTMLElement) {
  return within(row).getByLabelText(m.event_editor_block_label());
}

function saveButton() {
  return screen.getByRole('button', { name: m.event_editor_create_submit() });
}

interface SetTimeInput {
  user: UserEvent;
  testId: string;
  time: string;
}

function setTime({ user, testId, time }: SetTimeInput) {
  return fillTimeOfDayField({
    user,
    field: screen.getByTestId(`${testId}-time`),
    time,
  });
}

interface SetDayInput {
  user: UserEvent;
  testId: string;
  date: string;
}

function setDay({ user, testId, date }: SetDayInput) {
  return pickCalendarDate({
    user,
    trigger: screen.getByTestId(`${testId}-date`),
    date,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCycle.mockResolvedValue(cycleResponse());
});

describe('EventCreatePage', () => {
  it('starts on the first Cycle day with one whole-Event row, a disabled Save and Cancel back to the Cycle', async () => {
    renderPage();

    expect(await screen.findByTestId('event-editor-form')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId('event-start-date')).toHaveTextContent(
      '12/10/2026',
    );
    expect(screen.getByTestId('event-start-time')).toHaveTextContent('19:00');
    expect(screen.getByTestId('event-block-1-end-time')).toHaveTextContent(
      '21:00',
    );
    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByRole('link', { name: m.event_editor_cancel() }),
    ).toHaveAttribute('href', '/cycles/cycle-1');
    expect(screen.queryByLabelText(/descri/i)).not.toBeInTheDocument();
  });

  it('keeps the initial row on the title and bounds until it is customized', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');

    await user.type(titleInput(), 'Youth night');
    await setTime({ user, testId: 'event-end', time: '22:30' });
    const [row] = rows();
    expect(rowLabel(row as HTMLElement)).toHaveValue('Youth night');
    expect(screen.getByTestId('event-block-1-end-time')).toHaveTextContent(
      '22:30',
    );

    await user.clear(rowLabel(row as HTMLElement));
    await user.type(rowLabel(row as HTMLElement), 'Worship');
    await user.type(titleInput(), '!');
    await setTime({ user, testId: 'event-end', time: '23:00' });

    expect(rowLabel(row as HTMLElement)).toHaveValue('Worship');
    expect(screen.getByTestId('event-block-1-end-time')).toHaveTextContent(
      '22:30',
    );
    expect(saveButton()).toBeEnabled();
  });

  it('flags duplicate labels, a reversed range, an out-of-bounds row and a start outside the Cycle inline', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');
    await user.type(titleInput(), 'Service');

    await user.click(
      screen.getByRole('button', { name: m.event_editor_block_add() }),
    );
    await user.type(rowLabel(rows()[1] as HTMLElement), ' SERVICE ');
    expect(screen.getByTestId('event-block-2-label-error')).toHaveTextContent(
      m.error_validation_duplicate_event_time_block_label(),
    );
    expect(saveButton()).toBeDisabled();

    await user.clear(rowLabel(rows()[1] as HTMLElement));
    await user.type(rowLabel(rows()[1] as HTMLElement), 'Prayer');
    await setTime({ user, testId: 'event-block-2-end', time: '23:00' });
    expect(screen.getByTestId('event-block-2-end-error')).toHaveTextContent(
      m.error_validation_event_time_block_out_of_bounds(),
    );

    await setTime({ user, testId: 'event-block-2-end', time: '18:00' });
    expect(screen.getByTestId('event-block-2-end-error')).toHaveTextContent(
      m.error_validation_invalid_event_bounds(),
    );
    await user.click(
      screen.getByRole('button', {
        name: m.event_editor_block_remove({ number: 2 }),
      }),
    );

    await setDay({ user, testId: 'event-start', date: '2026-10-26' });
    expect(screen.getByTestId('event-start-error')).toHaveTextContent(
      m.error_event_outside_cycle(),
    );
    expect(saveButton()).toBeDisabled();
    expect(createPlanningEvent).not.toHaveBeenCalled();
  });

  it('associates invalid Event and block dates and time segments with their own errors, clearing them after correction', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');
    await user.type(titleInput(), 'Service');

    const expectInvalidInstant = (id: string, message: string) => {
      const date = screen.getByTestId(`${id}-date`);
      expect(date).toHaveAttribute('aria-invalid', 'true');
      expect(date).toHaveAccessibleDescription(message);
      for (const segment of within(
        screen.getByTestId(`${id}-time`),
      ).getAllByRole('spinbutton')) {
        expect(segment).toHaveAttribute('aria-invalid', 'true');
        expect(segment).toHaveAccessibleDescription(new RegExp(message));
      }
    };

    await setTime({ user, testId: 'event-end', time: '18:00' });
    expectInvalidInstant(
      'event-end',
      m.error_validation_invalid_event_bounds(),
    );
    await setTime({ user, testId: 'event-end', time: '21:00' });
    expect(screen.getByTestId('event-end-date')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    for (const segment of within(
      screen.getByTestId('event-end-time'),
    ).getAllByRole('spinbutton')) {
      expect(segment).not.toHaveAttribute('aria-invalid', 'true');
      expect(segment).not.toHaveAccessibleDescription(
        new RegExp(m.error_validation_invalid_event_bounds()),
      );
    }

    await setTime({ user, testId: 'event-block-1-start', time: '18:00' });
    expectInvalidInstant(
      'event-block-1-start',
      m.error_validation_event_time_block_out_of_bounds(),
    );
    expectInvalidInstant(
      'event-block-1-end',
      m.error_validation_event_time_block_out_of_bounds(),
    );
    expect(screen.getByTestId('event-start-date')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await setDay({ user, testId: 'event-start', date: '2026-10-26' });
    expectInvalidInstant('event-start', m.error_event_outside_cycle());
    expect(saveButton()).toBeDisabled();
    expect(createPlanningEvent).not.toHaveBeenCalled();
  });

  it('saves a multi-day retreat ending after the Cycle and returns to the review revealing it', async () => {
    createPlanningEvent.mockResolvedValue({
      event: { id: 'event-9' },
      eventTimeBlocks: [],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');

    await user.type(titleInput(), ' Retreat ');
    await user.type(
      screen.getByLabelText(m.event_editor_location_label()),
      'Camp',
    );
    // Starts on the last included day; ends two days after the Cycle.
    await setDay({ user, testId: 'event-start', date: '2026-10-25' });
    await setDay({ user, testId: 'event-end', date: '2026-10-27' });
    await setTime({ user, testId: 'event-end', time: '12:00' });
    await user.click(
      screen.getByRole('button', { name: m.event_editor_block_add() }),
    );
    await user.type(rowLabel(rows()[1] as HTMLElement), 'Vigil');
    await setTime({ user, testId: 'event-block-2-start', time: '22:00' });
    await setDay({ user, testId: 'event-block-2-end', date: '2026-10-26' });
    await setTime({ user, testId: 'event-block-2-end', time: '02:00' });
    await user.click(saveButton());

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/cycles/$cycleId',
        params: { cycleId: 'cycle-1' },
        search: { eventId: 'event-9' },
      }),
    );
    expect(createPlanningEvent).toHaveBeenCalledTimes(1);
    expect(createPlanningEvent).toHaveBeenCalledWith('cycle-1', {
      title: 'Retreat',
      location: 'Camp',
      start: '2026-10-25T22:00:00.000Z',
      end: '2026-10-27T15:00:00.000Z',
      eventTimeBlocks: [
        {
          label: 'Retreat',
          startTime: '2026-10-25T22:00:00.000Z',
          endTime: '2026-10-27T15:00:00.000Z',
        },
        {
          label: 'Vigil',
          startTime: '2026-10-26T01:00:00.000Z',
          endTime: '2026-10-26T05:00:00.000Z',
        },
      ],
    });
    expect(toastSuccess).toHaveBeenCalledWith(m.event_editor_created_toast());
  });

  it('converts across a DST change in the Church Timezone, whatever the host zone', async () => {
    getCycle.mockResolvedValue(
      cycleResponse({ startDate: '2026-10-30', endDate: '2026-11-02' }),
    );
    createPlanningEvent.mockResolvedValue({
      event: { id: 'event-dst' },
      eventTimeBlocks: [],
    });
    const user = userEvent.setup();
    // New York leaves EDT (UTC-4) for EST (UTC-5) early on 1 November 2026.
    renderPage({ churchTimezone: 'America/New_York' });
    await screen.findByTestId('event-editor-form');

    await user.type(titleInput(), 'Lock-in');
    await setDay({ user, testId: 'event-start', date: '2026-10-31' });
    await setDay({ user, testId: 'event-end', date: '2026-11-01' });
    await setTime({ user, testId: 'event-end', time: '10:00' });
    await user.click(saveButton());

    await waitFor(() => expect(createPlanningEvent).toHaveBeenCalled());
    expect(createPlanningEvent).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({
        start: '2026-10-31T23:00:00.000Z',
        end: '2026-11-01T15:00:00.000Z',
      }),
    );
  });

  it('keeps every input on a refusal, places it beside the named row and retries once corrected', async () => {
    createPlanningEvent
      .mockRejectedValueOnce(
        refusal({
          status: 422,
          data: {
            error: 'VALIDATION_ERROR',
            reason: 'DUPLICATE_EVENT_TIME_BLOCK_LABEL',
            field: 'eventTimeBlocks.0.label',
            message: m.error_validation_duplicate_event_time_block_label(),
          },
        }),
      )
      .mockResolvedValueOnce({ event: { id: 'event-2' }, eventTimeBlocks: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');
    await user.type(titleInput(), 'Service');

    await user.click(saveButton());

    expect(
      await screen.findByTestId('event-block-1-label-error'),
    ).toHaveTextContent(m.error_validation_duplicate_event_time_block_label());
    expect(titleInput()).toHaveValue('Service');
    expect(navigate).not.toHaveBeenCalled();

    await user.click(saveButton());
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createPlanningEvent).toHaveBeenCalledTimes(2);
  });

  it('reloads the authoritative Cycle after a state conflict and offers no draft form', async () => {
    createPlanningEvent.mockRejectedValue(
      refusal({
        status: 409,
        data: {
          error: 'ILLEGAL_STATE_TRANSITION',
          message: m.error_illegal_state_transition(),
        },
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');
    await user.type(titleInput(), 'Service');
    getCycle.mockResolvedValue(cycleResponse({ state: 'past' }));

    await user.click(saveButton());

    expect(
      await screen.findByTestId('event-create-not-draft'),
    ).toHaveTextContent(m.event_editor_not_draft());
    expect(getCycle).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows pending status and submits once while saving', async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    createPlanningEvent.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');
    await user.type(titleInput(), 'Service');

    await user.click(saveButton());
    const pending = await screen.findByRole('button', {
      name: m.event_editor_saving(),
    });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(createPlanningEvent).toHaveBeenCalledTimes(1);

    resolveSave({ event: { id: 'event-3' }, eventTimeBlocks: [] });
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it('retries a failed Cycle load', async () => {
    getCycle.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPage();

    const alert = await screen.findByTestId('event-create-load-error');
    expect(alert).toHaveTextContent(m.cycle_review_error());
    await user.click(within(alert).getByRole('button'));

    expect(await screen.findByTestId('event-editor-form')).toBeInTheDocument();
  });

  it('offers the complete editor on a Sent Cycle', async () => {
    getCycle.mockResolvedValue(cycleResponse({ state: 'sent' }));
    renderPage();

    expect(await screen.findByTestId('event-editor-form')).toBeInTheDocument();
    expect(
      screen.queryByTestId('event-create-not-draft'),
    ).not.toBeInTheDocument();
  });

  it('says a missing Cycle was not found and a Past Cycle takes no new Event', async () => {
    getCycle.mockRejectedValueOnce(refusal({ status: 404, data: {} }));
    const { unmount } = renderPage();
    expect(
      await screen.findByTestId('event-create-cycle-not-found'),
    ).toHaveTextContent(m.cycle_review_not_found());
    unmount();

    getCycle.mockResolvedValue(cycleResponse({ state: 'past' }));
    renderPage();
    expect(
      await screen.findByTestId('event-create-not-draft'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('event-editor-form')).not.toBeInTheDocument();
  });
});
