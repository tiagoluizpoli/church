import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventCancelDialog } from '@/features/scheduling/components/planning-admin/event-cancel-dialog';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { renderWithProviders } from '@/tests/setup/render';

const previewPlanningEventCancellation = vi.fn();
const cancelPlanningEvent = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    previewPlanningEventCancellation: (...args: unknown[]) =>
      previewPlanningEventCancellation(...args),
    cancelPlanningEvent: (...args: unknown[]) => cancelPlanningEvent(...args),
  },
}));

interface ImpactInput {
  volunteerCount?: number;
  ministryCount?: number;
  openSwapRequestCount?: number;
}

function impact({
  volunteerCount = 3,
  ministryCount = 2,
  openSwapRequestCount = 1,
}: ImpactInput = {}) {
  return {
    scope: { kind: 'event' },
    eventId: 'event-1',
    eventTitle: 'Sunday',
    start: '2026-10-18T12:00:00.000Z',
    end: '2026-10-18T15:00:00.000Z',
    volunteerCount,
    ministryCount,
    ministries: [],
    openSwapRequestCount,
  };
}

/** Every read the cancellation changes, seeded so invalidation shows. */
const READERS = [
  ['cycle-details', 'cycle-1'],
  ['cycles'],
  ['cycle-builder', 'cycle-1', 'm-1'],
  ['prepare-schedules'],
  ['notifications', 'u-1', 'c-1'],
  ['my-schedule', 'u-1', 'c-1'],
  ['availability-checks'],
];

interface OpenInput {
  queryClient?: QueryClient;
}

async function open({ queryClient }: OpenInput = {}) {
  const user = userEvent.setup();
  renderWithProviders(
    <TimezoneProvider churchTimezone="America/Sao_Paulo">
      <EventCancelDialog cycleId="cycle-1" eventId="event-1" title="Sunday" />
    </TimezoneProvider>,
    { queryClient },
  );
  await user.click(
    screen.getByRole('button', {
      name: m.event_cancel_action_label({ title: 'Sunday' }),
    }),
  );
  return user;
}

const confirmButton = () =>
  screen.getByRole('button', { name: m.event_cancel_confirm() });

beforeEach(() => {
  previewPlanningEventCancellation.mockReset();
  cancelPlanningEvent.mockReset();
});

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

describe('EventCancelDialog', () => {
  it('previews on open and shows who is told, the Ministries, the open requests and the warning', async () => {
    previewPlanningEventCancellation.mockResolvedValue(impact());

    await open();

    expect(previewPlanningEventCancellation).toHaveBeenCalledWith(
      'cycle-1',
      'event-1',
    );
    const shown = await screen.findByTestId('event-cancel-impact');
    expect(shown).toHaveTextContent(
      m.event_cancel_volunteers_other({ count: 3 }),
    );
    expect(shown).toHaveTextContent(
      m.event_cancel_ministries_other({ count: 2 }),
    );
    expect(shown).toHaveTextContent(m.event_cancel_swap_requests_one());
    expect(shown).toHaveTextContent(m.event_cancel_warning());
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });

  it('keeps confirm disabled until the pt-BR word is typed, in any case and spacing', async () => {
    previewPlanningEventCancellation.mockResolvedValue(impact());
    cancelPlanningEvent.mockResolvedValue(impact());
    const user = await open();
    await screen.findByTestId('event-cancel-impact');
    const field = screen.getByLabelText(
      m.event_cancel_confirm_label({ word: 'cancelar' }),
    );

    expect(confirmButton()).toBeDisabled();
    await user.type(field, 'cancel');
    expect(confirmButton()).toBeDisabled();
    await user.clear(field);
    await user.type(field, '  CANCELAR ');
    expect(confirmButton()).toBeEnabled();
    await user.click(confirmButton());

    expect(cancelPlanningEvent).toHaveBeenCalledWith('cycle-1', 'event-1', {
      confirmation: '  CANCELAR ',
    });
  });

  it('asks for the English word in English', async () => {
    overwriteGetLocale(() => 'en');
    previewPlanningEventCancellation.mockResolvedValue(impact());
    const user = await open();
    await screen.findByTestId('event-cancel-impact');

    await user.type(screen.getByLabelText('Type cancel to confirm'), 'Cancel');

    expect(screen.getByRole('button', { name: 'Cancel event' })).toBeEnabled();
  });

  it('still gates a zero-impact Event', async () => {
    previewPlanningEventCancellation.mockResolvedValue(
      impact({ volunteerCount: 0, ministryCount: 0, openSwapRequestCount: 0 }),
    );

    await open();

    const shown = await screen.findByTestId('event-cancel-impact');
    expect(shown).toHaveTextContent(m.event_cancel_volunteers_none());
    expect(shown).not.toHaveTextContent(m.event_cancel_swap_requests_one());
    expect(confirmButton()).toBeDisabled();
  });

  it('shows the actual result, then refreshes the Cycle, Schedules, notices and Volunteer reads on close', async () => {
    previewPlanningEventCancellation.mockResolvedValue(impact());
    // Recalculated: one more Volunteer than the preview.
    cancelPlanningEvent.mockResolvedValue(impact({ volunteerCount: 4 }));
    const queryClient = new QueryClient();
    for (const queryKey of READERS) queryClient.setQueryData(queryKey, {});
    const user = await open({ queryClient });
    await screen.findByTestId('event-cancel-impact');
    await user.type(
      screen.getByLabelText(m.event_cancel_confirm_label({ word: 'cancelar' })),
      'cancelar',
    );

    await user.click(confirmButton());

    expect(await screen.findByTestId('event-cancel-done')).toHaveTextContent(
      m.event_cancel_done_other({ count: 4 }),
    );
    expect(
      screen.queryByRole('button', { name: m.event_cancel_confirm() }),
    ).not.toBeInTheDocument();
    expect(queryClient.getQueryState(['cycles'])?.isInvalidated).toBe(false);
    await user.click(
      screen.getByRole('button', { name: m.event_cancel_done_close() }),
    );
    for (const queryKey of READERS) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
  });

  it('shows a localized refusal and keeps the dialog open for another try', async () => {
    previewPlanningEventCancellation.mockResolvedValue(impact());
    cancelPlanningEvent.mockRejectedValue(
      new AxiosError('Conflict', '409', undefined, undefined, {
        status: 409,
        data: {
          error: 'ADMIN_CANCELLATION_WINDOW_CLOSED',
          message: 'Já começou',
        },
      } as AxiosResponse),
    );
    const user = await open();
    await screen.findByTestId('event-cancel-impact');
    await user.type(
      screen.getByLabelText(m.event_cancel_confirm_label({ word: 'cancelar' })),
      'cancelar',
    );

    await user.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Já começou');
    expect(screen.queryByTestId('event-cancel-done')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('event-cancel-dialog')).getByRole('button', {
        name: m.event_cancel_confirm(),
      }),
    ).toBeInTheDocument();
  });

  it('shows the preview refusal, offering no confirm', async () => {
    previewPlanningEventCancellation.mockRejectedValue(
      new AxiosError('Conflict', '409', undefined, undefined, {
        status: 409,
        data: { error: 'ILLEGAL_STATE_TRANSITION', message: 'Não agendado' },
      } as AxiosResponse),
    );

    await open();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não agendado');
    expect(
      screen.queryByRole('button', { name: m.event_cancel_confirm() }),
    ).not.toBeInTheDocument();
  });
});
