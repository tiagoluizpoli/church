import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
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

function renderEditor() {
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
}

async function openEditor() {
  const user = userEvent.setup();
  renderEditor();
  await user.click(
    screen.getByRole('button', {
      name: m.event_edit_preview_action_label({ title: 'Sunday' }),
    }),
  );
  return user;
}

type User = Awaited<ReturnType<typeof openEditor>>;

async function renameFirstBlock(user: User, name: string) {
  const input = screen.getByLabelText(
    m.event_edit_preview_block_label({ position: 1 }),
  );
  await user.clear(input);
  await user.type(input, name);
}

interface TypeTimeInput {
  user: User;
  testId: string;
  time: string;
}

async function typeTime({ user, testId, time }: TypeTimeInput) {
  const [hour] = within(screen.getByTestId(testId)).getAllByRole('spinbutton');
  hour?.focus();
  await user.keyboard(time.replace(':', ''));
}

/** Opens, makes one change (so the edit is confirmable) and previews. */
async function openAndPreview() {
  const user = await openEditor();
  await renameFirstBlock(user, 'Praise');
  await user.click(
    screen.getByRole('button', { name: m.event_edit_preview_run() }),
  );
  return user;
}

function refusal(data: unknown) {
  return new AxiosError('refused', '422', undefined, undefined, {
    status: 422,
    data,
  } as AxiosResponse);
}

beforeEach(() => {
  previewPlanningEventEdit.mockReset();
  editPlanningEvent.mockReset();
});

describe('EventEditPreview', () => {
  it('previews the current bounds and active blocks, leaving cancelled blocks out', async () => {
    previewPlanningEventEdit.mockResolvedValue(preview([]));

    const user = await openEditor();
    await user.click(
      screen.getByRole('button', { name: m.event_edit_preview_run() }),
    );

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
    // Nothing was changed: nothing to confirm.
    const result = await screen.findByTestId('edit-preview-result');
    expect(
      within(result).getByText(m.event_edit_preview_unchanged()),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.event_edit_confirm() }),
    ).not.toBeInTheDocument();
  });

  it('shows each changed line as before → after, marking only the changed part, with the no-conflict status', async () => {
    previewPlanningEventEdit.mockResolvedValue({
      ...preview([]),
      event: {
        previous: { start: START, end: END },
        proposed: { start: START, end: '2026-10-18T16:00:00.000Z' },
      },
    });

    const user = await openEditor();
    await typeTime({ user, testId: 'event-edit-end-time', time: '13:00' });
    await user.click(
      screen.getByRole('button', { name: m.event_edit_preview_run() }),
    );

    const result = await screen.findByTestId('edit-preview-result');
    expect(within(result).getByRole('deletion')).toHaveTextContent(
      '18/10/2026 09:00 – 12:00',
    );
    // Only the end moved, so only the end is marked as new.
    expect(within(result).getByRole('insertion')).toHaveTextContent(/^13:00$/);
    expect(
      within(result).getByText(m.event_move_preview_no_clashes()),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: m.event_edit_confirm() }),
    ).toBeInTheDocument();
  });

  it('shows the Event date once and a same-day block as times, revealing its dates on Outro dia', async () => {
    const user = await openEditor();
    // The dialog focuses its first field a frame later; wait so it can't pull focus back.
    await vi.waitFor(() =>
      expect(screen.getByTestId('event-edit-start-date')).toHaveFocus(),
    );

    expect(screen.getByTestId('event-edit-start-date')).toBeInTheDocument();
    expect(screen.getByTestId('event-edit-end-time')).toBeInTheDocument();
    expect(screen.queryByTestId('event-edit-end-date')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('event-edit-block-1-start-time'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('event-edit-block-1-start-date'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: m.event_edit_preview_other_day_block({ position: 1 }),
      }),
    );

    expect(screen.getByTestId('event-edit-block-1-start-date')).toHaveFocus();
    expect(
      screen.getByTestId('event-edit-block-1-end-date'),
    ).toBeInTheDocument();
  });

  it('flags a block ending before it starts under that pair and holds the preview', async () => {
    const user = await openEditor();

    await typeTime({
      user,
      testId: 'event-edit-block-1-end-time',
      time: '08:30',
    });

    const message = screen.getByText(m.error_validation_invalid_event_bounds());
    const [endHour] = within(
      screen.getByTestId('event-edit-block-1-end-time'),
    ).getAllByRole('spinbutton');
    expect(endHour).toHaveAttribute('aria-invalid', 'true');
    // React Aria prefixes its own "Selected Time" description.
    expect(endHour).toHaveAccessibleDescription(
      expect.stringContaining(m.error_validation_invalid_event_bounds()),
    );
    expect(message).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.event_edit_preview_run() }),
    ).toBeDisabled();
  });

  it('places a server refusal naming a block time under that block', async () => {
    previewPlanningEventEdit.mockRejectedValue(
      refusal({
        error: 'VALIDATION_ERROR',
        field: 'eventTimeBlocks.0.endTime',
        message: 'O bloco precisa caber no evento.',
      }),
    );

    await openAndPreview();

    await vi.waitFor(() => {
      const [endHour] = within(
        screen.getByTestId('event-edit-block-1-end-time'),
      ).getAllByRole('spinbutton');
      expect(endHour).toHaveAccessibleDescription(
        expect.stringContaining('O bloco precisa caber no evento.'),
      );
      expect(endHour).toHaveAttribute('aria-invalid', 'true');
    });
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
      'Worship',
    );

    expect(
      screen.queryByRole('button', { name: m.event_edit_confirm() }),
    ).not.toBeInTheDocument();
  });
});
