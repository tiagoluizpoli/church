import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventMovePreview } from '@/features/scheduling/components/planning-admin/event-move-preview';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { renderWithProviders } from '@/tests/setup/render';

const previewPlanningEventMove = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    previewPlanningEventMove: (...args: unknown[]) =>
      previewPlanningEventMove(...args),
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

async function openAndPreview() {
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
});
