import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEditPage } from '@/features/scheduling/components/planning-admin/event-edit-page';
import { renderWithProviders } from '@/tests/setup/render';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const getCycle = vi.fn();
const updatePlanningEvent = vi.fn();
const deletePlanningEvent = vi.fn();
const navigate = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getCycle: (...args: unknown[]) => getCycle(...args),
    updatePlanningEvent: (...args: unknown[]) => updatePlanningEvent(...args),
    deletePlanningEvent: (...args: unknown[]) => deletePlanningEvent(...args),
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
  eventStatus?: 'draft' | 'scheduled';
}

/**
 * A Draft Cycle holding Sunday 18 Oct 09:00–12:00 (Welcome 09–10, Service
 * 10–12) and another Event, in São Paulo time.
 */
function cycleResponse({
  state = 'draft',
  eventStatus = 'draft',
}: CycleResponseInput = {}) {
  return {
    cycle: {
      id: 'cycle-1',
      name: 'October',
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      state,
    },
    events: [
      {
        event: {
          id: 'event-0',
          title: 'Other',
          start: '2026-10-14T22:00:00.000Z',
          end: '2026-10-15T00:00:00.000Z',
          status: eventStatus,
        },
        eventTimeBlocks: [],
      },
      {
        event: {
          id: 'event-1',
          title: 'Sunday',
          location: 'Main hall',
          start: '2026-10-18T12:00:00.000Z',
          end: '2026-10-18T15:00:00.000Z',
          status: eventStatus,
        },
        eventTimeBlocks: [
          {
            id: 'block-welcome',
            label: 'Welcome',
            startTime: '2026-10-18T12:00:00.000Z',
            endTime: '2026-10-18T13:00:00.000Z',
          },
          {
            id: 'block-service',
            label: 'Service',
            startTime: '2026-10-18T13:00:00.000Z',
            endTime: '2026-10-18T15:00:00.000Z',
          },
        ],
      },
    ],
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
  eventId?: string;
}

function renderPage({ eventId = 'event-1' }: RenderPageInput = {}) {
  return renderWithProviders(
    <EventEditPage cycleId="cycle-1" eventId={eventId} />,
    { churchTimezone: SAO_PAULO },
  );
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

const SAVED_GRAPH = { event: { id: 'event-1' }, eventTimeBlocks: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getCycle.mockResolvedValue(cycleResponse());
});

describe('EventEditPage', () => {
  it('loads the Event by route id with its saved rows, and Cancel returns without a write', async () => {
    renderPage();

    expect(await screen.findByTestId('event-editor-form')).toBeInTheDocument();
    expect(getCycle).toHaveBeenCalledWith('cycle-1');
    expect(titleInput()).toHaveValue('Sunday');
    expect(screen.getByLabelText(m.event_editor_location_label())).toHaveValue(
      'Main hall',
    );
    expect(rows().map((row) => rowLabel(row))).toEqual([
      expect.objectContaining({ value: 'Welcome' }),
      expect.objectContaining({ value: 'Service' }),
    ]);
    expect(
      screen.getByRole('link', { name: m.event_editor_cancel() }),
    ).toHaveAttribute('href', '/cycles/cycle-1');
    expect(updatePlanningEvent).not.toHaveBeenCalled();
  });

  it('saves the complete graph keeping retained ids, then returns to the review revealing the Event', async () => {
    updatePlanningEvent.mockResolvedValue(SAVED_GRAPH);
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');

    const welcome = rowLabel(rows()[0] as HTMLElement);
    await user.clear(welcome);
    await user.type(welcome, 'Arrival');
    await user.click(
      screen.getByRole('button', {
        name: m.event_editor_block_remove({ number: 2 }),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.event_editor_block_add() }),
    );
    await user.type(rowLabel(rows()[1] as HTMLElement), 'Lunch');
    await setTime({ user, testId: 'event-block-2-start', time: '11:00' });
    await user.click(saveButton());

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/cycles/$cycleId',
        params: { cycleId: 'cycle-1' },
        search: { eventId: 'event-1' },
      }),
    );
    expect(updatePlanningEvent).toHaveBeenCalledTimes(1);
    expect(updatePlanningEvent).toHaveBeenCalledWith('cycle-1', 'event-1', {
      title: 'Sunday',
      location: 'Main hall',
      start: '2026-10-18T12:00:00.000Z',
      end: '2026-10-18T15:00:00.000Z',
      eventTimeBlocks: [
        {
          id: 'block-welcome',
          label: 'Arrival',
          startTime: '2026-10-18T12:00:00.000Z',
          endTime: '2026-10-18T13:00:00.000Z',
        },
        {
          label: 'Lunch',
          startTime: '2026-10-18T14:00:00.000Z',
          endTime: '2026-10-18T15:00:00.000Z',
        },
      ],
    });
    expect(toastSuccess).toHaveBeenCalledWith(m.event_editor_updated_toast());
  });

  it('flags a shrink that leaves a saved row outside the proposed bounds and disables Save', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');

    await setTime({ user, testId: 'event-end', time: '11:00' });

    expect(screen.getByTestId('event-block-2-end-error')).toHaveTextContent(
      m.error_validation_event_time_block_out_of_bounds(),
    );
    expect(screen.queryByTestId('event-block-1-end-error')).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it('keeps every input on a refusal, places it beside the named row and retries', async () => {
    updatePlanningEvent
      .mockRejectedValueOnce(
        refusal({
          status: 422,
          data: {
            error: 'VALIDATION_ERROR',
            reason: 'EVENT_TIME_BLOCK_OUT_OF_BOUNDS',
            field: 'eventTimeBlocks.1',
            message: m.error_validation_event_time_block_out_of_bounds(),
          },
        }),
      )
      .mockResolvedValueOnce(SAVED_GRAPH);
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');
    await user.clear(titleInput());
    await user.type(titleInput(), 'Sunday gathering');

    await user.click(saveButton());

    expect(
      await screen.findByTestId('event-block-2-end-error'),
    ).toHaveTextContent(m.error_validation_event_time_block_out_of_bounds());
    expect(titleInput()).toHaveValue('Sunday gathering');
    expect(navigate).not.toHaveBeenCalled();

    await user.click(saveButton());
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(updatePlanningEvent).toHaveBeenCalledTimes(2);
  });

  it('reloads the authoritative Cycle after a state conflict and offers no draft form', async () => {
    updatePlanningEvent.mockRejectedValue(
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
    getCycle.mockResolvedValue(
      cycleResponse({ state: 'sent', eventStatus: 'scheduled' }),
    );

    await user.click(saveButton());

    expect(await screen.findByTestId('event-edit-not-draft')).toHaveTextContent(
      m.event_editor_edit_not_draft(),
    );
    expect(getCycle).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('shows pending status and submits once while saving', async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    updatePlanningEvent.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('event-editor-form');

    await user.click(saveButton());
    const pending = await screen.findByRole('button', {
      name: m.event_editor_saving(),
    });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(updatePlanningEvent).toHaveBeenCalledTimes(1);

    resolveSave(SAVED_GRAPH);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it('retries a failed Cycle load', async () => {
    getCycle.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPage();

    const alert = await screen.findByTestId('event-edit-load-error');
    expect(alert).toHaveTextContent(m.cycle_review_error());
    await user.click(within(alert).getByRole('button'));

    expect(await screen.findByTestId('event-editor-form')).toBeInTheDocument();
  });

  it('scopes not-found to the Cycle and the Event, and refuses a non-Draft Event', async () => {
    getCycle.mockRejectedValueOnce(refusal({ status: 404, data: {} }));
    const first = renderPage();
    expect(
      await screen.findByTestId('event-edit-cycle-not-found'),
    ).toHaveTextContent(m.cycle_review_not_found());
    first.unmount();

    const second = renderPage({ eventId: 'event-of-another-cycle' });
    expect(
      await screen.findByTestId('event-edit-event-not-found'),
    ).toHaveTextContent(m.event_editor_event_not_found());
    second.unmount();

    // A Sent Cycle's Event reopened to draft is still not editable here.
    getCycle.mockResolvedValue(cycleResponse({ state: 'sent' }));
    renderPage();
    expect(
      await screen.findByTestId('event-edit-not-draft'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('event-editor-form')).not.toBeInTheDocument();
  });
});

describe('Delete a Draft Event', () => {
  async function openDialog(user: UserEvent) {
    await screen.findByTestId('event-editor-form');
    await user.click(screen.getByTestId('event-delete-open'));
    return screen.findByRole('alertdialog');
  }

  it('dismissing the confirmation makes no request', async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDialog(user);
    expect(dialog).toHaveTextContent(m.event_editor_delete_title());

    await user.click(
      within(dialog).getByRole('button', {
        name: m.event_editor_delete_dismiss(),
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(deletePlanningEvent).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows pending status, submits once, then returns to the review', async () => {
    let resolveDelete: (value: unknown) => void = () => undefined;
    deletePlanningEvent.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    await user.click(screen.getByTestId('event-delete-confirm'));
    const pending = await screen.findByRole('button', {
      name: m.event_editor_deleting(),
    });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(deletePlanningEvent).toHaveBeenCalledTimes(1);
    expect(deletePlanningEvent).toHaveBeenCalledWith('cycle-1', 'event-1');

    resolveDelete(undefined);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/cycles/$cycleId',
        params: { cycleId: 'cycle-1' },
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith(m.event_editor_deleted_toast());
  });

  it('keeps the confirmation on failure and retries', async () => {
    deletePlanningEvent.mockRejectedValueOnce(
      refusal({ status: 500, data: { message: 'Server broke' } }),
    );
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    await user.click(screen.getByTestId('event-delete-confirm'));

    expect(await screen.findByTestId('event-delete-error')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    deletePlanningEvent.mockResolvedValue(undefined);
    await user.click(screen.getByTestId('event-delete-confirm'));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(deletePlanningEvent).toHaveBeenCalledTimes(2);
  });

  it('reloads the authoritative Cycle after a state conflict and hides draft actions', async () => {
    deletePlanningEvent.mockRejectedValue(
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
    await openDialog(user);
    getCycle.mockResolvedValue(
      cycleResponse({ state: 'sent', eventStatus: 'scheduled' }),
    );

    await user.click(screen.getByTestId('event-delete-confirm'));

    expect(
      await screen.findByTestId('event-edit-not-draft'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('event-delete-open')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
