import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEditPreview } from '@/features/scheduling/components/planning-admin/event-edit-preview';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { renderWithProviders } from '@/tests/setup/render';

const previewPlanningEventEdit = vi.fn();
const editPlanningEvent = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    previewPlanningEventEdit: (...args: unknown[]) =>
      previewPlanningEventEdit(...args),
    editPlanningEvent: (...args: unknown[]) => editPlanningEvent(...args),
  },
}));

const START = '2026-10-18T12:00:00.000Z' as Instant;
const END = '2026-10-18T15:00:00.000Z';
const BLOCK_END = '2026-10-18T13:00:00.000Z';

const BLOCKS = [
  {
    eventTimeBlockId: 'block-1',
    label: 'Welcome',
    startTime: START,
    endTime: BLOCK_END,
    status: 'active' as const,
    isOnlyEventTimeBlockInEvent: false,
  },
  {
    eventTimeBlockId: 'block-2',
    label: 'Cancelled one',
    startTime: START,
    endTime: BLOCK_END,
    status: 'cancelled' as const,
    isOnlyEventTimeBlockInEvent: false,
  },
];

const ANA_CLASH = {
  assignmentId: 'a-1',
  eventTimeBlockId: 'block-1',
  shiftId: 's-1',
  volunteer: { id: 'v-1', name: 'Ana' },
  ministry: { id: 'm-1', name: 'Music' },
  proposedStart: START,
  proposedEnd: BLOCK_END,
};

function preview(clashes: unknown[]) {
  return {
    event: {
      previous: { start: START, end: END },
      proposed: { start: START, end: END },
    },
    eventTimeBlocks: [
      {
        id: 'block-1',
        label: 'Welcome',
        change: 'kept',
        previous: { start: START, end: BLOCK_END },
        proposed: { start: START, end: BLOCK_END },
      },
    ],
    clashes,
  };
}

async function openAndPreview() {
  const user = userEvent.setup();
  renderWithProviders(
    <TimezoneProvider churchTimezone="America/Sao_Paulo">
      <EventEditPreview
        cycleId="cycle-1"
        eventId="event-1"
        title="Sunday"
        start={START}
        end={END as Instant}
        eventTimeBlocks={BLOCKS}
      />
    </TimezoneProvider>,
  );
  await user.click(
    screen.getByRole('button', {
      name: m.event_edit_preview_action_label({ title: 'Sunday' }),
    }),
  );
  await user.click(
    screen.getByRole('button', { name: m.event_edit_preview_run() }),
  );
  return user;
}

beforeEach(() => {
  previewPlanningEventEdit.mockReset();
  editPlanningEvent.mockReset();
});

describe('EventEditPreview', () => {
  it('previews the current bounds and active blocks, leaving cancelled blocks out', async () => {
    previewPlanningEventEdit.mockResolvedValue(preview([]));

    await openAndPreview();

    expect(previewPlanningEventEdit).toHaveBeenCalledWith(
      'cycle-1',
      'event-1',
      {
        start: START,
        end: END,
        eventTimeBlocks: [
          {
            id: 'block-1',
            label: 'Welcome',
            startTime: START,
            endTime: BLOCK_END,
          },
        ],
      },
    );
    const result = await screen.findByTestId('edit-preview-result');
    expect(
      within(result).getByText(m.event_move_preview_no_clashes()),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: m.event_edit_confirm() }),
    ).toBeInTheDocument();
  });

  it('adds a block without an id and lists the typed clashes before confirming', async () => {
    previewPlanningEventEdit.mockResolvedValue(preview([ANA_CLASH]));
    const user = userEvent.setup();
    renderWithProviders(
      <TimezoneProvider churchTimezone="America/Sao_Paulo">
        <EventEditPreview
          cycleId="cycle-1"
          eventId="event-1"
          title="Sunday"
          start={START}
          end={END as Instant}
          eventTimeBlocks={BLOCKS}
        />
      </TimezoneProvider>,
    );
    await user.click(
      screen.getByRole('button', {
        name: m.event_edit_preview_action_label({ title: 'Sunday' }),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.event_edit_preview_block_add() }),
    );
    await user.click(
      screen.getByRole('button', { name: m.event_edit_preview_run() }),
    );

    const [, , body] = previewPlanningEventEdit.mock.calls[0];
    expect(body.eventTimeBlocks).toHaveLength(2);
    expect(body.eventTimeBlocks[1]).not.toHaveProperty('id');
    expect(body.eventTimeBlocks[1].label).toBe(
      m.event_edit_preview_block_new_label(),
    );
    const clashes = await screen.findByTestId('move-preview-clashes');
    expect(within(clashes).getByText(/Ana/)).toBeInTheDocument();
    expect(within(clashes).getByText(/Music/)).toBeInTheDocument();
  });

  it('applies the previewed edit and shows what the server withdrew', async () => {
    previewPlanningEventEdit.mockResolvedValue(preview([ANA_CLASH]));
    editPlanningEvent.mockResolvedValue({
      event: { start: START, end: END },
      eventTimeBlocks: [],
      withdrawn: [ANA_CLASH],
    });

    const user = await openAndPreview();
    await user.click(
      await screen.findByRole('button', { name: m.event_edit_confirm() }),
    );

    expect(editPlanningEvent).toHaveBeenCalledWith(
      'cycle-1',
      'event-1',
      previewPlanningEventEdit.mock.calls[0][2],
    );
    const done = await screen.findByTestId('edit-result');
    expect(within(done).getByText(/Ana/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.event_edit_confirm() }),
    ).not.toBeInTheDocument();
  });

  it('asks for a new preview once a field changes after previewing', async () => {
    previewPlanningEventEdit.mockResolvedValue(preview([]));

    const user = await openAndPreview();
    await screen.findByRole('button', { name: m.event_edit_confirm() });
    await user.clear(
      screen.getByLabelText(m.event_edit_preview_block_label({ position: 1 })),
    );
    await user.type(
      screen.getByLabelText(m.event_edit_preview_block_label({ position: 1 })),
      'Praise',
    );

    expect(
      screen.queryByRole('button', { name: m.event_edit_confirm() }),
    ).not.toBeInTheDocument();
  });
});
