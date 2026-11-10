import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventMovePreview } from '@/features/scheduling/components/planning-admin/event-move-preview';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { renderWithProviders } from '@/tests/setup/render';

const previewPlanningEventMove = vi.fn();
const movePlanningEvent = vi.fn();
const previewPlanningEventTimeBlockMove = vi.fn();
const movePlanningEventTimeBlock = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    previewPlanningEventMove: (...args: unknown[]) =>
      previewPlanningEventMove(...args),
    movePlanningEvent: (...args: unknown[]) => movePlanningEvent(...args),
    previewPlanningEventTimeBlockMove: (...args: unknown[]) =>
      previewPlanningEventTimeBlockMove(...args),
    movePlanningEventTimeBlock: (...args: unknown[]) =>
      movePlanningEventTimeBlock(...args),
  },
}));

const START = '2026-10-18T12:00:00.000Z' as Instant;

function preview(clashes: unknown[]) {
  return {
    event: {
      previous: { start: START, end: '2026-10-18T15:00:00.000Z' },
      proposed: {
        start: '2026-10-20T17:00:00.000Z',
        end: '2026-10-20T20:00:00.000Z',
      },
    },
    eventTimeBlocks: [
      {
        id: 'block-1',
        label: 'Welcome',
        moved: true,
        previous: { start: START, end: '2026-10-18T13:00:00.000Z' },
        proposed: {
          start: '2026-10-20T17:00:00.000Z',
          end: '2026-10-20T18:00:00.000Z',
        },
      },
    ],
    clashes,
  };
}

const ANA_CLASH = {
  assignmentId: 'a-1',
  eventTimeBlockId: 'block-1',
  shiftId: 's-1',
  volunteer: { id: 'v-1', name: 'Ana' },
  ministry: { id: 'm-1', name: 'Music' },
  proposedStart: '2026-10-20T17:00:00.000Z',
  proposedEnd: '2026-10-20T18:00:00.000Z',
};

interface OpenAndPreviewInput {
  queryClient?: QueryClient;
}

async function openAndPreview({ queryClient }: OpenAndPreviewInput = {}) {
  const user = userEvent.setup();
  renderWithProviders(
    <TimezoneProvider churchTimezone="America/Sao_Paulo">
      <EventMovePreview
        cycleId="cycle-1"
        eventId="event-1"
        title="Sunday"
        start={START}
      />
    </TimezoneProvider>,
    { queryClient },
  );
  await user.click(
    screen.getByRole('button', {
      name: m.event_move_preview_action_label({ title: 'Sunday' }),
    }),
  );
  await user.click(
    screen.getByRole('button', { name: m.event_move_preview_run() }),
  );
  return user;
}

beforeEach(() => {
  previewPlanningEventMove.mockReset();
  movePlanningEvent.mockReset();
});

describe('EventMovePreview', () => {
  it('asks the server for the target start and shows the proposed bounds with no clashes', async () => {
    previewPlanningEventMove.mockResolvedValue(preview([]));

    await openAndPreview();

    expect(previewPlanningEventMove).toHaveBeenCalledWith(
      'cycle-1',
      'event-1',
      { start: START },
    );
    const result = await screen.findByTestId('move-preview-result');
    expect(within(result).getByText(/Welcome/)).toBeInTheDocument();
    expect(
      within(result).getByText(m.event_move_preview_no_clashes()),
    ).toBeInTheDocument();
  });

  it('lists each typed clash with its Volunteer and Ministry', async () => {
    previewPlanningEventMove.mockResolvedValue(
      preview([
        {
          assignmentId: 'a-1',
          eventTimeBlockId: 'block-1',
          shiftId: 's-1',
          volunteer: { id: 'v-1', name: 'Ana' },
          ministry: { id: 'm-1', name: 'Music' },
          proposedStart: '2026-10-20T17:00:00.000Z',
          proposedEnd: '2026-10-20T18:00:00.000Z',
        },
      ]),
    );

    await openAndPreview();

    const clashes = await screen.findByTestId('move-preview-clashes');
    expect(
      within(clashes).getByText(m.event_move_preview_clashes_title_one()),
    ).toBeInTheDocument();
    expect(within(clashes).getByText(/Ana \(Music\)/)).toBeInTheDocument();
  });

  it('shows the server refusal message', async () => {
    previewPlanningEventMove.mockRejectedValue(
      new AxiosError('Conflict', '409', undefined, undefined, {
        status: 409,
        data: { error: 'MOVE_WINDOW_CLOSED', message: 'Janela fechada' },
      } as AxiosResponse),
    );

    await openAndPreview();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Janela fechada',
    );
  });

  it('offers no confirmation before a preview', async () => {
    previewPlanningEventMove.mockResolvedValue(preview([]));
    const user = userEvent.setup();
    renderWithProviders(
      <EventMovePreview
        cycleId="cycle-1"
        eventId="event-1"
        title="Sunday"
        start={START}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: m.event_move_preview_action_label({ title: 'Sunday' }),
      }),
    );

    expect(
      screen.queryByRole('button', { name: m.event_move_confirm() }),
    ).not.toBeInTheDocument();
  });

  it('confirms explicitly, shows the actual withdrawals and refreshes the Cycle and Schedules', async () => {
    previewPlanningEventMove.mockResolvedValue(preview([]));
    movePlanningEvent.mockResolvedValue({
      event: {
        id: 'event-1',
        start: '2026-10-20T17:00:00.000Z',
        end: '2026-10-20T20:00:00.000Z',
      },
      eventTimeBlocks: [],
      // Recalculated: differs from the clash-free preview.
      withdrawn: [ANA_CLASH],
    });
    const queryClient = new QueryClient();
    for (const queryKey of [
      ['cycle-details', 'cycle-1'],
      ['cycles'],
      ['prepare-schedules'],
      ['cycle-builder', 'cycle-1', 'm-1'],
    ]) {
      queryClient.setQueryData(queryKey, {});
    }
    const user = await openAndPreview({ queryClient });
    await screen.findByTestId('move-preview-no-clashes');

    expect(movePlanningEvent).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: m.event_move_confirm() }),
    );

    expect(movePlanningEvent).toHaveBeenCalledWith('cycle-1', 'event-1', {
      start: START,
    });
    const done = await screen.findByTestId('move-result');
    expect(
      within(done).getByText(m.event_move_withdrawn_title_one()),
    ).toBeInTheDocument();
    expect(within(done).getByText(/Ana \(Music\)/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.event_move_confirm() }),
    ).not.toBeInTheDocument();
    for (const queryKey of [
      ['cycle-details', 'cycle-1'],
      ['cycles'],
      ['prepare-schedules'],
      ['cycle-builder', 'cycle-1', 'm-1'],
    ]) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
  });

  it('says when nothing was withdrawn', async () => {
    previewPlanningEventMove.mockResolvedValue(preview([ANA_CLASH]));
    movePlanningEvent.mockResolvedValue({
      event: {
        id: 'event-1',
        start: '2026-10-20T17:00:00.000Z',
        end: '2026-10-20T20:00:00.000Z',
      },
      eventTimeBlocks: [],
      withdrawn: [],
    });
    const user = await openAndPreview();
    await screen.findByTestId('move-preview-clashes');

    await user.click(
      screen.getByRole('button', { name: m.event_move_confirm() }),
    );

    const done = await screen.findByTestId('move-result');
    expect(
      within(done).getByText(m.event_move_withdrawn_none()),
    ).toBeInTheDocument();
  });

  it('shows the confirm refusal message and keeps the dialog open', async () => {
    previewPlanningEventMove.mockResolvedValue(preview([]));
    movePlanningEvent.mockRejectedValue(
      new AxiosError('Conflict', '409', undefined, undefined, {
        status: 409,
        data: { error: 'MOVE_WINDOW_CLOSED', message: 'Janela fechada' },
      } as AxiosResponse),
    );
    const user = await openAndPreview();
    await screen.findByTestId('move-preview-no-clashes');

    await user.click(
      screen.getByRole('button', { name: m.event_move_confirm() }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Janela fechada',
    );
    expect(screen.queryByTestId('move-result')).not.toBeInTheDocument();
  });
});

describe('EventMovePreview for one EventTimeBlock', () => {
  it('previews and confirms through the nested block endpoints, never the Event ones', async () => {
    previewPlanningEventTimeBlockMove.mockResolvedValue(preview([]));
    movePlanningEventTimeBlock.mockResolvedValue({
      event: { start: START, end: '2026-10-20T20:00:00.000Z' },
      eventTimeBlocks: [],
      withdrawn: [ANA_CLASH],
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();
    renderWithProviders(
      <TimezoneProvider churchTimezone="America/Sao_Paulo">
        <EventMovePreview
          cycleId="cycle-1"
          eventId="event-1"
          eventTimeBlockId="block-1"
          title="Sunday · Welcome"
          start={START}
        />
      </TimezoneProvider>,
      { queryClient },
    );
    await user.click(
      screen.getByRole('button', {
        name: m.event_move_preview_action_label({ title: 'Sunday · Welcome' }),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.event_move_preview_run() }),
    );
    await screen.findByTestId('move-preview-result');
    await user.click(
      screen.getByRole('button', { name: m.event_move_confirm() }),
    );

    expect(previewPlanningEventTimeBlockMove).toHaveBeenCalledWith(
      'cycle-1',
      'event-1',
      'block-1',
      { start: START },
    );
    expect(movePlanningEventTimeBlock).toHaveBeenCalledWith(
      'cycle-1',
      'event-1',
      'block-1',
      { start: START },
    );
    expect(previewPlanningEventMove).not.toHaveBeenCalled();
    expect(movePlanningEvent).not.toHaveBeenCalled();
    const result = await screen.findByTestId('move-result');
    expect(within(result).getByText(/Ana \(Music\)/)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-details', 'cycle-1'],
    });
  });
});
